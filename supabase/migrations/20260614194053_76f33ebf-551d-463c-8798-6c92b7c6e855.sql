-- Equiparar cotizaciones a ventas: agregar columnas de impuestos y lista de precios

ALTER TABLE public.cotizaciones
  ADD COLUMN IF NOT EXISTS iva_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ieps_total numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lista_precio_id uuid,
  ADD COLUMN IF NOT EXISTS descuento_extra numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS descuento_extra_tipo text NOT NULL DEFAULT 'porcentaje',
  ADD COLUMN IF NOT EXISTS descuento_extra_motivo text;

ALTER TABLE public.cotizacion_lineas
  ADD COLUMN IF NOT EXISTS iva_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ieps_pct numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS iva_monto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ieps_monto numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS unidad_id uuid,
  ADD COLUMN IF NOT EXISTS lista_precio_id uuid,
  ADD COLUMN IF NOT EXISTS precio_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS notas text;

-- Backfill impuesto_pct/impuesto desde iva_pct/iva_monto en filas existentes (si aplica)
UPDATE public.cotizacion_lineas
   SET iva_pct = COALESCE(impuesto_pct, 0),
       iva_monto = COALESCE(impuesto, 0)
 WHERE iva_pct = 0 AND COALESCE(impuesto_pct,0) > 0;