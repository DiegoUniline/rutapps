
INSERT INTO storage.buckets (id, name, public) VALUES ('empresa-assets', 'empresa-assets', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can upload empresa assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'empresa-assets');

CREATE POLICY "Authenticated users can update empresa assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'empresa-assets');

CREATE POLICY "Public can view empresa assets"
ON storage.objects FOR SELECT TO public
USING (bucket_id = 'empresa-assets');
