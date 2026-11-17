CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = auth.uid()
      AND ur.role = 'admin'
  );
$$;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  requested_username text;
BEGIN
  requested_username := nullif(trim(NEW.raw_user_meta_data ->> 'username'), '');
  IF requested_username IS NOT NULL
     AND requested_username !~ '^[A-Za-z0-9_]{3,30}$' THEN
    requested_username := NULL;
  END IF;

  INSERT INTO public.profiles (id, username, display_name)
  VALUES (
    NEW.id,
    requested_username,
    nullif(trim(NEW.raw_user_meta_data ->> 'display_name'), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.validate_place_location_and_county()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  county_country_id uuid;
  place_country_id uuid;
  town_county_id uuid;
BEGIN
  SELECT c.country_id INTO county_country_id
  FROM public.counties c
  WHERE c.id = NEW.county_id;

  SELECT c.id INTO place_country_id
  FROM public.countries c
  WHERE c.code = NEW.country_code;

  SELECT t.county_id INTO town_county_id
  FROM public.towns t
  WHERE t.id = NEW.town_id;

  IF county_country_id IS NULL OR place_country_id IS NULL THEN
    RAISE EXCEPTION 'The selected country or county does not exist';
  END IF;
  IF town_county_id IS DISTINCT FROM NEW.county_id THEN
    RAISE EXCEPTION 'The selected town must belong to the selected county';
  END IF;
  IF county_country_id IS DISTINCT FROM place_country_id THEN
    RAISE EXCEPTION 'The selected county must belong to the selected country';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER places_validate_location_and_county
BEFORE INSERT OR UPDATE OF country_code, county_id, town_id, location
ON public.places
FOR EACH ROW EXECUTE FUNCTION public.validate_place_location_and_county();

CREATE OR REPLACE FUNCTION public.protect_place_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  privileged boolean := coalesce(auth.role(), '') = 'service_role'
    OR public.is_admin()
    OR pg_trigger_depth() > 1;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'pending' OR NEW.rejection_reason IS NOT NULL THEN
      RAISE EXCEPTION 'New places must be pending and have no rejection reason';
    END IF;
    IF NOT privileged AND NEW.author_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'A place author must be the authenticated user';
    END IF;
    NEW.avg_rating := 0;
    NEW.rating_count := 0;
    NEW.like_count := 0;
    RETURN NEW;
  END IF;

  IF NOT privileged THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason THEN
      RAISE EXCEPTION 'Only an administrator can change moderation fields';
    END IF;
    IF NEW.author_id IS DISTINCT FROM OLD.author_id THEN
      RAISE EXCEPTION 'A place author cannot be changed';
    END IF;
    IF NEW.avg_rating IS DISTINCT FROM OLD.avg_rating
       OR NEW.rating_count IS DISTINCT FROM OLD.rating_count
       OR NEW.like_count IS DISTINCT FROM OLD.like_count THEN
      RAISE EXCEPTION 'Place aggregate fields are maintained by database triggers';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER places_protect_fields
BEFORE INSERT OR UPDATE ON public.places
FOR EACH ROW EXECUTE FUNCTION public.protect_place_fields();

CREATE OR REPLACE FUNCTION public.set_comment_depth()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  parent_place_id uuid;
  parent_depth smallint;
BEGIN
  IF NEW.parent_id IS NULL THEN
    NEW.depth := 0;
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'A comment cannot be its own parent';
  END IF;

  SELECT c.place_id, c.depth
  INTO parent_place_id, parent_depth
  FROM public.comments c
  WHERE c.id = NEW.parent_id;

  IF parent_place_id IS NULL THEN
    RAISE EXCEPTION 'The parent comment does not exist';
  END IF;
  IF parent_place_id IS DISTINCT FROM NEW.place_id THEN
    RAISE EXCEPTION 'A reply must belong to the same place as its parent';
  END IF;
  IF parent_depth >= 2 THEN
    RAISE EXCEPTION 'Comment reply depth cannot exceed two';
  END IF;

  NEW.depth := parent_depth + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER comments_set_depth
BEFORE INSERT OR UPDATE OF parent_id, place_id ON public.comments
FOR EACH ROW EXECUTE FUNCTION public.set_comment_depth();

CREATE OR REPLACE FUNCTION public.refresh_place_rating_stats(target_place_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count integer;
  current_average numeric(3, 2);
BEGIN
  PERFORM 1 FROM public.places WHERE id = target_place_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::integer, coalesce(round(avg(r.rating)::numeric, 2), 0)
  INTO current_count, current_average
  FROM public.ratings r
  WHERE r.place_id = target_place_id;

  UPDATE public.places
  SET rating_count = current_count,
      avg_rating = current_average,
      updated_at = now()
  WHERE id = target_place_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_rating_stats_from_rating()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_place_rating_stats(OLD.place_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.refresh_place_rating_stats(OLD.place_id);
    IF NEW.place_id IS DISTINCT FROM OLD.place_id THEN
      PERFORM public.refresh_place_rating_stats(NEW.place_id);
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.refresh_place_rating_stats(NEW.place_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER ratings_refresh_place_stats
AFTER INSERT OR UPDATE OR DELETE ON public.ratings
FOR EACH ROW EXECUTE FUNCTION public.refresh_rating_stats_from_rating();

CREATE OR REPLACE FUNCTION public.refresh_place_like_count(target_place_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_count integer;
BEGIN
  PERFORM 1 FROM public.places WHERE id = target_place_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT count(*)::integer INTO current_count
  FROM public.likes l
  WHERE l.place_id = target_place_id;

  UPDATE public.places
  SET like_count = current_count,
      updated_at = now()
  WHERE id = target_place_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_like_count_from_like()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.refresh_place_like_count(OLD.place_id);
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM public.refresh_place_like_count(OLD.place_id);
    IF NEW.place_id IS DISTINCT FROM OLD.place_id THEN
      PERFORM public.refresh_place_like_count(NEW.place_id);
    END IF;
    RETURN NEW;
  END IF;

  PERFORM public.refresh_place_like_count(NEW.place_id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER likes_refresh_place_count
AFTER INSERT OR UPDATE OR DELETE ON public.likes
FOR EACH ROW EXECUTE FUNCTION public.refresh_like_count_from_like();

CREATE OR REPLACE FUNCTION public.protect_notification_content()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin()
     AND coalesce(auth.role(), '') <> 'service_role'
     AND ROW(
       NEW.user_id, NEW.actor_id, NEW.place_id, NEW.comment_id,
       NEW.notification_type, NEW.message, NEW.created_at
     ) IS DISTINCT FROM ROW(
       OLD.user_id, OLD.actor_id, OLD.place_id, OLD.comment_id,
       OLD.notification_type, OLD.message, OLD.created_at
     ) THEN
    RAISE EXCEPTION 'Users may only mark their own notifications as read';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER notifications_protect_content
BEFORE UPDATE ON public.notifications
FOR EACH ROW EXECUTE FUNCTION public.protect_notification_content();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'countries', 'counties', 'towns', 'profiles', 'user_roles', 'categories',
    'places', 'place_photos', 'ratings', 'comments', 'likes', 'bookmarks',
    'reports', 'notifications', 'moderation_logs'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_name || '_set_updated_at',
      table_name
    );
  END LOOP;
END;
$$;
