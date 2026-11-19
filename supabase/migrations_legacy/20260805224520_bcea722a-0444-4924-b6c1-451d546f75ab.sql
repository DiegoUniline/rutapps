CREATE OR REPLACE FUNCTION public.fn_sync_venta_inventario(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta       public.ventas%ROWTYPE;
  v_almacen     uuid;
  v_aplica      boolean;
  v_ref_entrada text;
  p             RECORD;
  l             RECORD;
  v_lote        RECORD;
  v_diff        numeric;
  v_acc         numeric;
  v_res         numeric;
  v_take        numeric;
  v_maneja      boolean;
  v_stock_id    uuid;
  v_stock_act   numeric;
  v_user        uuid;
  v_nombre      text;
  v_log         jsonb := '[]'::jsonb;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_venta_id::text, 0));

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_venta.tipo::text = 'saldo_inicial' OR COALESCE(v_venta.es_saldo_inicial, false) THEN RETURN; END IF;
  IF v_venta.tipo::text = 'pedido'
     AND EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = p_venta_id) THEN
    RETURN;
  END IF;

  v_almacen := COALESCE(
    v_venta.almacen_id,
    (SELECT almacen_id FROM public.profiles WHERE id = v_venta.vendedor_id LIMIT 1)
  );

  v_aplica := CASE
    WHEN v_venta.status::text IN ('cancelado', 'borrador') THEN false
    WHEN v_venta.tipo::text = 'venta_directa'
      THEN COALESCE(v_venta.entrega_inmediata, false) OR v_venta.status::text IN ('entregado', 'facturado')
    WHEN v_venta.tipo::text = 'pedido'
      THEN v_venta.status::text IN ('entregado', 'facturado')
    ELSE false
  END;

  IF v_almacen IS NULL THEN
    IF v_aplica THEN
      RAISE EXCEPTION 'No se puede aplicar inventario de la venta % sin almacén asignado.',
        COALESCE(v_venta.folio, v_venta.id::text);
    END IF;
    RETURN;
  END IF;

  v_ref_entrada := CASE WHEN v_venta.status::text = 'cancelado'
                        THEN 'cancelacion_venta' ELSE 'reverso_borrador' END;
  v_user := COALESCE(auth.uid(), v_venta.vendedor_id, v_venta.creado_por);
  SELECT nombre INTO v_nombre FROM public.profiles WHERE id = v_user;

  CREATE TEMP TABLE IF NOT EXISTS _sync_des (producto_id uuid, lote_id uuid, cant numeric) ON COMMIT DROP;
  CREATE TEMP TABLE IF NOT EXISTS _sync_apl (producto_id uuid, lote_id uuid, cant numeric) ON COMMIT DROP;
  DELETE FROM _sync_des WHERE true;
  DELETE FROM _sync_apl WHERE true;

  IF v_aplica THEN
    INSERT INTO _sync_des
    SELECT producto_id, lote_id, SUM(cant) FROM (
      SELECT vl.producto_id, d.lote_id, COALESCE(d.cantidad,0) AS cant
        FROM public.venta_lineas vl
        JOIN public.venta_linea_lotes d ON d.venta_linea_id = vl.id
       WHERE vl.venta_id = p_venta_id
      UNION ALL
      SELECT vl.producto_id, vl.lote_id, COALESCE(vl.cantidad,0)
        FROM public.venta_lineas vl
       WHERE vl.venta_id = p_venta_id
         AND NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d WHERE d.venta_linea_id = vl.id)
    ) x GROUP BY 1,2;
  END IF;

  INSERT INTO _sync_apl
  SELECT mi.producto_id, mi.lote_id,
         SUM(CASE WHEN mi.tipo::text = 'salida' THEN COALESCE(mi.cantidad,0) ELSE -COALESCE(mi.cantidad,0) END)
    FROM public.movimientos_inventario mi
   WHERE mi.referencia_id = p_venta_id
     AND mi.referencia_tipo IN ('venta','venta_lote','cancelacion_venta','reverso_borrador',
                                'cancelacion_venta_lote','reverso_borrador_lote')
   GROUP BY 1,2;

  FOR p IN
    SELECT producto_id,
           SUM(des) AS deseado_total,
           SUM(apl) AS aplicado_total
      FROM (
        SELECT producto_id, cant AS des, 0::numeric AS apl FROM _sync_des
        UNION ALL
        SELECT producto_id, 0::numeric, cant FROM _sync_apl
      ) z GROUP BY producto_id
      ORDER BY producto_id
  LOOP
    v_diff := ROUND(COALESCE(p.deseado_total,0) - COALESCE(p.aplicado_total,0), 6);
    SELECT COALESCE(maneja_lote,false) INTO v_maneja FROM public.productos WHERE id = p.producto_id;
    v_acc := 0;

    v_stock_id := NULL; v_stock_act := NULL;
    IF ABS(v_diff) > 0.000001 THEN
      SELECT id, cantidad INTO v_stock_id, v_stock_act
        FROM public.stock_almacen
       WHERE almacen_id = v_almacen AND producto_id = p.producto_id FOR UPDATE;
    END IF;

    FOR l IN
      SELECT d.lote_id,
             ROUND(SUM(d.cant) - COALESCE((SELECT a.cant FROM _sync_apl a
                                            WHERE a.producto_id = p.producto_id AND a.lote_id = d.lote_id), 0), 6) AS delta
        FROM _sync_des d
       WHERE d.producto_id = p.producto_id AND d.lote_id IS NOT NULL
       GROUP BY d.lote_id
       ORDER BY d.lote_id
    LOOP
      IF ABS(l.delta) < 0.000001 THEN CONTINUE; END IF;
      IF l.delta > 0 THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,lote_id,referencia_tipo,referencia_id,user_id,fecha,notas)
        VALUES (v_venta.empresa_id,'salida',p.producto_id,l.delta,v_almacen,l.lote_id,'venta',p_venta_id,v_user,
                COALESCE(v_venta.fecha,CURRENT_DATE),'Venta '||COALESCE(v_venta.folio,'')||' · lote');
      ELSE
        INSERT INTO public.movimientos_inventario
          (empresa_id,tipo,producto_id,cantidad,almacen_destino_id,lote_id,referencia_tipo,referencia_id,user_id,fecha,notas)
        VALUES (v_venta.empresa_id,'entrada',p.producto_id,-l.delta,v_almacen,l.lote_id,v_ref_entrada,p_venta_id,v_user,
                COALESCE(v_venta.fecha,CURRENT_DATE),'Reverso venta '||COALESCE(v_venta.folio,'')||' · lote');
      END IF;
      v_acc := v_acc + l.delta;
    END LOOP;

    v_res := ROUND(v_diff - v_acc, 6);

    IF v_res > 0.000001 THEN
      IF v_maneja THEN
        FOR v_lote IN
          SELECT sl.lote_id, sl.cantidad AS existencia
            FROM public.stock_lotes sl JOIN public.lotes lo ON lo.id = sl.lote_id
           WHERE sl.almacen_id = v_almacen AND sl.producto_id = p.producto_id AND sl.cantidad > 0
           ORDER BY lo.fecha_caducidad ASC NULLS LAST, lo.created_at ASC, sl.lote_id ASC
           FOR UPDATE OF sl
        LOOP
          EXIT WHEN v_res <= 0.000001;
          v_take := LEAST(v_lote.existencia, v_res);
          INSERT INTO public.movimientos_inventario
            (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,lote_id,referencia_tipo,referencia_id,user_id,fecha,notas)
          VALUES (v_venta.empresa_id,'salida',p.producto_id,v_take,v_almacen,v_lote.lote_id,'venta',p_venta_id,v_user,
                  COALESCE(v_venta.fecha,CURRENT_DATE),'Venta '||COALESCE(v_venta.folio,'')||' · lote FEFO');
          v_res := ROUND(v_res - v_take, 6);
        END LOOP;
      END IF;
      IF v_res > 0.000001 THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,referencia_tipo,referencia_id,user_id,fecha,notas)
        VALUES (v_venta.empresa_id,'salida',p.producto_id,v_res,v_almacen,'venta',p_venta_id,v_user,
                COALESCE(v_venta.fecha,CURRENT_DATE),'Venta '||COALESCE(v_venta.folio,''));
      END IF;

    ELSIF v_res < -0.000001 THEN
      v_res := -v_res;
      FOR l IN
        SELECT a.lote_id, a.cant AS aplicado
          FROM _sync_apl a
         WHERE a.producto_id = p.producto_id AND a.lote_id IS NOT NULL AND a.cant > 0
           AND NOT EXISTS (SELECT 1 FROM _sync_des d
                            WHERE d.producto_id = p.producto_id AND d.lote_id = a.lote_id)
         ORDER BY a.lote_id
      LOOP
        EXIT WHEN v_res <= 0.000001;
        v_take := LEAST(l.aplicado, v_res);
        INSERT INTO public.movimientos_inventario
          (empresa_id,tipo,producto_id,cantidad,almacen_destino_id,lote_id,referencia_tipo,referencia_id,user_id,fecha,notas)
        VALUES (v_venta.empresa_id,'entrada',p.producto_id,v_take,v_almacen,l.lote_id,v_ref_entrada,p_venta_id,v_user,
                COALESCE(v_venta.fecha,CURRENT_DATE),'Reverso venta '||COALESCE(v_venta.folio,'')||' · lote');
        v_res := ROUND(v_res - v_take, 6);
      END LOOP;
      IF v_res > 0.000001 THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id,tipo,producto_id,cantidad,almacen_destino_id,referencia_tipo,referencia_id,user_id,fecha,notas)
        VALUES (v_venta.empresa_id,'entrada',p.producto_id,v_res,v_almacen,v_ref_entrada,p_venta_id,v_user,
                COALESCE(v_venta.fecha,CURRENT_DATE),'Reverso venta '||COALESCE(v_venta.folio,''));
      END IF;
    END IF;

    IF ABS(v_diff) > 0.000001 THEN
      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen
           SET cantidad = COALESCE(v_stock_act,0) - v_diff, updated_at = now()
         WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (v_venta.empresa_id, v_almacen, p.producto_id, -v_diff)
        ON CONFLICT (almacen_id, producto_id)
        DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_diff, updated_at = now();
      END IF;
    END IF;

    IF ABS(v_diff) > 0.000001 OR ABS(v_acc) > 0.000001 THEN
      v_log := v_log || jsonb_build_object(
        'producto_id', p.producto_id, 'almacen_id', v_almacen,
        'deseado', p.deseado_total, 'aplicado_previo', p.aplicado_total, 'ajuste', v_diff);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_log) > 0 THEN
    INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles)
    VALUES (p_venta_id, v_venta.empresa_id, v_user, COALESCE(v_nombre,'sistema'),
            'inventario_ajustado',
            jsonb_build_object('status', v_venta.status, 'aplica', v_aplica, 'ajustes', v_log));
  END IF;

  DELETE FROM _sync_des WHERE true;
  DELETE FROM _sync_apl WHERE true;
END;
$function$;