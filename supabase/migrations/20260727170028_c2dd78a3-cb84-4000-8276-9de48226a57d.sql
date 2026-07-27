GRANT SELECT, INSERT, UPDATE, DELETE ON public.promocion_aplicada TO authenticated;
GRANT ALL ON public.promocion_aplicada TO service_role;
CREATE INDEX IF NOT EXISTS idx_promocion_aplicada_venta_id ON public.promocion_aplicada(venta_id);
CREATE INDEX IF NOT EXISTS idx_promocion_aplicada_venta_linea_id ON public.promocion_aplicada(venta_linea_id);