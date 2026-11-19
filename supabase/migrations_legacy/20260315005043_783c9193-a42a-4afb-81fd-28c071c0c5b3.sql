
ALTER TABLE public.tarifa_lineas
  ADD COLUMN IF NOT EXISTS redondeo text NOT NULL DEFAULT 'ninguno';
-- Values: 'ninguno', 'arriba', 'abajo', 'cercano'
