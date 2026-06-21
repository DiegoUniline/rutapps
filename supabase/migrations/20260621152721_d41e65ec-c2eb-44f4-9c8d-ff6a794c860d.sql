CREATE OR REPLACE FUNCTION public.recalc_venta_total()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta_id uuid;
  v_subtotal numeric;
  v_iva numeric;
  v_ieps numeric;
  v_total numeric;
BEGIN
  v_venta_id := COALESCE(NEW.venta_id, OLD.venta_id);
  IF v_venta_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT
    COALESCE(SUM(subtotal), 0),
    COALESCE(SUM(iva_monto), 0),
    COALESCE(SUM(ieps_monto), 0),
    COALESCE(SUM(total), 0)
  INTO v_subtotal, v_iva, v_ieps, v_total
  FROM public.venta_lineas
  WHERE venta_id = v_venta_id;

  UPDATE public.ventas
  SET
    subtotal = v_subtotal,
    iva_total = v_iva,
    ieps_total = v_ieps,
    total = v_total
  WHERE id = v_venta_id
    AND (
      total IS DISTINCT FROM v_total
      OR subtotal IS DISTINCT FROM v_subtotal
      OR iva_total IS DISTINCT FROM v_iva
      OR ieps_total IS DISTINCT FROM v_ieps
    );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_recalc_venta_total ON public.venta_lineas;
CREATE TRIGGER trg_recalc_venta_total
AFTER INSERT OR UPDATE OR DELETE ON public.venta_lineas
FOR EACH ROW
EXECUTE FUNCTION public.recalc_venta_total();

UPDATE public.ventas v
SET
  subtotal = sub.subtotal,
  iva_total = sub.iva,
  ieps_total = sub.ieps,
  total = sub.total
FROM (
  SELECT
    venta_id,
    COALESCE(SUM(subtotal), 0) AS subtotal,
    COALESCE(SUM(iva_monto), 0) AS iva,
    COALESCE(SUM(ieps_monto), 0) AS ieps,
    COALESCE(SUM(total), 0) AS total
  FROM public.venta_lineas
  GROUP BY venta_id
) sub
WHERE v.id = sub.venta_id
  AND v.total IS DISTINCT FROM sub.total
  AND v.status::text NOT IN ('cancelada','cancelled');