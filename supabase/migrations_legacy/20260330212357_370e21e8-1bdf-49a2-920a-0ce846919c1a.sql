
-- =============================================
-- #8: Fix auditorias RLS — restrict SELECT to tenant
-- =============================================

-- Drop the overly permissive policies
DROP POLICY IF EXISTS "Public read open auditorias" ON public.auditorias;
DROP POLICY IF EXISTS "Public read auditoria lineas" ON public.auditoria_lineas;

-- Replace with tenant-scoped policies
CREATE POLICY "Tenant read auditorias"
ON public.auditorias
FOR SELECT
TO authenticated
USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

CREATE POLICY "Tenant read auditoria_lineas"
ON public.auditoria_lineas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM auditorias a
    WHERE a.id = auditoria_lineas.auditoria_id
    AND (a.empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  )
);

-- =============================================
-- #10: Fix auditoria_escaneos INSERT — validate tenant
-- =============================================

DROP POLICY IF EXISTS "Public insert scans" ON public.auditoria_escaneos;

CREATE POLICY "Tenant insert scans"
ON public.auditoria_escaneos
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM auditorias a
    WHERE a.id = auditoria_escaneos.auditoria_id
    AND a.empresa_id = get_my_empresa_id()
    AND a.status IN ('pendiente', 'en_proceso')
  )
);
