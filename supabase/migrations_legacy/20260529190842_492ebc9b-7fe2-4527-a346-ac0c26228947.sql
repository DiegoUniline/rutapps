ALTER TABLE public.producto_presentaciones
  ADD COLUMN IF NOT EXISTS codigo_barras text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_presentaciones_codigo_barras_empresa
  ON public.producto_presentaciones (empresa_id, lower(codigo_barras))
  WHERE codigo_barras IS NOT NULL AND length(trim(codigo_barras)) > 0;

CREATE INDEX IF NOT EXISTS idx_presentaciones_codigo_barras
  ON public.producto_presentaciones (codigo_barras)
  WHERE codigo_barras IS NOT NULL;