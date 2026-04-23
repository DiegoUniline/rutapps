ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS requiere_jornada_ruta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS requiere_jornada_desde date;

-- Mantener activa la empresa de prueba a partir de mañana
UPDATE public.empresas
   SET requiere_jornada_ruta = true,
       requiere_jornada_desde = (CURRENT_DATE + INTERVAL '1 day')::date
 WHERE id = '6d849e12-6437-4b24-917d-a89cc9b2fa88';