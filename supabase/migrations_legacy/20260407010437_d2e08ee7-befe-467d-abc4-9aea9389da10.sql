
-- Backfill missing salida movements for route sales
INSERT INTO movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
SELECT 
  gen_random_uuid(),
  v.empresa_id,
  'salida',
  vl.producto_id,
  vl.cantidad,
  v.vendedor_id,
  'venta_ruta',
  v.id,
  COALESCE(v.vendedor_id, v.cliente_id),
  COALESCE(v.fecha, v.created_at::date),
  COALESCE(v.created_at, now()),
  concat('Venta ruta ', COALESCE(v.folio, v.id::text), ' (retroactivo)')
FROM venta_lineas vl
JOIN ventas v ON v.id = vl.venta_id
WHERE v.tipo = 'venta_directa'
  AND v.entrega_inmediata = true
  AND v.status IN ('confirmado', 'entregado', 'facturado')
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_inventario mi
    WHERE mi.referencia_id = v.id
      AND mi.producto_id = vl.producto_id
      AND mi.tipo = 'salida'
      AND mi.referencia_tipo IN ('venta', 'venta_ruta')
  );
