-- Create avatars bucket for user profile photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access (so the photos render in the supervisor map)
CREATE POLICY "Avatars are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

-- Authenticated users can upload to avatars/<their-user-id>/...
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

-- Admins (any authenticated user from the same empresa) can upload/update/delete avatars of teammates
CREATE POLICY "Admins can upload teammate avatars"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles other ON other.empresa_id = me.empresa_id
      WHERE me.user_id = auth.uid()
        AND other.user_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Admins can update teammate avatars"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles other ON other.empresa_id = me.empresa_id
      WHERE me.user_id = auth.uid()
        AND other.user_id::text = (storage.foldername(name))[1]
    )
  );

CREATE POLICY "Admins can delete teammate avatars"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'avatars'
    AND EXISTS (
      SELECT 1 FROM public.profiles me
      JOIN public.profiles other ON other.empresa_id = me.empresa_id
      WHERE me.user_id = auth.uid()
        AND other.user_id::text = (storage.foldername(name))[1]
    )
  );