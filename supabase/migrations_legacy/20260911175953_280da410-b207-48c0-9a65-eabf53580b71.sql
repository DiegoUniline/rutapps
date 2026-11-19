DROP POLICY IF EXISTS solicitudes_compra_empresa_all ON public.solicitudes_compra;
CREATE POLICY solicitudes_compra_empresa_all ON public.solicitudes_compra
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS solicitud_compra_eventos_empresa_all ON public.solicitud_compra_eventos;
CREATE POLICY solicitud_compra_eventos_empresa_all ON public.solicitud_compra_eventos
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS solicitud_compra_lineas_empresa_all ON public.solicitud_compra_lineas;
CREATE POLICY solicitud_compra_lineas_empresa_all ON public.solicitud_compra_lineas
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.solicitudes_compra s WHERE s.id = solicitud_compra_lineas.solicitud_id AND (s.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.solicitudes_compra s WHERE s.id = solicitud_compra_lineas.solicitud_id AND (s.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes_compra TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitud_compra_lineas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitud_compra_eventos TO authenticated;
GRANT ALL ON public.solicitudes_compra TO service_role;
GRANT ALL ON public.solicitud_compra_lineas TO service_role;
GRANT ALL ON public.solicitud_compra_eventos TO service_role;