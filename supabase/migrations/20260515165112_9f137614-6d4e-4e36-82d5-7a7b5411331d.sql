
DROP VIEW IF EXISTS public.partner_resumen;
CREATE VIEW public.partner_resumen
WITH (security_invoker = true) AS
SELECT
  p.id as partner_id,
  p.nombre,
  p.comision_pct,
  p.estado,
  p.ref_slug,
  (SELECT COUNT(*) FROM public.partner_atribuciones a WHERE a.partner_id = p.id) AS empresas_referidas,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id) AS total_generado,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status = 'pagada') AS total_pagado,
  (SELECT COALESCE(SUM(monto_comision), 0) FROM public.partner_comisiones c WHERE c.partner_id = p.id AND c.status = 'pendiente') AS saldo_pendiente
FROM public.partners p;
GRANT SELECT ON public.partner_resumen TO authenticated;
