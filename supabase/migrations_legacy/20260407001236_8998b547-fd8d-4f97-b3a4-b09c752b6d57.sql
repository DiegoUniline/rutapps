-- Backfill: ventas sin almacen_origen_id
UPDATE public.movimientos_inventario m
SET almacen_origen_id = v.almacen_id
FROM public.ventas v
WHERE m.referencia_tipo IN ('venta', 'cancelacion_venta')
  AND m.referencia_id = v.id
  AND m.almacen_origen_id IS NULL
  AND v.almacen_id IS NOT NULL;

-- Backfill: compras sin almacen_destino_id  
UPDATE public.movimientos_inventario m
SET almacen_destino_id = c.almacen_id
FROM public.compras c
WHERE m.referencia_tipo = 'compra'
  AND m.tipo = 'entrada'
  AND m.referencia_id = c.id
  AND m.almacen_destino_id IS NULL
  AND c.almacen_id IS NOT NULL;

-- Backfill: compra cancelaciones (salida) sin almacen_origen_id
UPDATE public.movimientos_inventario m
SET almacen_origen_id = c.almacen_id
FROM public.compras c
WHERE m.referencia_tipo = 'compra'
  AND m.tipo = 'salida'
  AND m.referencia_id = c.id
  AND m.almacen_origen_id IS NULL
  AND c.almacen_id IS NOT NULL;

-- Backfill: entregas entrada (carga a camión) - set almacen_origen_id from entrega.almacen_id
UPDATE public.movimientos_inventario m
SET almacen_origen_id = e.almacen_id
FROM public.entregas e
WHERE m.referencia_tipo = 'entrega'
  AND m.tipo = 'entrada'
  AND m.referencia_id = e.id
  AND m.almacen_origen_id IS NULL
  AND e.almacen_id IS NOT NULL;

-- Backfill: traspasos sin almacenes  
UPDATE public.movimientos_inventario m
SET almacen_origen_id = t.almacen_origen_id,
    almacen_destino_id = t.almacen_destino_id
FROM public.traspasos t
WHERE m.referencia_tipo = 'traspaso'
  AND m.referencia_id = t.id
  AND m.almacen_origen_id IS NULL
  AND t.almacen_origen_id IS NOT NULL;

-- Backfill: ajustes sin almacen
UPDATE public.movimientos_inventario m
SET almacen_origen_id = CASE WHEN m.tipo = 'salida' THEN a.almacen_id ELSE m.almacen_origen_id END,
    almacen_destino_id = CASE WHEN m.tipo = 'entrada' THEN a.almacen_id ELSE m.almacen_destino_id END
FROM public.ajustes_inventario a
WHERE m.referencia_tipo = 'ajuste'
  AND m.referencia_id = a.id
  AND m.almacen_origen_id IS NULL
  AND m.almacen_destino_id IS NULL
  AND a.almacen_id IS NOT NULL;