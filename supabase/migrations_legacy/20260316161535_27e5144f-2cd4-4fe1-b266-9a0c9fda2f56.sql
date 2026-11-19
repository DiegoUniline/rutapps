-- 1. Add fiscal fields to clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS requiere_factura boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS facturama_rfc text,
  ADD COLUMN IF NOT EXISTS facturama_razon_social text,
  ADD COLUMN IF NOT EXISTS facturama_regimen_fiscal text,
  ADD COLUMN IF NOT EXISTS facturama_uso_cfdi text,
  ADD COLUMN IF NOT EXISTS facturama_cp text,
  ADD COLUMN IF NOT EXISTS facturama_correo_facturacion text,
  ADD COLUMN IF NOT EXISTS facturama_id text;

-- 2. Add facturado fields to venta_lineas
ALTER TABLE public.venta_lineas
  ADD COLUMN IF NOT EXISTS facturado boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS factura_cfdi_id uuid REFERENCES public.cfdis(id);

-- 3. Add requiere_factura to ventas
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS requiere_factura boolean DEFAULT false;