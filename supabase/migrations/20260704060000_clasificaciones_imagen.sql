-- Categorías (clasificaciones) con imagen para la tienda en línea.
ALTER TABLE public.clasificaciones ADD COLUMN IF NOT EXISTS imagen_url text;
