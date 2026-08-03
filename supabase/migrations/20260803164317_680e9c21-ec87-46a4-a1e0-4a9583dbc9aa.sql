ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS fecha_vencimiento date,
  ADD COLUMN IF NOT EXISTS numero_factura text;

ALTER TABLE public.compra_lineas
  ADD COLUMN IF NOT EXISTS lote_id uuid REFERENCES public.lotes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_compra_lineas_lote_id ON public.compra_lineas(lote_id);