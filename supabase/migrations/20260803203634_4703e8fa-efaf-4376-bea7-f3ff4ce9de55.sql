CREATE OR REPLACE FUNCTION public.fn_compra_linea_lote_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_rec record;
  v_delta numeric;
  v_linea record;
  v_total numeric;
  v_loteado numeric;
  v_sa_id uuid; v_sa_qty numeric;
  v_sl_id uuid; v_sl_qty numeric;
  v_pendiente numeric;
  v_folio text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_rec := NEW; v_delta := NEW.piezas;
  ELSE v_rec := OLD; v_delta := -OLD.piezas;
  END IF;

  SELECT cl.*, (cl.cantidad * COALESCE(NULLIF(cl.factor_conversion,0),1)) AS total_piezas
    INTO v_linea
  FROM compra_lineas cl WHERE cl.id = v_rec.compra_linea_id FOR UPDATE;

  IF v_linea IS NULL THEN RETURN v_rec; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM lotes l WHERE l.id = NEW.lote_id AND l.producto_id = v_linea.producto_id) THEN
      RAISE EXCEPTION 'El lote no corresponde al producto de la línea';
    END IF;
    v_total := v_linea.total_piezas;
    v_loteado := COALESCE(v_linea.piezas_loteadas, 0);
    IF v_loteado + NEW.piezas > v_total + 0.0001 THEN
      RAISE EXCEPTION 'No puedes lotear más piezas de las compradas (pendiente: %)', GREATEST(0, v_total - v_loteado);
    END IF;
  END IF;

  IF v_rec.almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = v_rec.almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;
    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) + v_delta, updated_at = now() WHERE id = v_sa_id;
    ELSIF v_delta > 0 THEN
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_rec.empresa_id, v_rec.almacen_id, v_linea.producto_id, v_delta);
    END IF;

    SELECT id, cantidad INTO v_sl_id, v_sl_qty
    FROM stock_lotes WHERE almacen_id = v_rec.almacen_id AND lote_id = v_rec.lote_id FOR UPDATE;
    IF v_sl_id IS NOT NULL THEN
      UPDATE stock_lotes SET cantidad = COALESCE(v_sl_qty,0) + v_delta, updated_at = now() WHERE id = v_sl_id;
    ELSIF v_delta > 0 THEN
      INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
      VALUES (v_rec.empresa_id, v_rec.almacen_id, v_linea.producto_id, v_rec.lote_id, v_delta);
    END IF;
  END IF;

  SELECT folio INTO v_folio FROM compras WHERE id = v_rec.compra_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad,
    almacen_destino_id, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
  VALUES (v_rec.empresa_id,
    (CASE WHEN v_delta > 0 THEN 'entrada' ELSE 'salida' END)::tipo_movimiento,
    v_linea.producto_id, ABS(v_delta),
    CASE WHEN v_delta > 0 THEN v_rec.almacen_id ELSE NULL END,
    CASE WHEN v_delta < 0 THEN v_rec.almacen_id ELSE NULL END,
    'compra', v_rec.compra_id, v_rec.user_id, current_date,
    concat('Compra ', COALESCE(v_folio, v_rec.compra_id::text),
           CASE WHEN v_delta > 0 THEN ' loteo/recepción' ELSE ' reversa de loteo' END),
    v_rec.lote_id);

  UPDATE compra_lineas
     SET piezas_loteadas = GREATEST(0, COALESCE(piezas_loteadas,0) + v_delta),
         cantidad_recibida = GREATEST(0, COALESCE(cantidad_recibida,0) + v_delta)
   WHERE id = v_rec.compra_linea_id;

  SELECT COALESCE(SUM(GREATEST(0, cantidad * COALESCE(NULLIF(factor_conversion,0),1) - COALESCE(cantidad_recibida,0))), 0)
    INTO v_pendiente
  FROM compra_lineas WHERE compra_id = v_rec.compra_id;

  IF v_pendiente = 0 THEN
    UPDATE compras SET status = 'recibida'
     WHERE id = v_rec.compra_id AND status NOT IN ('recibida','pagada','cancelada');
  END IF;

  RETURN v_rec;
END;
$function$;