-- Seguridad (CONFIRMO del dueño 2026-11-20): `cotizaciones` y `cotizacion_lineas` tenían políticas
-- SELECT … TO anon, authenticated USING (true): cualquiera con la llave pública (y cualquier usuario
-- de otra empresa) podía leer las cotizaciones de TODAS las empresas.
-- La página pública ya no lee la tabla: usa la edge function `cotizacion-publica` (service-role,
-- solo la cotización del token exacto). Queda únicamente la política «Tenant isolation».
DROP POLICY IF EXISTS "Public token read" ON public.cotizaciones;
DROP POLICY IF EXISTS "Public read lineas" ON public.cotizacion_lineas;
