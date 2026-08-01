-- Forzar visibilidad de la columna IVA en los perfiles que ya tienen preferencias guardadas
UPDATE public.profiles 
SET ui_prefs = jsonb_set(ui_prefs, '{cols_ventas,iva}', 'true'::jsonb)
WHERE ui_prefs ? 'cols_ventas';