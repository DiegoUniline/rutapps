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
    VALUES (v_empresa_id, v_l.venta_id, p_linea_id, v_l.producto_id, v_l.almacen_id, COALESCE(v_l.cantidad, 0), v_l.lote_id)
    ON CONFLICT (venta_linea_id, COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET cantidad = EXCLUDED.cantidad,
                  almacen_id = EXCLUDED.almacen_id,
                  producto_id = EXCLUDED.producto_id,
                  updated_at = now();
  END IF;
END;
$function$;

DELETE FROM public.stock_apartado sa
USING public.ventas v
WHERE v.id = sa.venta_id
  AND v.empresa_id = '41cdb6df-40c0-4a95-89de-a54bf8eba0de'
  AND (v.cerrado_at IS NOT NULL OR v.status::text IN ('entregado','facturado','cancelado'));