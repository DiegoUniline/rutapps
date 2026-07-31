DO $$
DECLARE
  r record;
BEGIN
  CREATE TEMP TABLE tmp_promo_repeated_fix ON COMMIT DROP AS
  WITH eligible AS (
    SELECT
      v.id AS venta_id,
      v.empresa_id,
      v.created_at AS venta_created_at,
      p.id AS promocion_id,
      p.nombre AS promocion_nombre,
      p.producto_gratis_id,
      p.prioridad,
      p.created_at AS promo_created_at,
      GREATEST(1, COALESCE(p.cantidad_minima, 1))::numeric AS min_qty,
      GREATEST(1, COALESCE(p.cantidad_gratis, 1))::numeric AS free_qty,
      (SELECT COALESCE(SUM(vl.cantidad), 0)
         FROM public.venta_lineas vl
        WHERE vl.venta_id = v.id
          AND vl.producto_id = ANY(p.producto_ids)
          AND vl.producto_id <> p.producto_gratis_id
          AND vl.cantidad > 0) AS trigger_qty,
      (SELECT COALESCE(MAX(vl.cantidad), 0)
         FROM public.venta_lineas vl
        WHERE vl.venta_id = v.id
          AND vl.producto_id = ANY(p.producto_ids)
          AND vl.producto_id <> p.producto_gratis_id
          AND vl.cantidad > 0) AS max_trigger_qty,
      (SELECT COUNT(DISTINCT vl.producto_id)
         FROM public.venta_lineas vl
        WHERE vl.venta_id = v.id
          AND vl.producto_id = ANY(p.producto_ids)
          AND vl.producto_id <> p.producto_gratis_id
          AND vl.cantidad > 0) AS trigger_products,
      (SELECT COALESCE(SUM(vl.cantidad), 0)
         FROM public.venta_lineas vl
        WHERE vl.venta_id = v.id
          AND vl.producto_id = p.producto_gratis_id
          AND vl.cantidad > 0) AS gift_qty,
      (SELECT COALESCE(SUM(pa.descuento_aplicado), 0)
         FROM public.promocion_aplicada pa
        WHERE pa.venta_id = v.id
          AND pa.promocion_id = p.id) AS saved_discount
    FROM public.ventas v
    JOIN public.promociones p
      ON p.empresa_id = v.empresa_id
     AND p.tipo = 'producto_gratis'
     AND p.producto_gratis_id IS NOT NULL
     AND p.aplica_a = 'producto'
     AND CARDINALITY(p.producto_ids) > 1
     AND p.activa = true
    WHERE (v.created_at AT TIME ZONE 'America/Mexico_City')::date
            BETWEEN DATE '2026-07-25' AND DATE '2026-07-30'
      AND v.status::text NOT IN ('cancelado', 'cancelada')
      AND p.created_at <= v.created_at
      AND (p.vigencia_inicio IS NULL OR p.vigencia_inicio <= (v.created_at AT TIME ZONE 'America/Mexico_City')::date)
      AND (p.vigencia_fin IS NULL OR p.vigencia_fin >= (v.created_at AT TIME ZONE 'America/Mexico_City')::date)
      AND (
        COALESCE(CARDINALITY(p.dias_semana), 0) = 0
        OR CASE EXTRACT(DOW FROM v.created_at AT TIME ZONE 'America/Mexico_City')::int
             WHEN 0 THEN 'domingo' WHEN 1 THEN 'lunes' WHEN 2 THEN 'martes'
             WHEN 3 THEN 'miercoles' WHEN 4 THEN 'jueves' WHEN 5 THEN 'viernes'
             WHEN 6 THEN 'sabado'
           END = ANY(ARRAY(SELECT lower(translate(x, 'áéíóúÁÉÍÓÚ', 'aeiouAEIOU')) FROM unnest(p.dias_semana) x))
      )
  ), qualified AS (
    SELECT *,
      LEAST(FLOOR(trigger_qty / min_qty) * free_qty, gift_qty) AS earned_qty,
      FLOOR(max_trigger_qty / min_qty) * free_qty AS old_single_line_max
    FROM eligible
    WHERE trigger_products > 1
      AND trigger_qty >= min_qty
      AND gift_qty > 0
  ), ranked AS (
    SELECT *,
      ROW_NUMBER() OVER (
        PARTITION BY venta_id, producto_gratis_id
        ORDER BY prioridad DESC, (saved_discount > 0) DESC, promo_created_at, promocion_id
      ) AS rn
    FROM qualified
    WHERE earned_qty > old_single_line_max
  )
  SELECT
    venta_id,
    empresa_id,
    promocion_id,
    promocion_nombre,
    producto_gratis_id,
    gift_qty,
    earned_qty
  FROM ranked
  WHERE rn = 1;

  CREATE TEMP TABLE tmp_promo_line_targets ON COMMIT DROP AS
  WITH gift_lines AS (
    SELECT
      f.venta_id,
      f.promocion_id,
      f.promocion_nombre,
      f.producto_gratis_id,
      f.earned_qty,
      vl.id AS venta_linea_id,
      vl.cantidad,
      vl.precio_unitario,
      COALESCE(vl.descuento_pct, 0) AS descuento_pct,
      COALESCE(vl.ieps_pct, 0) AS ieps_pct,
      COALESCE(vl.iva_pct, 0) AS iva_pct,
      COALESCE(SUM(vl.cantidad) OVER (
        PARTITION BY f.venta_id, f.producto_gratis_id
        ORDER BY vl.created_at, vl.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ), 0) AS prior_qty
    FROM tmp_promo_repeated_fix f
    JOIN public.venta_lineas vl
      ON vl.venta_id = f.venta_id
     AND vl.producto_id = f.producto_gratis_id
     AND vl.cantidad > 0
  ), allocated AS (
    SELECT *,
      GREATEST(0, LEAST(cantidad, earned_qty - prior_qty)) AS free_on_line
    FROM gift_lines
  ), amounts AS (
    SELECT *,
      ROUND((cantidad - free_on_line) * precio_unitario * (1 - descuento_pct / 100.0), 2) AS new_subtotal
    FROM allocated
  ), taxes AS (
    SELECT *,
      ROUND(new_subtotal * ieps_pct / 100.0, 2) AS new_ieps
    FROM amounts
  )
  SELECT *,
    ROUND((new_subtotal + new_ieps) * iva_pct / 100.0, 2) AS new_iva,
    ROUND(new_subtotal + new_ieps + ROUND((new_subtotal + new_ieps) * iva_pct / 100.0, 2), 2) AS new_total,
    ROUND(free_on_line * precio_unitario * (1 - descuento_pct / 100.0)
      * (1 + ieps_pct / 100.0) * (1 + iva_pct / 100.0), 2) AS discount_value
  FROM taxes;

  UPDATE public.venta_lineas vl
     SET subtotal = t.new_subtotal,
         ieps_monto = t.new_ieps,
         iva_monto = t.new_iva,
         total = t.new_total
    FROM tmp_promo_line_targets t
   WHERE vl.id = t.venta_linea_id
     AND (
       vl.subtotal IS DISTINCT FROM t.new_subtotal
       OR vl.ieps_monto IS DISTINCT FROM t.new_ieps
       OR vl.iva_monto IS DISTINCT FROM t.new_iva
       OR vl.total IS DISTINCT FROM t.new_total
     );

  DELETE FROM public.promocion_aplicada pa
  USING tmp_promo_repeated_fix f, public.promociones p
  WHERE pa.venta_id = f.venta_id
    AND pa.promocion_id = p.id
    AND p.producto_gratis_id = f.producto_gratis_id
    AND pa.promocion_id <> f.promocion_id;

  FOR r IN
    SELECT
      f.venta_id,
      f.promocion_id,
      f.promocion_nombre,
      MIN(t.venta_linea_id::text)::uuid AS venta_linea_id,
      SUM(t.free_on_line) AS free_qty,
      ROUND(SUM(t.discount_value), 2) AS discount_value
    FROM tmp_promo_repeated_fix f
    JOIN tmp_promo_line_targets t
      ON t.venta_id = f.venta_id
     AND t.promocion_id = f.promocion_id
    GROUP BY f.venta_id, f.promocion_id, f.promocion_nombre
  LOOP
    DELETE FROM public.promocion_aplicada
     WHERE venta_id = r.venta_id
       AND promocion_id = r.promocion_id;

    INSERT INTO public.promocion_aplicada
      (venta_id, venta_linea_id, promocion_id, descripcion, descuento_aplicado)
    VALUES
      (r.venta_id, r.venta_linea_id, r.promocion_id,
       r.free_qty::text || '× gratis — ' || r.promocion_nombre,
       r.discount_value);

    PERFORM public.fn_recalc_venta_header(r.venta_id);
  END LOOP;
END $$;