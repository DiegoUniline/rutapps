-- Reembolsos de devolución ligados a la venta (egreso en Gastos).
-- Aditivo: agrega columnas para poder ligar un gasto a una venta y a la
-- devolución que lo originó, y el método de pago del reembolso.

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS devolucion_id uuid REFERENCES public.devoluciones(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metodo_pago text;

ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS reembolso_metodo text;

CREATE INDEX IF NOT EXISTS idx_gastos_venta ON public.gastos (venta_id) WHERE venta_id IS NOT NULL;
