ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS nombre_compra text,
  ADD COLUMN IF NOT EXISTS nombre_venta  text,
  ADD COLUMN IF NOT EXISTS nombre_ticket text;