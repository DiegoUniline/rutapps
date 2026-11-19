ALTER TABLE public.almacenes
  ADD COLUMN IF NOT EXISTS gps_lat numeric,
  ADD COLUMN IF NOT EXISTS gps_lng numeric,
  ADD COLUMN IF NOT EXISTS direccion text;