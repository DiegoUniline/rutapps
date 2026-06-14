-- Fix RLS for cotizaciones to match ventas pattern
DROP POLICY IF EXISTS "cotizaciones empresa access" ON public.cotizaciones;
DROP POLICY IF EXISTS "cotizaciones public token read" ON public.cotizaciones;
DROP POLICY IF EXISTS "cotlineas empresa access" ON public.cotizacion_lineas;
DROP POLICY IF EXISTS "cotlineas public read" ON public.cotizacion_lineas;

CREATE POLICY "Tenant isolation" ON public.cotizaciones
  FOR ALL TO authenticated
  USING ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))
  WITH CHECK ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()));

CREATE POLICY "Public token read" ON public.cotizaciones
  FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Tenant isolation lineas" ON public.cotizacion_lineas
  FOR ALL TO authenticated
  USING ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()))
  WITH CHECK ((empresa_id = get_my_empresa_id()) OR is_super_admin(auth.uid()));

CREATE POLICY "Public read lineas" ON public.cotizacion_lineas
  FOR SELECT TO anon, authenticated USING (true);