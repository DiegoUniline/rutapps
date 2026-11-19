ALTER TABLE public.wa_bot_authorized_numbers
  ADD COLUMN IF NOT EXISTS pref_reporte_diario_formato text NOT NULL DEFAULT 'pdf'
    CHECK (pref_reporte_diario_formato IN ('pdf','excel','ambos'));