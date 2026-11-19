
-- Fix entregas that were surtido/cargado but almacen_id is null
-- Set almacen_id from the first entrega_linea that has almacen_origen_id
UPDATE public.entregas e
SET almacen_id = (
  SELECT el.almacen_origen_id
  FROM public.entrega_lineas el
  WHERE el.entrega_id = e.id AND el.almacen_origen_id IS NOT NULL
  LIMIT 1
)
WHERE e.almacen_id IS NULL
  AND e.status IN ('surtido', 'cargado', 'asignado', 'en_ruta', 'hecho')
  AND EXISTS (
    SELECT 1 FROM public.entrega_lineas el2
    WHERE el2.entrega_id = e.id AND el2.almacen_origen_id IS NOT NULL
  );
