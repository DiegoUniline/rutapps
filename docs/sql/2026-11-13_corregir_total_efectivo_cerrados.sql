-- Corrige pedidos cerrados como parcial cuyo total entregado (total_efectivo) quedó desfasado
-- después de corregir precios (Tampico 9, Multi 5; 2 con saldo fantasma, p. ej. PED-0903).
-- Requiere antes la migración 20261113120000_cerrado_total_efectivo.sql.
-- Respaldo: public.cerrados_total_efectivo_respaldo.
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

BEGIN;

CREATE TABLE IF NOT EXISTS public.cerrados_total_efectivo_respaldo (
  venta_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  folio text,
  total numeric,
  total_efectivo_antes numeric,
  saldo_antes numeric,
  total_efectivo_nuevo numeric,
  corregido_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venta_id, corregido_at)
);
ALTER TABLE public.cerrados_total_efectivo_respaldo ENABLE ROW LEVEL SECURITY;

INSERT INTO public.cerrados_total_efectivo_respaldo
  (venta_id, empresa_id, folio, total, total_efectivo_antes, saldo_antes, total_efectivo_nuevo)
SELECT v.id, v.empresa_id, v.folio, v.total, v.total_efectivo, v.saldo_pendiente,
       public.fn_total_efectivo_cerrado(v.id, v.total)
FROM public.ventas v
WHERE v.cerrado_at IS NOT NULL
  AND v.status::text <> 'cancelado'
  AND abs(COALESCE(v.total_efectivo, 0) - public.fn_total_efectivo_cerrado(v.id, v.total)) > 0.005;

UPDATE public.ventas v
   SET total_efectivo = r.total_efectivo_nuevo
  FROM public.cerrados_total_efectivo_respaldo r
 WHERE r.venta_id = v.id AND r.corregido_at = now();

SELECT public.fn_recalc_venta_saldo(r.venta_id)
  FROM public.cerrados_total_efectivo_respaldo r
 WHERE r.corregido_at = now();

-- Resultado: un renglón por pedido corregido
SELECT e.nombre AS empresa, r.folio, r.total,
       r.total_efectivo_antes, r.total_efectivo_nuevo,
       r.saldo_antes, v.saldo_pendiente AS saldo_ahora
FROM public.cerrados_total_efectivo_respaldo r
JOIN public.ventas v ON v.id = r.venta_id
JOIN public.empresas e ON e.id = r.empresa_id
WHERE r.corregido_at = now()
ORDER BY e.nombre, r.folio;

COMMIT;
