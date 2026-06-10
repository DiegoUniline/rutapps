-- 1) Backfill: copiar proveedor_id legado al campo nuevo si está vacío
UPDATE public.productos
   SET proveedor_preferido_id = proveedor_id
 WHERE proveedor_preferido_id IS NULL
   AND proveedor_id IS NOT NULL;

-- 2) Asegurar fila en producto_proveedores para no perder la relación
INSERT INTO public.producto_proveedores (producto_id, proveedor_id, es_principal)
SELECT p.id, p.proveedor_id, true
  FROM public.productos p
 WHERE p.proveedor_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.producto_proveedores pp
      WHERE pp.producto_id = p.id AND pp.proveedor_id = p.proveedor_id
   );

-- 3) Drop columnas redundantes
ALTER TABLE public.productos DROP COLUMN IF EXISTS proveedor_id;
ALTER TABLE public.productos DROP COLUMN IF EXISTS tasa_iva_id;
ALTER TABLE public.productos DROP COLUMN IF EXISTS tasa_ieps_id;

-- 4) Drop columna fantasma codigos_barras (array) — se conserva codigo_barras (singular)
ALTER TABLE public.producto_presentaciones DROP COLUMN IF EXISTS codigos_barras;