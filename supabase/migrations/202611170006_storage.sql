INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'place-photos',
  'place-photos',
  false,
  8388608,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  4194304,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY place_photo_objects_public_or_owner_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (
    bucket_id = 'place-photos'
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1 FROM public.places p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND (p.status = 'approved' OR p.author_id = auth.uid() OR public.is_admin())
      )
      ELSE false
    END
  );

CREATE POLICY place_photo_objects_insert_pending_owner
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'place-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1 FROM public.places p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND p.author_id = auth.uid()
          AND p.status = 'pending'
      )
      ELSE false
    END
  );

CREATE POLICY place_photo_objects_update_pending_owner
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'place-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1 FROM public.places p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND p.author_id = auth.uid()
          AND p.status = 'pending'
      )
      ELSE false
    END
  )
  WITH CHECK (
    bucket_id = 'place-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1 FROM public.places p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND p.author_id = auth.uid()
          AND p.status = 'pending'
      )
      ELSE false
    END
  );

CREATE POLICY place_photo_objects_delete_pending_owner
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'place-photos'
    AND (storage.foldername(name))[2] = auth.uid()::text
    AND CASE
      WHEN (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      THEN EXISTS (
        SELECT 1 FROM public.places p
        WHERE p.id = ((storage.foldername(name))[1])::uuid
          AND p.author_id = auth.uid()
          AND p.status = 'pending'
      )
      ELSE false
    END
  );

CREATE POLICY avatar_objects_public_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'avatars');
CREATE POLICY avatar_objects_insert_owner
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY avatar_objects_update_owner
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
CREATE POLICY avatar_objects_delete_owner
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
