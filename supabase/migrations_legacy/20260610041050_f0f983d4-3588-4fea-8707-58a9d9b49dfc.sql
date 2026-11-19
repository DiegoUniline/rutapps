-- Drop unused/incomplete tables
DROP TABLE IF EXISTS public.producto_lotes CASCADE;
DROP TABLE IF EXISTS public.producto_tarifas CASCADE;

-- Drop unused columns on productos
ALTER TABLE public.productos DROP COLUMN IF EXISTS manejar_lotes;
ALTER TABLE public.productos DROP COLUMN IF EXISTS contador;
ALTER TABLE public.productos DROP COLUMN IF EXISTS contador_tarifas;