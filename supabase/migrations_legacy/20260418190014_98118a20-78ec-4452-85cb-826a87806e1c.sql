ALTER TABLE public.cliente_orden_ruta
ADD COLUMN IF NOT EXISTS origin_lat double precision,
ADD COLUMN IF NOT EXISTS origin_lng double precision,
ADD COLUMN IF NOT EXISTS origin_label text;

UPDATE public.cliente_orden_ruta cor
SET
  origin_lat = a.gps_lat,
  origin_lng = a.gps_lng,
  origin_label = COALESCE(cor.origin_label, a.nombre)
FROM public.profiles p
JOIN public.almacenes a ON a.id = p.almacen_id
WHERE cor.vendedor_id IS NOT NULL
  AND cor.vendedor_id = p.id
  AND a.gps_lat IS NOT NULL
  AND a.gps_lng IS NOT NULL
  AND (cor.origin_lat IS NULL OR cor.origin_lng IS NULL);