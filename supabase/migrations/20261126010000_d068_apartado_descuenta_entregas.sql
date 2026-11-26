-- D-068 (dueño, 2026-11-26): al editar un pedido ya surtido/entregado, el apartado se recreaba por la cantidad completa
-- del renglón sin descontar lo que ya va en entregas (Tampico PED-11679 retenía 90 pzas, incl. BOMBON GIGANTE C30).
-- Regla: se aparta solo lo del renglón que todavía no va en una entrega vigente (no cancelada ni no entregada).
-- Además se liberan los apartados que ya estaban retenidos de más.

CREATE OR REPLACE FUNCTION public.fn_sync_apartado_linea(p_linea_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.venta_lineas%ROWTYPE;
  v_tipo text; v_status text; v_empresa_id uuid; v_flag boolean;
  v_cerrado timestamptz;
  v_detalle int;
  v_en_entregas numeric;
  v_pendiente numeric;
BEGIN
  SELECT * INTO v_l FROM public.venta_lineas WHERE id = p_linea_id;
  IF NOT FOUND THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = p_linea_id;
    RETURN;
  END IF;

  SELECT v.tipo, v.status, v.empresa_id, v.cerrado_at
    INTO v_tipo, v_status, v_empresa_id, v_cerrado
    FROM public.ventas v WHERE v.id = v_l.venta_id;

  IF v_tipo IS DISTINCT FROM 'pedido' THEN RETURN; END IF;

  SELECT apartar_stock_pedidos INTO v_flag FROM public.empresas WHERE id = v_empresa_id;
  IF NOT COALESCE(v_flag, false) THEN RETURN; END IF;

  IF v_status IN ('cancelado','entregado','facturado') OR v_cerrado IS NOT NULL
     OR v_l.almacen_id IS NULL OR v_l.producto_id IS NULL THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = p_linea_id;
    RETURN;
  END IF;

  -- D-068: lo que ya va en entregas vigentes ya no se aparta (mismo criterio que trg_entrega_lineas_consume_apartado).
  SELECT COALESCE(SUM(el.cantidad_pedida), 0) INTO v_en_entregas
    FROM public.entrega_lineas el
    JOIN public.entregas e ON e.id = el.entrega_id
   WHERE e.pedido_id = v_l.venta_id
     AND el.producto_id = v_l.producto_id
     AND e.status::text NOT IN ('cancelado', 'no_entregado');
  v_pendiente := GREATEST(0, COALESCE(v_l.cantidad, 0) - v_en_entregas);

  IF v_pendiente <= 0 THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = p_linea_id;
    RETURN;
  END IF;

  SELECT count(*) INTO v_detalle FROM public.venta_linea_lotes WHERE venta_linea_id = p_linea_id;

  IF v_detalle > 0 THEN
    DELETE FROM public.stock_apartado sa
     WHERE sa.venta_linea_id = p_linea_id
       AND (sa.lote_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d
                            WHERE d.venta_linea_id = p_linea_id AND d.lote_id = sa.lote_id));

    INSERT INTO public.stock_apartado (empresa_id, venta_id, venta_linea_id, producto_id, almacen_id, cantidad, lote_id)
    SELECT v_empresa_id, v_l.venta_id, p_linea_id, v_l.producto_id,
           COALESCE(d.almacen_id, v_l.almacen_id), d.cantidad, d.lote_id
      FROM public.venta_linea_lotes d
     WHERE d.venta_linea_id = p_linea_id
    ON CONFLICT (venta_linea_id, COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET cantidad = EXCLUDED.cantidad,
                  almacen_id = EXCLUDED.almacen_id,
                  producto_id = EXCLUDED.producto_id,
                  updated_at = now();
  ELSE
    DELETE FROM public.stock_apartado sa
     WHERE sa.venta_linea_id = p_linea_id
       AND sa.lote_id IS DISTINCT FROM v_l.lote_id;

    INSERT INTO public.stock_apartado (empresa_id, venta_id, venta_linea_id, producto_id, almacen_id, cantidad, lote_id)
    VALUES (v_empresa_id, v_l.venta_id, p_linea_id, v_l.producto_id, v_l.almacen_id, v_pendiente, v_l.lote_id)
    ON CONFLICT (venta_linea_id, COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET cantidad = EXCLUDED.cantidad,
                  almacen_id = EXCLUDED.almacen_id,
                  producto_id = EXCLUDED.producto_id,
                  updated_at = now();
  END IF;
END;
$function$;

-- Liberar lo retenido de más: renglones con apartado que ya van (en todo o en parte) en entregas vigentes.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT sa.venta_linea_id
      FROM public.stock_apartado sa
     WHERE EXISTS (
       SELECT 1 FROM public.entrega_lineas el
         JOIN public.entregas e ON e.id = el.entrega_id
        WHERE e.pedido_id = sa.venta_id AND el.producto_id = sa.producto_id
          AND e.status::text NOT IN ('cancelado', 'no_entregado'))
  LOOP
    PERFORM public.fn_sync_apartado_linea(r.venta_linea_id);
  END LOOP;
END $$;
