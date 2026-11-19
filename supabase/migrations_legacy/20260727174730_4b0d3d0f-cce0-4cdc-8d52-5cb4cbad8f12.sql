ALTER TABLE public.visitas DROP CONSTRAINT visitas_venta_id_fkey;
ALTER TABLE public.visitas ADD CONSTRAINT visitas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES public.ventas(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_visitas_venta_id ON public.visitas(venta_id);