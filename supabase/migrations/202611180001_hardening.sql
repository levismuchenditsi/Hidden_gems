-- Hardening pass after Phase 1 audit.
-- Safe to apply on top of migrations 001-007. Does not edit any applied migration.

-- 1. Internal SECURITY DEFINER functions must not be callable through the API (/rpc).
--    Supabase grants EXECUTE on new public functions to anon/authenticated by default.
REVOKE ALL ON FUNCTION public.refresh_place_rating_stats(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_place_like_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_rating_stats_from_rating() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_like_count_from_like() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.protect_place_fields() FROM PUBLIC, anon, authenticated;

-- 2. A duplicate username in signup metadata must never block account creation.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_username text;
  requested_display_name text;
BEGIN
  requested_username := nullif(trim(NEW.raw_user_meta_data ->> 'username'), '');
  IF requested_username IS NOT NULL
     AND requested_username !~ '^[A-Za-z0-9_]{3,30}$' THEN
    requested_username := NULL;
  END IF;
  requested_display_name := left(nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), ''), 80);

  BEGIN
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (NEW.id, requested_username, requested_display_name)
    ON CONFLICT (id) DO NOTHING;
  EXCEPTION WHEN unique_violation THEN
    -- Username already taken: create the profile without one; the user picks another.
    INSERT INTO public.profiles (id, username, display_name)
    VALUES (NEW.id, NULL, requested_display_name)
    ON CONFLICT (id) DO NOTHING;
  END;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;

-- 3. Users must not be able to move ratings or comments to a different place/user/parent.
CREATE OR REPLACE FUNCTION public.lock_rating_keys()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role')
     AND (NEW.place_id IS DISTINCT FROM OLD.place_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'A rating cannot be moved to another place or user';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER ratings_lock_keys
BEFORE UPDATE ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.lock_rating_keys();

CREATE OR REPLACE FUNCTION public.lock_comment_keys()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT (public.is_admin() OR coalesce(auth.role(), '') = 'service_role')
     AND (NEW.place_id IS DISTINCT FROM OLD.place_id
          OR NEW.user_id IS DISTINCT FROM OLD.user_id
          OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN
    RAISE EXCEPTION 'A comment cannot be moved to another place, user, or parent';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER comments_lock_keys
BEFORE UPDATE ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.lock_comment_keys();

-- 4. Users may not delete comments that moderators have hidden (keeps evidence for review).
DROP POLICY IF EXISTS comments_delete_self ON public.comments;
CREATE POLICY comments_delete_self
  ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND hidden = false);

-- 5. Allow the audit/notification types the admin dashboard and rating alerts will need.
ALTER TABLE public.moderation_logs DROP CONSTRAINT IF EXISTS moderation_logs_action_check;
ALTER TABLE public.moderation_logs ADD CONSTRAINT moderation_logs_action_check CHECK (
  action IN ('approve_place', 'reject_place', 'edit_place', 'hide_comment', 'unhide_comment',
             'resolve_report', 'dismiss_report', 'assign_role', 'revoke_role')
);

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_notification_type_check CHECK (
  notification_type IN ('comment', 'reply', 'like', 'bookmark', 'rating',
                        'moderation_approved', 'moderation_rejected')
);

-- 6. Atomic moderation: status change + audit log + author notification in one transaction.
--    The admin UI should call this RPC instead of updating places directly.
CREATE OR REPLACE FUNCTION public.moderate_place(
  p_place_id uuid,
  p_decision text,
  p_reason text DEFAULT NULL
)
RETURNS public.places
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_admin uuid := auth.uid();
  v_old public.places;
  v_new public.places;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
BEGIN
  IF v_admin IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Administrator access required' USING ERRCODE = '42501';
  END IF;
  IF p_decision NOT IN ('approve', 'reject') THEN
    RAISE EXCEPTION 'Decision must be approve or reject';
  END IF;
  IF p_decision = 'reject' AND (v_reason IS NULL OR length(v_reason) < 3) THEN
    RAISE EXCEPTION 'A rejection reason is required';
  END IF;

  SELECT * INTO v_old FROM public.places WHERE id = p_place_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Place not found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.places
  SET status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
      rejection_reason = CASE WHEN p_decision = 'reject' THEN v_reason ELSE NULL END
  WHERE id = p_place_id
  RETURNING * INTO v_new;

  INSERT INTO public.moderation_logs (moderator_id, place_id, action, reason, details)
  VALUES (
    v_admin,
    p_place_id,
    CASE WHEN p_decision = 'approve' THEN 'approve_place' ELSE 'reject_place' END,
    v_reason,
    jsonb_build_object('previous_status', v_old.status, 'new_status', v_new.status)
  );

  INSERT INTO public.notifications (user_id, actor_id, place_id, notification_type, message)
  VALUES (
    v_old.author_id,
    v_admin,
    p_place_id,
    CASE WHEN p_decision = 'approve' THEN 'moderation_approved' ELSE 'moderation_rejected' END,
    CASE WHEN p_decision = 'approve'
         THEN 'Your place "' || left(v_old.title, 80) || '" was approved.'
         ELSE 'Your place "' || left(v_old.title, 80) || '" was not approved: ' || left(v_reason, 300)
    END
  );

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.moderate_place(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_place(uuid, text, text) TO authenticated;