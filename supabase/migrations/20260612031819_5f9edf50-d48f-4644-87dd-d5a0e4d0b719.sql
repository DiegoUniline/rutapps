
-- 1) Fix wrong profile join (profiles.id -> profiles.user_id)
DROP POLICY IF EXISTS "Tenant manage import_jobs" ON public.import_jobs;
CREATE POLICY "Tenant manage import_jobs" ON public.import_jobs
  FOR ALL TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
              OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant manage import_job_lineas" ON public.import_job_lineas;
CREATE POLICY "Tenant manage import_job_lineas" ON public.import_job_lineas
  FOR ALL TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
              OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "metas_venta tenant access" ON public.metas_venta;
CREATE POLICY "metas_venta tenant access" ON public.metas_venta
  FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
              OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant manage producto_equivalencias" ON public.producto_equivalencias;
CREATE POLICY "Tenant manage producto_equivalencias" ON public.producto_equivalencias
  FOR ALL TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
         OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid())
              OR public.is_super_admin(auth.uid()));

-- 2) Cupones: remove blanket SELECT for authenticated
DROP POLICY IF EXISTS cupones_select_authenticated ON public.cupones;

-- 3) wa_optouts: restrict SELECT to super admins only
DROP POLICY IF EXISTS "Authenticated can read wa_optouts" ON public.wa_optouts;
CREATE POLICY "Super admins read wa_optouts" ON public.wa_optouts
  FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- 4) Notifications: restrict mutations to super admins only (read still tenant-scoped)
DROP POLICY IF EXISTS "Admins manage notifications" ON public.notifications;

-- 5) Storage: empresa-assets — scope writes to caller's empresa folder
DROP POLICY IF EXISTS "Authenticated users can upload empresa assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update empresa assets" ON storage.objects;

CREATE POLICY "Tenant can upload empresa assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'empresa-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant can update empresa assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'empresa-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'empresa-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Tenant can delete empresa assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'empresa-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- 6) Storage: ruta-fotos — scope writes to caller's empresa folder
DROP POLICY IF EXISTS ruta_fotos_authenticated_insert ON storage.objects;
DROP POLICY IF EXISTS ruta_fotos_authenticated_update ON storage.objects;
DROP POLICY IF EXISTS ruta_fotos_authenticated_delete ON storage.objects;

CREATE POLICY ruta_fotos_tenant_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'ruta-fotos'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ruta_fotos_tenant_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'ruta-fotos'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'ruta-fotos'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

CREATE POLICY ruta_fotos_tenant_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'ruta-fotos'
    AND (storage.foldername(name))[1] IN (
      SELECT empresa_id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );
