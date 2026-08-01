-- Habilitar globalmente el desglose y forzar visibilidad de las nuevas columnas para todos los usuarios
UPDATE public.feature_flags SET alcance = 'todos' WHERE clave = 'venta_linea_desglose';

UPDATE public.profiles 
SET ui_prefs = jsonb_set(
  jsonb_set(
    COALESCE(ui_prefs, '{}'::jsonb), 
    '{cols_ventas,iva}', 
    'true'::jsonb
  ),
  '{cols_ventas,subtotal}',
  'true'::jsonb
)
WHERE true;