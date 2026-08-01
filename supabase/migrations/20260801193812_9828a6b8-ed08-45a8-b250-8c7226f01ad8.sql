ALTER TABLE public.venta_lineas
  ADD CONSTRAINT venta_lineas_lote_id_fkey
  FOREIGN KEY (lote_id) REFERENCES public.lotes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_venta_lineas_lote_id ON public.venta_lineas(lote_id);