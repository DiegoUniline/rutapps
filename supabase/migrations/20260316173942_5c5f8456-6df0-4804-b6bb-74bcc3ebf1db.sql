
ALTER TABLE public.cfdis
  ADD COLUMN IF NOT EXISTS cadena_original text,
  ADD COLUMN IF NOT EXISTS sello_cfdi text,
  ADD COLUMN IF NOT EXISTS sello_sat text,
  ADD COLUMN IF NOT EXISTS no_certificado_sat text,
  ADD COLUMN IF NOT EXISTS no_certificado_emisor text,
  ADD COLUMN IF NOT EXISTS fecha_timbrado text;
