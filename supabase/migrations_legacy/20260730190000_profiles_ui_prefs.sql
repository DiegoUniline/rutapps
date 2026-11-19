-- ============================================================================
-- Preferencias de UI por usuario (cross-device).
--
-- Guarda ajustes de interfaz —p. ej. qué columnas ve cada quien en el detalle
-- de la venta— en el perfil del usuario, para que lo sigan en cualquier
-- dispositivo (antes solo vivían en localStorage, por navegador).
--
-- Estructura: profiles.ui_prefs jsonb, un objeto plano { clave: valor }.
--   La app namespacea cada ajuste (p. ej. "cols_venta_detalle_lineas").
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS ui_prefs jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Merge atómico de UNA clave sin pisar las demás. SECURITY DEFINER + auth.uid()
-- para que cada usuario solo pueda escribir SU propio perfil, sin depender de
-- políticas de UPDATE sobre profiles. Namespacea tú la clave desde la app.
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
