-- Surtir disponible (Demanda) en UNA llamada por pedido.
-- Antes el navegador hacía ~10–15 viajes por pedido (cliente, entrega, renglones, surtir renglón por
-- renglón, 3 cambios de estado): 12 pedidos ≈ 150 llamadas en serie. Ahora todo ocurre en la BD en
-- una transacción por pedido, y la pantalla muestra el avance pedido por pedido.
-- Pendiente por producto = cantidad del pedido − lo ya puesto en entregas no canceladas.
-- Resultado: { resultado: completo|parcial|sin_stock|sin_pendiente, entrega_id, folio, faltantes[] }

CREATE OR REPLACE FUNCTION public.surtir_pedido_disponible(
  p_pedido_id uuid,
  p_almacen_id uuid,
  p_vendedor_ruta_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_ped     public.ventas%ROWTYPE;
  v_ent_id  uuid;
  v_folio   text;
  v_orden   int;
  r         record;
  v_line    uuid;
  v_avail   numeric;
  v_give    numeric;
  v_total_give numeric := 0;
  v_faltan  jsonb := '[]'::jsonb;
  v_plan    jsonb := '[]'::jsonb;
  p         jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_ped FROM public.ventas WHERE id = p_pedido_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;
  IF v_ped.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a este pedido' USING ERRCODE = '42501';
  END IF;
  IF v_ped.status::text = 'cancelado' THEN
    RAISE EXCEPTION 'El pedido % está cancelado', COALESCE(v_ped.folio, '') USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_id AND empresa_id = v_ped.empresa_id) THEN
    RAISE EXCEPTION 'El almacén no es de esta empresa' USING ERRCODE = '42501';
  END IF;
  IF p_vendedor_ruta_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.profiles WHERE id = p_vendedor_ruta_id AND empresa_id = v_ped.empresa_id AND almacen_id IS NOT NULL) THEN
    RAISE EXCEPTION 'El repartidor no tiene almacén asignado en su perfil' USING ERRCODE = '22023';
  END IF;

  IF v_ped.status::text = 'borrador' THEN
    UPDATE public.ventas SET status = 'confirmado' WHERE id = p_pedido_id;
  END IF;

  -- Plan: pendiente por producto y cuánto hay en el almacén (bloqueando la existencia).
  FOR r IN
    WITH lin AS (
      SELECT vl.producto_id, SUM(vl.cantidad) AS cant,
             (array_agg(vl.unidad_id) FILTER (WHERE vl.unidad_id IS NOT NULL))[1] AS unidad_id,
             (array_agg(vl.lote_id) FILTER (WHERE vl.lote_id IS NOT NULL))[1] AS lote_id
        FROM public.venta_lineas vl
       WHERE vl.venta_id = p_pedido_id AND vl.producto_id IS NOT NULL
       GROUP BY vl.producto_id
    ), ya AS (
      SELECT el.producto_id, SUM(COALESCE(el.cantidad_entregada, 0)) AS q
        FROM public.entregas e JOIN public.entrega_lineas el ON el.entrega_id = e.id
       WHERE e.pedido_id = p_pedido_id AND e.status::text <> 'cancelado'
       GROUP BY el.producto_id
    )
    SELECT lin.producto_id, lin.unidad_id, lin.lote_id,
           lin.cant - COALESCE(ya.q, 0) AS pendiente
      FROM lin LEFT JOIN ya ON ya.producto_id = lin.producto_id
     WHERE lin.cant - COALESCE(ya.q, 0) > 0
     ORDER BY lin.producto_id
  LOOP
    SELECT GREATEST(COALESCE(cantidad, 0), 0) INTO v_avail
      FROM public.stock_almacen WHERE almacen_id = p_almacen_id AND producto_id = r.producto_id FOR UPDATE;
    v_give := LEAST(r.pendiente, COALESCE(v_avail, 0));
    v_total_give := v_total_give + v_give;
    v_plan := v_plan || jsonb_build_object('producto_id', r.producto_id, 'unidad_id', r.unidad_id, 'lote_id', r.lote_id,
                                           'pendiente', r.pendiente, 'give', v_give);
    IF r.pendiente - v_give > 0 THEN
      v_faltan := v_faltan || jsonb_build_object('producto_id', r.producto_id, 'faltante', r.pendiente - v_give);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_plan) = 0 THEN
    RETURN jsonb_build_object('resultado', 'sin_pendiente', 'faltantes', '[]'::jsonb);
  END IF;
  IF v_total_give = 0 THEN
    RETURN jsonb_build_object('resultado', 'sin_stock', 'faltantes', v_faltan);
  END IF;

  -- Reusar una entrega en borrador del pedido o crear una nueva.
  SELECT id, folio INTO v_ent_id, v_folio FROM public.entregas
   WHERE pedido_id = p_pedido_id AND status::text = 'borrador' ORDER BY created_at LIMIT 1 FOR UPDATE;
  IF v_ent_id IS NULL THEN
    SELECT COALESCE(orden, 0) INTO v_orden FROM public.clientes WHERE id = v_ped.cliente_id;
    INSERT INTO public.entregas (empresa_id, pedido_id, vendedor_id, cliente_id, almacen_id, vendedor_ruta_id, status, fecha, orden_entrega)
    VALUES (v_ped.empresa_id, p_pedido_id, v_ped.vendedor_id, v_ped.cliente_id, p_almacen_id, p_vendedor_ruta_id,
            'borrador', CURRENT_DATE, COALESCE(v_orden, 0))
    RETURNING id, folio INTO v_ent_id, v_folio;
  ELSE
    UPDATE public.entregas SET almacen_id = p_almacen_id WHERE id = v_ent_id;
  END IF;

  FOR p IN SELECT * FROM jsonb_array_elements(v_plan) LOOP
    SELECT id INTO v_line FROM public.entrega_lineas
     WHERE entrega_id = v_ent_id AND producto_id = (p->>'producto_id')::uuid AND NOT hecho LIMIT 1;
    IF v_line IS NULL THEN
      INSERT INTO public.entrega_lineas (entrega_id, producto_id, unidad_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id, lote_id)
      VALUES (v_ent_id, (p->>'producto_id')::uuid, NULLIF(p->>'unidad_id', '')::uuid, (p->>'pendiente')::numeric, 0, false,
              p_almacen_id, NULLIF(p->>'lote_id', '')::uuid)
      RETURNING id INTO v_line;
    END IF;
    IF (p->>'give')::numeric > 0 THEN
      PERFORM public.surtir_linea_entrega(v_line, (p->>'producto_id')::uuid, p_almacen_id, (p->>'give')::numeric,
                                          v_ent_id, v_ped.empresa_id, v_uid);
    END IF;
  END LOOP;

  IF jsonb_array_length(v_faltan) = 0 THEN
    UPDATE public.entregas SET status = 'surtido' WHERE id = v_ent_id;
    IF p_vendedor_ruta_id IS NOT NULL THEN
      UPDATE public.entregas SET vendedor_ruta_id = p_vendedor_ruta_id, status = 'asignado', fecha_asignacion = now() WHERE id = v_ent_id;
      UPDATE public.entregas SET status = 'cargado', fecha_carga = now() WHERE id = v_ent_id;
    END IF;
    RETURN jsonb_build_object('resultado', 'completo', 'entrega_id', v_ent_id, 'folio', v_folio, 'faltantes', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('resultado', 'parcial', 'entrega_id', v_ent_id, 'folio', v_folio, 'faltantes', v_faltan);
END;
$function$;

REVOKE ALL ON FUNCTION public.surtir_pedido_disponible(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surtir_pedido_disponible(uuid, uuid, uuid) TO authenticated;
