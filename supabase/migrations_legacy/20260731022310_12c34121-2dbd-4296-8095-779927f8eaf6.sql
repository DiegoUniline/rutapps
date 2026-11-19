DO $$
DECLARE r record; v_expected numeric; v_saved numeric; v_delta numeric;
BEGIN
  FOR r IN
    SELECT v.id venta_id, p.id promocion_id, p.nombre, p.producto_gratis_id,
      GREATEST(1,COALESCE(p.cantidad_minima,1))::numeric min_qty,
      GREATEST(1,COALESCE(p.cantidad_gratis,1))::numeric free_qty,
      (SELECT COALESCE(SUM(vl.cantidad),0) FROM public.venta_lineas vl WHERE vl.venta_id=v.id AND vl.producto_id=ANY(p.producto_ids) AND vl.producto_id<>p.producto_gratis_id) trigger_qty,
      (SELECT COUNT(DISTINCT vl.producto_id) FROM public.venta_lineas vl WHERE vl.venta_id=v.id AND vl.producto_id=ANY(p.producto_ids) AND vl.producto_id<>p.producto_gratis_id AND vl.cantidad>0) trigger_products,
      (SELECT COALESCE(SUM(vl.cantidad),0) FROM public.venta_lineas vl WHERE vl.venta_id=v.id AND vl.producto_id=p.producto_gratis_id) gift_in_cart,
      (SELECT COALESCE(MAX(NULLIF(vl.precio_unitario,0)),0) FROM public.venta_lineas vl WHERE vl.venta_id=v.id AND vl.producto_id=p.producto_gratis_id) gift_price
    FROM public.ventas v JOIN public.promociones p ON p.empresa_id=v.empresa_id AND p.tipo='producto_gratis' AND p.producto_gratis_id IS NOT NULL AND cardinality(p.producto_ids)>1
    WHERE (v.created_at AT TIME ZONE 'America/Mexico_City')::date BETWEEN DATE '2026-07-25' AND DATE '2026-07-30'
      AND v.status::text NOT IN ('cancelado','cancelada')
      AND EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id=v.id AND pa.promocion_id=p.id)
  LOOP
    IF r.trigger_products > 1 AND r.trigger_qty >= r.min_qty AND r.gift_in_cart > 0 AND r.gift_price > 0 THEN
      v_expected := ROUND(LEAST(FLOOR(r.trigger_qty/r.min_qty)*r.free_qty,r.gift_in_cart)*r.gift_price,2);
      SELECT COALESCE(SUM(descuento_aplicado),0) INTO v_saved FROM public.promocion_aplicada WHERE venta_id=r.venta_id AND promocion_id=r.promocion_id;
      v_delta := ROUND(v_expected-v_saved,2);
      IF v_delta > 0 THEN
        UPDATE public.promocion_aplicada SET descuento_aplicado=descuento_aplicado+v_delta, descripcion=(v_expected/NULLIF(r.gift_price,0))::numeric::text||'× gratis — '||r.nombre
        WHERE id=(SELECT id FROM public.promocion_aplicada WHERE venta_id=r.venta_id AND promocion_id=r.promocion_id ORDER BY created_at,id LIMIT 1);
        PERFORM public.fn_recalc_venta_header(r.venta_id);
      END IF;
    END IF;
  END LOOP;
END $$;