
DO $$
DECLARE
  eid uuid := '3add3496-ff9f-477b-b316-b55e3a38170c';
  vids uuid[];
  cids uuid[];
  entids uuid[];
  devids uuid[];
BEGIN
  SELECT array_agg(id) INTO vids FROM ventas WHERE empresa_id = eid;
  SELECT array_agg(id) INTO cids FROM cobros WHERE empresa_id = eid;
  SELECT array_agg(id) INTO entids FROM entregas WHERE empresa_id = eid;
  SELECT array_agg(id) INTO devids FROM devoluciones WHERE empresa_id = eid;

  IF devids IS NOT NULL THEN
    DELETE FROM devolucion_lineas WHERE devolucion_id = ANY(devids);
    DELETE FROM devoluciones WHERE id = ANY(devids);
  END IF;

  IF cids IS NOT NULL THEN
    DELETE FROM cobro_aplicaciones WHERE cobro_id = ANY(cids);
    DELETE FROM cobro_reintentos WHERE cobro_id = ANY(cids);
    DELETE FROM cobros WHERE id = ANY(cids);
  END IF;

  IF entids IS NOT NULL THEN
    DELETE FROM entrega_lineas WHERE entrega_id = ANY(entids);
    DELETE FROM entregas WHERE id = ANY(entids);
  END IF;

  IF vids IS NOT NULL THEN
    DELETE FROM visitas WHERE venta_id = ANY(vids);
    DELETE FROM cobro_aplicaciones WHERE venta_id = ANY(vids);
    DELETE FROM venta_comisiones WHERE venta_id = ANY(vids);
    DELETE FROM venta_historial WHERE venta_id = ANY(vids);
    DELETE FROM promocion_aplicada WHERE venta_id = ANY(vids);
    DELETE FROM carga_pedidos WHERE venta_id = ANY(vids);
    DELETE FROM stock_apartado WHERE venta_id = ANY(vids);
    DELETE FROM venta_lineas WHERE venta_id = ANY(vids);
    DELETE FROM ventas WHERE id = ANY(vids);
  END IF;

  DELETE FROM cotizacion_lineas WHERE cotizacion_id IN (SELECT id FROM cotizaciones WHERE empresa_id = eid);
  DELETE FROM cotizaciones WHERE empresa_id = eid;
END $$;
