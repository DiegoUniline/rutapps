CREATE OR REPLACE FUNCTION public.fn_recalc_venta_header(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta       public.ventas%ROWTYPE;
  v_n           integer;
  v_sub         numeric := 0;
  v_iva         numeric := 0;
  v_ieps        numeric := 0;
  v_tot         numeric := 0;
  v_desc_lin    numeric := 0;
  v_extra       numeric := 0;
  v_promo       numeric := 0;
  v_promo_linea boolean := false;
  v_licencia    text;
  v_new_total   numeric;
  v_new_desc    numeric;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;

  -- Sin FOR UPDATE: el UPDATE final toma el candado. Evita deadlocks por orden inverso de bloqueo.
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT COUNT(*),
         COALESCE(SUM(COALESCE(vl.subtotal,0)),0),
         COALESCE(SUM(COALESCE(vl.iva_monto,0)),0),
         COALESCE(SUM(COALESCE(vl.ieps_monto,0)),0),
         COALESCE(SUM(COALESCE(vl.total,0)),0),
         COALESCE(SUM(ROUND(COALESCE(vl.subtotal,0) * COALESCE(vl.descuento_pct,0) / 100.0, 2)),0)
    INTO v_n, v_sub, v_iva, v_ieps, v_tot, v_desc_lin
  FROM public.venta_lineas vl
  WHERE vl.venta_id = p_venta_id;

  IF v_n = 0 THEN RETURN; END IF;

  v_extra := CASE
    WHEN COALESCE(v_venta.descuento_extra, 0) <= 0 THEN 0
    WHEN COALESCE(v_venta.descuento_extra_tipo, 'porcentaje') = 'monto'
      THEN LEAST(v_venta.descuento_extra, v_tot)
    ELSE ROUND(v_tot * v_venta.descuento_extra / 100.0, 2)
  END;

  SELECT e.licencia INTO v_licencia FROM public.empresas e WHERE e.id = v_venta.empresa_id;
  SELECT EXISTS (
    SELECT 1 FROM public.feature_flags ff
    WHERE ff.clave = 'promo_descuento_linea'
      AND (ff.alcance = 'todos'
           OR (ff.alcance = 'licencias' AND v_licencia = ANY(COALESCE(ff.licencias, ARRAY[]::text[]))))
  ) INTO v_promo_linea;

  IF NOT v_promo_linea THEN
    SELECT COALESCE(SUM(COALESCE(pa.descuento_aplicado, 0)), 0) INTO v_promo
    FROM public.promocion_aplicada pa
    WHERE pa.venta_id = p_venta_id;
  END IF;

  v_new_total := GREATEST(0, ROUND(v_tot - v_extra - v_promo, 2));
  v_new_desc  := ROUND(v_desc_lin + v_extra + v_promo, 2);

  IF ABS(COALESCE(v_venta.subtotal,0)    - ROUND(v_sub,2))  > 0.005
  OR ABS(COALESCE(v_venta.iva_total,0)   - ROUND(v_iva,2))  > 0.005
  OR ABS(COALESCE(v_venta.ieps_total,0)  - ROUND(v_ieps,2)) > 0.005
  OR ABS(COALESCE(v_venta.total,0)       - v_new_total)     > 0.005
  OR ABS(COALESCE(v_venta.descuento_total,0) - v_new_desc)  > 0.005 THEN
    UPDATE public.ventas
       SET subtotal        = ROUND(v_sub, 2),
           iva_total       = ROUND(v_iva, 2),
           ieps_total      = ROUND(v_ieps, 2),
           descuento_total = v_new_desc,
           total           = v_new_total
     WHERE id = p_venta_id;
  END IF;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$function$;

-- Recrear el trigger como CONSTRAINT TRIGGER diferido al commit
DROP TRIGGER IF EXISTS trg_venta_lineas_recalc_header ON public.venta_lineas;

CREATE CONSTRAINT TRIGGER trg_venta_lineas_recalc_header
AFTER INSERT OR UPDATE OR DELETE ON public.venta_lineas
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_venta_header();