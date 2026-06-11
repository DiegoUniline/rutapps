
CREATE POLICY "recibos_cobros_select_empresa" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'recibos-cobros'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recibos_cobros_insert_empresa" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recibos-cobros'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "recibos_cobros_update_empresa" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recibos-cobros'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE id = auth.uid()
    )
  );
