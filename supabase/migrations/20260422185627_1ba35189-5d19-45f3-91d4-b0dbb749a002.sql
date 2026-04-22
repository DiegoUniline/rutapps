-- Reconciliar entrega ENT-0002 (514e64ad-c2b3-4c85-bb3b-d56113003b8f)
-- Falta el movimiento de salida del almacén "Ruta Andrey" al validar la entrega.

-- 1) Insertar las salidas faltantes desde el almacén del vendedor
INSERT INTO public.movimientos_inventario (
  empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
  referencia_tipo, referencia_id, user_id, fecha, notas
)
SELECT
  e.empresa_id,
  'salida',
  el.producto_id,
  el.cantidad_entregada,
  (SELECT almacen_id FROM public.profiles WHERE id = COALESCE(e.vendedor_ruta_id, e.vendedor_id)),
  'entrega',
  e.id,
  COALESCE(e.vendedor_ruta_id, e.vendedor_id),
  CURRENT_DATE,
  'Entrega ' || COALESCE(e.folio, '') || ' (descuento ruta - reconciliado)'
FROM public.entregas e
JOIN public.entrega_lineas el ON el.entrega_id = e.id
WHERE e.id = '514e64ad-c2b3-4c85-bb3b-d56113003b8f'
  AND el.cantidad_entregada > 0
  AND el.hecho = true;

-- 2) Descontar del stock_almacen del vendedor
UPDATE public.stock_almacen sa
SET cantidad = GREATEST(0, sa.cantidad - el.cantidad_entregada),
    updated_at = now()
FROM public.entrega_lineas el
JOIN public.entregas e ON e.id = el.entrega_id
WHERE e.id = '514e64ad-c2b3-4c85-bb3b-d56113003b8f'
  AND el.hecho = true
  AND el.cantidad_entregada > 0
  AND sa.producto_id = el.producto_id
  AND sa.almacen_id = (SELECT almacen_id FROM public.profiles WHERE id = COALESCE(e.vendedor_ruta_id, e.vendedor_id));