INSERT INTO storage.buckets (id, name, public) 
VALUES ('public-assets', 'public-assets', true) 
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Super admins can upload campaign images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'public-assets' AND (storage.foldername(name))[1] = 'wa-campaigns');

CREATE POLICY "Public read access for public-assets"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'public-assets');