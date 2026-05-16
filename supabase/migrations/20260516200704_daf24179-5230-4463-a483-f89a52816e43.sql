
DROP FUNCTION IF EXISTS public.repair_missing_entrega_carga();

CREATE OR REPLACE FUNCTION public.repair_missing_entrega_carga()
RETURNS TABLE(out_entrega_id uuid, out_folio text, out_producto_id uuid, out_cantidad numeric, out_ruta_almacen uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rec record;
  v_ruta_almacen uuid;
  v_vendedor uuid;
BEGIN
  FOR v_rec IN
    SELECT e.id AS eid, e.folio, e.empresa_id, e.vendedor_ruta_id, e.vendedor_id,
           el.producto_id, el.cantidad_entregada
    FROM public.entregas e
    JOIN public.entrega_lineas el ON el.entrega_id = e.id
    WHERE e.status IN ('cargado','en_ruta','hecho')
      AND el.hecho = true
      AND COALESCE(el.cantidad_entregada,0) > 0
      AND EXISTS (
        SELECT 1 FROM public.movimientos_inventario m
        WHERE m.referencia_id = e.id AND m.referencia_tipo = 'entrega'
          AND m.tipo = 'salida' AND m.producto_id = el.producto_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario m
        WHERE m.referencia_id = e.id AND m.referencia_tipo = 'entrega_cargado'
          AND m.producto_id = el.producto_id
      )
  LOOP
    v_vendedor := COALESCE(v_rec.vendedor_ruta_id, v_rec.vendedor_id);
    SELECT almacen_id INTO v_ruta_almacen FROM public.profiles WHERE id = v_vendedor;
    IF v_ruta_almacen IS NULL THEN CONTINUE; END IF;

    INSERT INTO public.movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, vendedor_destino_id,
       referencia_tipo, referencia_id, notas, fecha)
    VALUES
      (v_rec.empresa_id, 'entrada', v_rec.producto_id, v_rec.cantidad_entregada,
       v_ruta_almacen, v_vendedor, 'entrega_cargado', v_rec.eid,
       'Carga a camión (reparación automática)', CURRENT_DATE);

    INSERT INTO public.stock_almacen AS sa (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (v_rec.empresa_id, v_ruta_almacen, v_rec.producto_id, v_rec.cantidad_entregada)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE
      SET cantidad = sa.cantidad + EXCLUDED.cantidad, updated_at = now();

    out_entrega_id := v_rec.eid; out_folio := v_rec.folio;
    out_producto_id := v_rec.producto_id; out_cantidad := v_rec.cantidad_entregada;
    out_ruta_almacen := v_ruta_almacen;
    RETURN NEXT;
  END LOOP;
END;
$function$;
