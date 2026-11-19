-- Add POS origin tracking to ventas
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS origen text,
  ADD COLUMN IF NOT EXISTS turno_id uuid REFERENCES public.caja_turnos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ventas_origen ON public.ventas(origen) WHERE origen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_turno_id ON public.ventas(turno_id) WHERE turno_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ventas_empresa_origen_fecha ON public.ventas(empresa_id, origen, fecha DESC) WHERE origen = 'pos';