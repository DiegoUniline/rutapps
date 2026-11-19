DROP POLICY IF EXISTS "Tenant manage import_jobs" ON public.import_jobs;
CREATE POLICY "Tenant manage import_jobs" ON public.import_jobs
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant manage import_job_lineas" ON public.import_job_lineas;
CREATE POLICY "Tenant manage import_job_lineas" ON public.import_job_lineas
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Tenant manage producto_equivalencias" ON public.producto_equivalencias;
CREATE POLICY "Tenant manage producto_equivalencias" ON public.producto_equivalencias
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));