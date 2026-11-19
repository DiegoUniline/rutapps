CREATE TABLE IF NOT EXISTS public.merma_linea_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  merma_id uuid NOT NULL REFERENCES public.mermas(id) ON DELETE CASCADE,
  merma_linea_id uuid NOT NULL REFERENCES public.merma_lineas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  cantidad numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.merma_linea_lotes TO authenticated;
GRANT ALL ON public.merma_linea_lotes TO service_role;

ALTER TABLE public.merma_linea_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "merma_linea_lotes empresa" ON public.merma_linea_lotes
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_mll_merma_linea ON public.merma_linea_lotes(merma_linea_id);
CREATE INDEX IF NOT EXISTS idx_mll_merma ON public.merma_linea_lotes(merma_id);
CREATE INDEX IF NOT EXISTS idx_mll_lote ON public.merma_linea_lotes(lote_id);
CREATE INDEX IF NOT EXISTS idx_mll_empresa ON public.merma_linea_lotes(empresa_id);

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
  _linea_id uuid; _maneja boolean; _asig jsonb; _lote_id uuid; _qty numeric;
  _pending numeric; _disp numeric; _l RECORD; _take numeric;
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
    VALUES (_merma_id, _empresa_id, _producto_id, _cantidad, _costo, _precio, _costo*_cantidad, _precio*_cantidad)
    RETURNING id INTO _linea_id;

    _total_costo := _total_costo + _costo*_cantidad;
    _total_venta := _total_venta + _precio*_cantidad;

    UPDATE public.stock_almacen SET cantidad = cantidad - _cantidad, updated_at = now()
     WHERE empresa_id = _empresa_id AND almacen_id = _almacen_origen_id AND producto_id = _producto_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
      VALUES (_empresa_id, _almacen_origen_id, _producto_id, -_cantidad);
    END IF;

    INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
    VALUES (_empresa_id, _almacen_mermas, _producto_id, _cantidad)
    ON CONFLICT (almacen_id, producto_id) DO UPDATE
       SET cantidad = public.stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_empresa_id, 'salida', _producto_id, _cantidad, _almacen_origen_id, 'merma', _merma_id, _folio, _user_id, CURRENT_DATE);

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_empresa_id, 'entrada', _producto_id, _cantidad, _almacen_mermas, 'merma', _merma_id, _folio, _user_id, CURRENT_DATE);

    -- ===== Lotes =====
    SELECT COALESCE(maneja_lote, false) INTO _maneja FROM public.productos WHERE id = _producto_id;
    IF _maneja THEN
      IF jsonb_typeof(_line->'lotes') = 'array' AND jsonb_array_length(_line->'lotes') > 0 THEN
        FOR _asig IN SELECT * FROM jsonb_array_elements(_line->'lotes') LOOP
          _lote_id := (_asig->>'lote_id')::uuid;
          _qty := COALESCE((_asig->>'cantidad')::numeric, 0);
          IF _lote_id IS NULL OR _qty <= 0 THEN CONTINUE; END IF;

          SELECT sl.cantidad INTO _disp FROM public.stock_lotes sl
           WHERE sl.almacen_id = _almacen_origen_id AND sl.lote_id = _lote_id AND sl.producto_id = _producto_id
           FOR UPDATE;
          IF _disp IS NULL OR _disp < _qty THEN
            RAISE EXCEPTION 'El lote seleccionado no tiene existencia suficiente (disponible %, solicitado %)', COALESCE(_disp,0), _qty;
          END IF;

          INSERT INTO public.merma_linea_lotes(empresa_id, merma_id, merma_linea_id, producto_id, lote_id, cantidad)
          VALUES (_empresa_id, _merma_id, _linea_id, _producto_id, _lote_id, _qty);

          PERFORM public._aplica_stock_lote(_empresa_id, _almacen_origen_id, _producto_id, _lote_id, -_qty);
          PERFORM public._aplica_stock_lote(_empresa_id, _almacen_mermas, _producto_id, _lote_id, _qty);

          INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, notas, user_id, fecha)
          VALUES (_empresa_id, 'salida', _producto_id, _qty, _almacen_origen_id, _lote_id, 'merma_lote', _merma_id, _folio, _user_id, CURRENT_DATE);
          INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, notas, user_id, fecha)
          VALUES (_empresa_id, 'entrada', _producto_id, _qty, _almacen_mermas, _lote_id, 'merma_lote', _merma_id, _folio, _user_id, CURRENT_DATE);
        END LOOP;
      ELSE
        -- FEFO automatico
        _pending := _cantidad;
        FOR _l IN
          SELECT sl.lote_id, sl.cantidad AS existencia
          FROM public.stock_lotes sl JOIN public.lotes lo ON lo.id = sl.lote_id
          WHERE sl.almacen_id = _almacen_origen_id AND sl.producto_id = _producto_id AND sl.cantidad > 0
          ORDER BY lo.fecha_caducidad ASC NULLS LAST, lo.created_at ASC
          FOR UPDATE OF sl
        LOOP
          EXIT WHEN _pending <= 0;
          _take := LEAST(_l.existencia, _pending);
          INSERT INTO public.merma_linea_lotes(empresa_id, merma_id, merma_linea_id, producto_id, lote_id, cantidad)
          VALUES (_empresa_id, _merma_id, _linea_id, _producto_id, _l.lote_id, _take);

          PERFORM public._aplica_stock_lote(_empresa_id, _almacen_origen_id, _producto_id, _l.lote_id, -_take);
          PERFORM public._aplica_stock_lote(_empresa_id, _almacen_mermas, _producto_id, _l.lote_id, _take);

          INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, notas, user_id, fecha)
          VALUES (_empresa_id, 'salida', _producto_id, _take, _almacen_origen_id, _l.lote_id, 'merma_lote', _merma_id, _folio || ' (FEFO)', _user_id, CURRENT_DATE);
          INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, notas, user_id, fecha)
          VALUES (_empresa_id, 'entrada', _producto_id, _take, _almacen_mermas, _l.lote_id, 'merma_lote', _merma_id, _folio || ' (FEFO)', _user_id, CURRENT_DATE);
          _pending := _pending - _take;
        END LOOP;
      END IF;
    END IF;
  END LOOP;

  UPDATE public.mermas SET total_costo = _total_costo, total_venta = _total_venta WHERE id = _merma_id;
  RETURN _merma_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancelar_merma(_merma_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _empresa_id uuid := public.get_my_empresa_id();
  _user_id uuid := auth.uid();
  _m record; _almacen_mermas uuid; _l record; _ll record;
BEGIN
  SELECT * INTO _m FROM public.mermas WHERE id = _merma_id AND (empresa_id = _empresa_id OR public.is_super_admin(_user_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Merma no encontrada'; END IF;
  IF _m.cancelada THEN RAISE EXCEPTION 'Merma ya cancelada'; END IF;
  _almacen_mermas := public.ensure_almacen_mermas(_m.empresa_id);
  FOR _l IN SELECT * FROM public.merma_lineas WHERE merma_id = _merma_id LOOP
    UPDATE public.stock_almacen SET cantidad = cantidad + _l.cantidad, updated_at = now()
     WHERE empresa_id = _m.empresa_id AND almacen_id = _m.almacen_origen_id AND producto_id = _l.producto_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
      VALUES (_m.empresa_id, _m.almacen_origen_id, _l.producto_id, _l.cantidad);
    END IF;
    UPDATE public.stock_almacen SET cantidad = cantidad - _l.cantidad, updated_at = now()
     WHERE empresa_id = _m.empresa_id AND almacen_id = _almacen_mermas AND producto_id = _l.producto_id;

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_m.empresa_id, 'entrada', _l.producto_id, _l.cantidad, _m.almacen_origen_id, 'merma_cancelacion', _m.id, _m.folio || ' (CANCELADA)', _user_id, CURRENT_DATE);

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_m.empresa_id, 'salida', _l.producto_id, _l.cantidad, _almacen_mermas, 'merma_cancelacion', _m.id, _m.folio || ' (CANCELADA)', _user_id, CURRENT_DATE);

    FOR _ll IN SELECT * FROM public.merma_linea_lotes WHERE merma_linea_id = _l.id LOOP
      PERFORM public._aplica_stock_lote(_m.empresa_id, _m.almacen_origen_id, _ll.producto_id, _ll.lote_id, _ll.cantidad);
      PERFORM public._aplica_stock_lote(_m.empresa_id, _almacen_mermas, _ll.producto_id, _ll.lote_id, -_ll.cantidad);

      INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, notas, user_id, fecha)
      VALUES (_m.empresa_id, 'entrada', _ll.producto_id, _ll.cantidad, _m.almacen_origen_id, _ll.lote_id, 'merma_cancelacion_lote', _m.id, _m.folio || ' (CANCELADA)', _user_id, CURRENT_DATE);
      INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, notas, user_id, fecha)
      VALUES (_m.empresa_id, 'salida', _ll.producto_id, _ll.cantidad, _almacen_mermas, _ll.lote_id, 'merma_cancelacion_lote', _m.id, _m.folio || ' (CANCELADA)', _user_id, CURRENT_DATE);
    END LOOP;
  END LOOP;
  UPDATE public.mermas SET cancelada = true, cancelada_at = now(), cancelada_por = _user_id WHERE id = _merma_id;
END; $function$;