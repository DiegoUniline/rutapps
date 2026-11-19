
CREATE OR REPLACE FUNCTION public.registrar_merma(_almacen_origen_id uuid, _ruta_id uuid, _motivo_id uuid, _observaciones text, _lineas jsonb, _devolucion_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _empresa_id uuid := public.get_my_empresa_id();
  _user_id uuid := auth.uid();
  _almacen_mermas uuid; _merma_id uuid; _folio text; _next int;
  _total_costo numeric := 0; _total_venta numeric := 0;
  _line jsonb; _producto_id uuid; _cantidad numeric; _costo numeric; _precio numeric;
BEGIN
  IF _empresa_id IS NULL THEN RAISE EXCEPTION 'No hay empresa activa'; END IF;
  _almacen_mermas := public.ensure_almacen_mermas(_empresa_id);
  SELECT COALESCE(MAX(NULLIF(regexp_replace(folio,'[^0-9]','','g'),'')::int),0)+1
    INTO _next FROM public.mermas WHERE empresa_id = _empresa_id;
  _folio := 'MER-' || lpad(_next::text, 4, '0');

  INSERT INTO public.mermas(empresa_id, folio, almacen_origen_id, ruta_id, motivo_id, observaciones, devolucion_id, creado_por)
  VALUES (_empresa_id, _folio, _almacen_origen_id, _ruta_id, _motivo_id, _observaciones, _devolucion_id, _user_id)
  RETURNING id INTO _merma_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lineas) LOOP
    _producto_id := (_line->>'producto_id')::uuid;
    _cantidad := (_line->>'cantidad')::numeric;
    _costo := COALESCE((_line->>'costo_unitario')::numeric, 0);
    _precio := COALESCE((_line->>'precio_venta_unitario')::numeric, 0);

    INSERT INTO public.merma_lineas(merma_id, empresa_id, producto_id, cantidad, costo_unitario, precio_venta_unitario, subtotal_costo, subtotal_venta)
    VALUES (_merma_id, _empresa_id, _producto_id, _cantidad, _costo, _precio, _costo*_cantidad, _precio*_cantidad);

    _total_costo := _total_costo + _costo*_cantidad;
    _total_venta := _total_venta + _precio*_cantidad;

    UPDATE public.stock_almacen SET cantidad = cantidad - _cantidad, updated_at = now()
     WHERE empresa_id = _empresa_id AND almacen_id = _almacen_origen_id AND producto_id = _producto_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
      VALUES (_empresa_id, _almacen_origen_id, _producto_id, -_cantidad);
    END IF;

    -- FIX: unique constraint on stock_almacen is (almacen_id, producto_id), not (empresa_id, almacen_id, producto_id)
    INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
    VALUES (_empresa_id, _almacen_mermas, _producto_id, _cantidad)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE
       SET cantidad = public.stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_empresa_id, 'salida', _producto_id, _cantidad, _almacen_origen_id, 'merma', _merma_id, _folio, _user_id, CURRENT_DATE);

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_empresa_id, 'entrada', _producto_id, _cantidad, _almacen_mermas, 'merma', _merma_id, _folio, _user_id, CURRENT_DATE);
  END LOOP;

  UPDATE public.mermas SET total_costo = _total_costo, total_venta = _total_venta WHERE id = _merma_id;
  RETURN _merma_id;
END;
$function$;
