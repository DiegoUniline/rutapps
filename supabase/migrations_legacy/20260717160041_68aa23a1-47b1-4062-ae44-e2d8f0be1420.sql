
CREATE POLICY "Authenticated can upload empresa-assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'empresa-assets');

CREATE POLICY "Authenticated can update empresa-assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'empresa-assets')
WITH CHECK (bucket_id = 'empresa-assets');

CREATE POLICY "Authenticated can delete empresa-assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'empresa-assets');
