ALTER TABLE public.producto_presentaciones
  ADD COLUMN IF NOT EXISTS codigos_barras text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS idx_pp_codigos_barras_gin
  ON public.producto_presentaciones USING GIN (codigos_barras);