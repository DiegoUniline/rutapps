-- Aplicar la migración que parece no haber corrido en el entorno real
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.set_ui_pref(p_key text, p_value jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_key IS NULL OR length(p_key) = 0 THEN
    RETURN;
  END IF;
  UPDATE public.profiles
     SET ui_prefs = COALESCE(ui_prefs, '{}'::jsonb) || jsonb_build_object(p_key, p_value)
   WHERE user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_ui_pref(text, jsonb) TO authenticated;