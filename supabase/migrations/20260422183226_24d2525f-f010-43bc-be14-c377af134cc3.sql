-- Limpieza de movimientos duplicados de la entrega 4f6ea9ae-cbb0-4734-987e-100e23b52ac1
-- Eliminar TODOS los movimientos (salidas y entradas compensatorias) y dejar solo 1 salida por línea
-- por cada producto realmente entregado (cantidad_entregada > 0).

-- 1) Borrar todos los movimientos previos de esta entrega
DELETE FROM public.movimientos_inventario
WHERE referencia_tipo = 'entrega'
  AND referencia_id = '4f6ea9ae-cbb0-4734-987e-100e23b52ac1';

-- 2) Recalcular stock_almacen del almacén del vendedor (Ruta Andrey) reseteándolo
--    con base en lo que tiene cargado menos lo que entregó.
--    Dado que solo este vendedor tiene cargas/entregas en este almacén, lo dejamos en 0
--    para los productos de esta entrega (cargó 10, entregó 10 = 0).
UPDATE public.stock_almacen
SET cantidad = 0, updated_at = now()
WHERE almacen_id = (
  SELECT almacen_id FROM public.profiles WHERE id = '9ce48462-d81f-452f-b5f1-ab9fccaa0e9f'
)
AND producto_id IN (
  'b9127263-4c7b-4c47-b51f-6d71b4fbf71b',
  'c7d224f4-b44e-4149-9eb2-4e475c3c4b51',
  '1e257d7c-5659-4bc8-89b6-6fa1a92c1f07',
  '03a01c3d-0f5f-4d4d-86da-9f0340a77fce',
  '193b4ee4-93df-492f-b415-9f735b902565',
  'e2b9af2f-19a1-48f7-b86f-acd3fac5ba0f',
  'abcf98d7-9245-4d00-a68d-c4baca5ff2b2'
);

-- 3) Crear el movimiento de salida correcto (1 por producto entregado)
INSERT INTO public.movimientos_inventario (
  empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
  referencia_tipo, referencia_id, user_id, fecha, notas
)
SELECT
  e.empresa_id,
  'salida',
  el.producto_id,
  el.cantidad_entregada,
  (SELECT almacen_id FROM public.profiles WHERE id = '9ce48462-d81f-452f-b5f1-ab9fccaa0e9f'),
  'entrega',
  e.id,
  e.vendedor_ruta_id,
  CURRENT_DATE,
  'Entrega ' || COALESCE(e.folio, '') || ' (descuento ruta - reconciliado)'
FROM public.entregas e
JOIN public.entrega_lineas el ON el.entrega_id = e.id
WHERE e.id = '4f6ea9ae-cbb0-4734-987e-100e23b52ac1'
  AND el.cantidad_entregada > 0
  AND el.hecho = true;