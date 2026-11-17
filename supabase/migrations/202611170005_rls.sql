ALTER TABLE public.countries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counties ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.towns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.place_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moderation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY countries_read_public
  ON public.countries FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY countries_admin_manage
  ON public.countries FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY counties_read_public
  ON public.counties FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY counties_admin_manage
  ON public.counties FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY towns_read_public
  ON public.towns FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY towns_admin_manage
  ON public.towns FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY profiles_read_public
  ON public.profiles FOR SELECT TO anon, authenticated
  USING (true);
CREATE POLICY profiles_insert_self
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());
CREATE POLICY profiles_update_self
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_admin_manage
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY user_roles_read_self_or_admin
  ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY categories_read_active
  ON public.categories FOR SELECT TO anon, authenticated
  USING (is_active);
CREATE POLICY categories_admin_manage
  ON public.categories FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY places_read_approved_owner_or_admin
  ON public.places FOR SELECT TO anon, authenticated
  USING (status = 'approved' OR author_id = auth.uid() OR public.is_admin());
CREATE POLICY places_insert_pending_self
  ON public.places FOR INSERT TO authenticated
  WITH CHECK (
    author_id = auth.uid()
    AND status = 'pending'
    AND rejection_reason IS NULL
  );
CREATE POLICY places_update_own_pending
  ON public.places FOR UPDATE TO authenticated
  USING (author_id = auth.uid() AND status = 'pending')
  WITH CHECK (author_id = auth.uid() AND status = 'pending');
CREATE POLICY places_delete_own_pending
  ON public.places FOR DELETE TO authenticated
  USING (author_id = auth.uid() AND status = 'pending');
CREATE POLICY places_admin_manage
  ON public.places FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY place_photos_read_by_place_visibility
  ON public.place_photos FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id
        AND (p.status = 'approved' OR p.author_id = auth.uid() OR public.is_admin())
    )
  );
CREATE POLICY place_photos_insert_for_own_pending_place
  ON public.place_photos FOR INSERT TO authenticated
  WITH CHECK (
    storage_path LIKE (place_id::text || '/' || auth.uid()::text || '/%')
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.author_id = auth.uid() AND p.status = 'pending'
    )
  );
CREATE POLICY place_photos_update_for_own_pending_place
  ON public.place_photos FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.author_id = auth.uid() AND p.status = 'pending'
    )
  )
  WITH CHECK (
    storage_path LIKE (place_id::text || '/' || auth.uid()::text || '/%')
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.author_id = auth.uid() AND p.status = 'pending'
    )
  );
CREATE POLICY place_photos_delete_for_own_pending_place
  ON public.place_photos FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.author_id = auth.uid() AND p.status = 'pending'
    )
  );
CREATE POLICY place_photos_admin_manage
  ON public.place_photos FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY ratings_read_public_or_self
  ON public.ratings FOR SELECT TO anon, authenticated
  USING (
    user_id = auth.uid()
    OR public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY ratings_insert_self_on_approved_place
  ON public.ratings FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY ratings_update_self_on_approved_place
  ON public.ratings FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY ratings_delete_self
  ON public.ratings FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY ratings_admin_manage
  ON public.ratings FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY comments_read_visible_or_self
  ON public.comments FOR SELECT TO anon, authenticated
  USING (
    (NOT hidden AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    ))
    OR user_id = auth.uid()
    OR public.is_admin()
  );
CREATE POLICY comments_insert_self_on_approved_place
  ON public.comments FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND hidden = false
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY comments_update_self_visible
  ON public.comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND hidden = false)
  WITH CHECK (user_id = auth.uid() AND hidden = false);
CREATE POLICY comments_delete_self
  ON public.comments FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY comments_admin_manage
  ON public.comments FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY likes_read_approved_places
  ON public.likes FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY likes_insert_self_on_approved_place
  ON public.likes FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY likes_delete_self
  ON public.likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY likes_admin_manage
  ON public.likes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY bookmarks_read_self
  ON public.bookmarks FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY bookmarks_insert_self_on_approved_place
  ON public.bookmarks FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.places p
      WHERE p.id = place_id AND p.status = 'approved'
    )
  );
CREATE POLICY bookmarks_delete_self
  ON public.bookmarks FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY bookmarks_admin_manage
  ON public.bookmarks FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY reports_read_own_or_admin
  ON public.reports FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_admin());
CREATE POLICY reports_insert_self_open
  ON public.reports FOR INSERT TO authenticated
  WITH CHECK (reporter_id = auth.uid() AND status = 'open');
CREATE POLICY reports_admin_manage
  ON public.reports FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY notifications_read_self
  ON public.notifications FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
CREATE POLICY notifications_update_self
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
CREATE POLICY notifications_admin_manage
  ON public.notifications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

CREATE POLICY moderation_logs_admin_read
  ON public.moderation_logs FOR SELECT TO authenticated
  USING (public.is_admin());
CREATE POLICY moderation_logs_admin_manage
  ON public.moderation_logs FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
