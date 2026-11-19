CREATE OR REPLACE FUNCTION public.fn_netear_linea_promo(_linea_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  l record;
  d numeric;
  faltante numeric;
  factor numeric;
  n_iva numeric; n_ieps numeric; n_total numeric; n_sub numeric;
BEGIN
  SELECT * INTO l FROM public.venta_lineas WHERE id = _linea_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COALESCE(SUM(descuento_aplicado),0) INTO d
  FROM public.promocion_aplicada WHERE venta_linea_id = _linea_id;

  faltante := ROUND(d - COALESCE(l.descuento_promocion_monto,0), 2);
  IF faltante <= 0.009 THEN RETURN; END IF;
  IF COALESCE(l.total,0) <= 0 OR faltante > l.total THEN RETURN; END IF;

  factor := (l.total - faltante) / l.total;
  n_iva  := ROUND(COALESCE(l.iva_monto,0)  * factor, 2);
  n_ieps := ROUND(COALESCE(l.ieps_monto,0) * factor, 2);
  n_total := ROUND(l.total - faltante, 2);
  n_sub := ROUND(n_total - n_iva - n_ieps, 2);

  UPDATE public.venta_lineas SET
    subtotal = n_sub,
    iva_monto = n_iva,
    ieps_monto = n_ieps,
    total = n_total,
    precio_unitario = CASE WHEN COALESCE(l.cantidad,0) > 0 THEN ROUND(n_sub / l.cantidad, 4) ELSE l.precio_unitario END,
    descuento_promocion_monto = ROUND(d, 2),
    descuento_total_monto = ROUND(d + COALESCE(l.descuento_manual_monto,0), 2),
    base_ieps = n_sub,
    base_iva = ROUND(n_sub + n_ieps, 2),
    impuestos_totales = ROUND(n_iva + n_ieps, 2)
  WHERE id = _linea_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_promocion_aplicada_netear()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.venta_linea_id IS NOT NULL THEN
    PERFORM public.fn_netear_linea_promo(NEW.venta_linea_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_promocion_aplicada_netear ON public.promocion_aplicada;
CREATE CONSTRAINT TRIGGER trg_promocion_aplicada_netear
AFTER INSERT OR UPDATE ON public.promocion_aplicada
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.tg_promocion_aplicada_netear();

-- Backfill de líneas históricas con promoción registrada pero no descontada
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT vl.id
    FROM public.venta_lineas vl
    JOIN (SELECT venta_linea_id, SUM(descuento_aplicado) d
          FROM public.promocion_aplicada WHERE venta_linea_id IS NOT NULL
          GROUP BY 1) pa ON pa.venta_linea_id = vl.id
    WHERE COALESCE(vl.descuento_promocion_monto,0) < pa.d - 0.01
      AND vl.total >= pa.d
  LOOP
    PERFORM public.fn_netear_linea_promo(r.id);
  END LOOP;
END $$;