
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS uso_cfdi text,
  ADD COLUMN IF NOT EXISTS forma_pago_sat text,
  ADD COLUMN IF NOT EXISTS metodo_pago_sat text,
  ADD COLUMN IF NOT EXISTS email_facturacion text,
  ADD COLUMN IF NOT EXISTS email_cc_facturacion text,
  ADD COLUMN IF NOT EXISTS csf_url text;

DROP POLICY IF EXISTS "csf_select_own_empresa" ON storage.objects;
CREATE POLICY "csf_select_own_empresa" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'csf'
  AND (storage.foldername(name))[1] IN (
    SELECT p.empresa_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "csf_insert_own_empresa" ON storage.objects;
CREATE POLICY "csf_insert_own_empresa" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'csf'
  AND (storage.foldername(name))[1] IN (
    SELECT p.empresa_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "csf_update_own_empresa" ON storage.objects;
CREATE POLICY "csf_update_own_empresa" ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'csf'
  AND (storage.foldername(name))[1] IN (
    SELECT p.empresa_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);

DROP POLICY IF EXISTS "csf_delete_own_empresa" ON storage.objects;
CREATE POLICY "csf_delete_own_empresa" ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'csf'
  AND (storage.foldername(name))[1] IN (
    SELECT p.empresa_id::text FROM public.profiles p WHERE p.id = auth.uid()
  )
);
