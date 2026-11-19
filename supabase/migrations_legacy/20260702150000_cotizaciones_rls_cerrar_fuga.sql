-- FUGA DE DATOS (crítico): las cotizaciones eran legibles por CUALQUIER `anon`.
-- Las políticas "Public token read" y "Public read lineas" eran USING(true), sin
-- filtro de token ni empresa, así que con la llave pública del navegador cualquiera
-- podía leer las cotizaciones (clientes, precios, totales) de TODAS las empresas.
--
-- La vista pública del cliente ahora se sirve por token vía la edge function
-- `cotizacion-publica` (service-role, filtrada por token_publico en el servidor),
-- así que ya no se necesita —ni se debe— dar acceso directo de `anon`.
--
-- Se conservan intactas las políticas "Tenant isolation" (usuarios autenticados
-- solo ven las cotizaciones de su propia empresa).

DROP POLICY IF EXISTS "Public token read" ON public.cotizaciones;
DROP POLICY IF EXISTS "Public read lineas" ON public.cotizacion_lineas;
