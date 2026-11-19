ALTER TABLE public.producto_presentaciones
  ADD COLUMN IF NOT EXISTS es_principal_stock BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_producto_presentaciones_principal_unica
  ON public.producto_presentaciones(producto_id)
  WHERE es_principal_stock = true;