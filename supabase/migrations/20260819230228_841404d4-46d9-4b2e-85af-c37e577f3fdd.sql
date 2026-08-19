ALTER TYPE public.status_solicitud_traspaso ADD VALUE IF NOT EXISTS 'cerrada';
ALTER TABLE public.solicitudes_traspaso
  ADD COLUMN IF NOT EXISTS cerrado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cerrado_por uuid,
  ADD COLUMN IF NOT EXISTS motivo_cierre text;