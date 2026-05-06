
CREATE TABLE public.producto_presentaciones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  nombre TEXT NOT NULL,
  factor_base NUMERIC(12,3) NOT NULL CHECK (factor_base > 0),
  precio_especial NUMERIC(12,2) NULL,
  orden INT NOT NULL DEFAULT 0,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_producto_presentaciones_producto ON public.producto_presentaciones(producto_id);
CREATE INDEX idx_producto_presentaciones_empresa ON public.producto_presentaciones(empresa_id);

ALTER TABLE public.producto_presentaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa puede ver sus presentaciones"
ON public.producto_presentaciones FOR SELECT
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Empresa puede crear sus presentaciones"
ON public.producto_presentaciones FOR INSERT
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Empresa puede actualizar sus presentaciones"
ON public.producto_presentaciones FOR UPDATE
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Empresa puede eliminar sus presentaciones"
ON public.producto_presentaciones FOR DELETE
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE TRIGGER trg_producto_presentaciones_updated
BEFORE UPDATE ON public.producto_presentaciones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.venta_lineas
  ADD COLUMN presentacion_id UUID NULL,
  ADD COLUMN presentacion_nombre TEXT NULL,
  ADD COLUMN presentacion_factor NUMERIC(12,3) NULL,
  ADD COLUMN paquetes NUMERIC(12,3) NULL;

ALTER TABLE public.entrega_lineas
  ADD COLUMN presentacion_id UUID NULL,
  ADD COLUMN presentacion_nombre TEXT NULL,
  ADD COLUMN presentacion_factor NUMERIC(12,3) NULL,
  ADD COLUMN paquetes NUMERIC(12,3) NULL;
