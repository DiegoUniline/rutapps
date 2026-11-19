-- Create bucket for notification images
INSERT INTO storage.buckets (id, name, public) VALUES ('notification-images', 'notification-images', true);

-- Allow super admins to upload
CREATE POLICY "Super admins upload notification images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'notification-images' AND is_super_admin(auth.uid())
);

-- Allow super admins to update
CREATE POLICY "Super admins update notification images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'notification-images' AND is_super_admin(auth.uid())
);

-- Allow super admins to delete
CREATE POLICY "Super admins delete notification images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'notification-images' AND is_super_admin(auth.uid())
);

-- Public read for everyone
CREATE POLICY "Public read notification images"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'notification-images');
