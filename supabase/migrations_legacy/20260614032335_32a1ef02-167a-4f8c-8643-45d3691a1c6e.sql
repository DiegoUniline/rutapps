ALTER TABLE public.wa_bot_authorized_numbers
  ADD COLUMN IF NOT EXISTS pref_reporte_diario_frecuencia text NOT NULL DEFAULT 'diario'
    CHECK (pref_reporte_diario_frecuencia IN ('diario','semanal'));