
-- Make carga_id nullable (liquidation can happen without a carga)
ALTER TABLE public.descarga_ruta ALTER COLUMN carga_id DROP NOT NULL;

-- Add date range columns for weekly/period liquidations
ALTER TABLE public.descarga_ruta ADD COLUMN fecha_inicio date DEFAULT NULL;
ALTER TABLE public.descarga_ruta ADD COLUMN fecha_fin date DEFAULT NULL;
