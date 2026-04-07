
-- Backfill: create salida movements for delivered pedidos missing them
-- Always set vendedor_destino_id when vendedor exists
INSERT INTO public.movimientos_inventario (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
SELECT 
  gen_random_uuid(),
  v.empresa_id,
  'salida',
  vl.producto_id,
  vl.cantidad,
  v.vendedor_id,
  CASE WHEN v.vendedor_id IS NULL THEN v.almacen_id ELSE NULL END,
  CASE WHEN v.vendedor_id IS NOT NULL THEN 'venta_ruta' ELSE 'venta' END,
  v.id,
  coalesce(v.vendedor_id, v.cliente_id),
  coalesce(v.fecha, current_date),
  now(),
  concat('Pedido entregado ', coalesce(v.folio, v.id::text), ' (retroactivo)')
FROM ventas v
JOIN venta_lineas vl ON vl.venta_id = v.id
WHERE v.tipo = 'pedido'
  AND v.status IN ('entregado', 'facturado')
  AND NOT EXISTS (
    SELECT 1 FROM movimientos_inventario mi 
    WHERE mi.referencia_id = v.id AND mi.producto_id = vl.producto_id AND mi.tipo = 'salida'
  );

-- Recalculate stock_camion for ALL affected vendedores
UPDATE public.stock_camion sc
SET cantidad_actual = (
  SELECT COALESCE(SUM(CASE WHEN mi.tipo = 'entrada' THEN mi.cantidad ELSE -mi.cantidad END), 0)
  FROM movimientos_inventario mi
  WHERE mi.vendedor_destino_id = sc.vendedor_id AND mi.producto_id = sc.producto_id
);

-- Recalculate productos.cantidad
UPDATE public.productos p
SET cantidad = (
  COALESCE((SELECT SUM(sa.cantidad) FROM stock_almacen sa WHERE sa.producto_id = p.id), 0) 
  + COALESCE((SELECT SUM(sc.cantidad_actual) FROM stock_camion sc WHERE sc.producto_id = p.id), 0)
);
