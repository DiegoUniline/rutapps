-- Facturación · Fase 0-B (D-013, S-09): las empresas solo escriben BORRADORES.
-- Un CFDI timbrado/cancelado (facturama_id, folio_fiscal, status) solo lo escribe la
-- función facturama con service_role (que no pasa por RLS). Antes la política
-- FOR ALL dejaba a cualquier usuario de la empresa insertar o editar filas
-- "timbrado" o poner el facturama_id de otra empresa y cancelarla.
-- Se reemplazan TODAS las políticas de estas 4 tablas (también las que no estén en el repo).

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies
           WHERE schemaname = 'public' AND tablename IN ('cfdis','cfdi_lineas','cfdi_pagos','cfdi_pago_documentos')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.cfdis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfdi_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfdi_pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cfdi_pago_documentos ENABLE ROW LEVEL SECURITY;

-- ── cfdis ─────────────────────────────────────────────────────────────
CREATE POLICY cfdis_select ON public.cfdis FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())) OR empresa_id = (SELECT public.get_my_empresa_id()));

CREATE POLICY cfdis_insert_borrador ON public.cfdis FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_super_admin(auth.uid()))
    OR (empresa_id = (SELECT public.get_my_empresa_id()) AND status = 'borrador'
        AND facturama_id IS NULL AND folio_fiscal IS NULL));

CREATE POLICY cfdis_update_borrador ON public.cfdis FOR UPDATE TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid()))
    OR (empresa_id = (SELECT public.get_my_empresa_id()) AND status = 'borrador' AND facturama_id IS NULL))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid()))
    OR (empresa_id = (SELECT public.get_my_empresa_id()) AND status = 'borrador'
        AND facturama_id IS NULL AND folio_fiscal IS NULL));

CREATE POLICY cfdis_delete_borrador ON public.cfdis FOR DELETE TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid()))
    OR (empresa_id = (SELECT public.get_my_empresa_id()) AND status IN ('borrador','error') AND facturama_id IS NULL));

-- ── cfdi_lineas (siguen a su CFDI) ────────────────────────────────────
CREATE POLICY cfdi_lineas_select ON public.cfdi_lineas FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.cfdis c WHERE c.id = cfdi_lineas.cfdi_id AND c.empresa_id = (SELECT public.get_my_empresa_id())));

CREATE POLICY cfdi_lineas_write_borrador ON public.cfdi_lineas FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.cfdis c WHERE c.id = cfdi_lineas.cfdi_id AND c.empresa_id = (SELECT public.get_my_empresa_id())
               AND c.status = 'borrador' AND c.facturama_id IS NULL))
  WITH CHECK ((SELECT public.is_super_admin(auth.uid()))
    OR EXISTS (SELECT 1 FROM public.cfdis c WHERE c.id = cfdi_lineas.cfdi_id AND c.empresa_id = (SELECT public.get_my_empresa_id())
               AND c.status = 'borrador' AND c.facturama_id IS NULL));

-- ── cfdi_pagos / cfdi_pago_documentos: solo lectura para la empresa ────
CREATE POLICY cfdi_pagos_select ON public.cfdi_pagos FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())) OR empresa_id = (SELECT public.get_my_empresa_id()));
CREATE POLICY cfdi_pagos_super_admin ON public.cfdi_pagos FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid()))) WITH CHECK ((SELECT public.is_super_admin(auth.uid())));

CREATE POLICY cfdi_pago_documentos_select ON public.cfdi_pago_documentos FOR SELECT TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid())) OR empresa_id = (SELECT public.get_my_empresa_id()));
CREATE POLICY cfdi_pago_documentos_super_admin ON public.cfdi_pago_documentos FOR ALL TO authenticated
  USING ((SELECT public.is_super_admin(auth.uid()))) WITH CHECK ((SELECT public.is_super_admin(auth.uid())));
