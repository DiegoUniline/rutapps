ALTER TABLE public.venta_lineas
ADD COLUMN IF NOT EXISTS lista_precio_id uuid REFERENCES public.lista_precios(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS precio_manual boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_venta_lineas_lista_precio_id ON public.venta_lineas(lista_precio_id);