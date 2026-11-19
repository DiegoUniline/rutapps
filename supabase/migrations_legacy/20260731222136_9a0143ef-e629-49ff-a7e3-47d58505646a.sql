ALTER TABLE public.venta_lineas
  ADD COLUMN IF NOT EXISTS precio_lista_unitario numeric,
  ADD COLUMN IF NOT EXISTS importe_bruto numeric,
  ADD COLUMN IF NOT EXISTS descuento_promocion_monto numeric,
  ADD COLUMN IF NOT EXISTS base_descuento_manual numeric,
  ADD COLUMN IF NOT EXISTS descuento_manual_monto numeric,
  ADD COLUMN IF NOT EXISTS descuento_total_monto numeric,
  ADD COLUMN IF NOT EXISTS base_ieps numeric,
  ADD COLUMN IF NOT EXISTS base_iva numeric,
  ADD COLUMN IF NOT EXISTS impuestos_totales numeric,
  ADD COLUMN IF NOT EXISTS descuento_manual boolean,
  ADD COLUMN IF NOT EXISTS motivo_descuento_manual text,
  ADD COLUMN IF NOT EXISTS descuento_registrado_por uuid,
  ADD COLUMN IF NOT EXISTS promocion_id uuid,
  ADD COLUMN IF NOT EXISTS promocion_nombre text,
  ADD COLUMN IF NOT EXISTS cantidad_bonificada numeric,
  ADD COLUMN IF NOT EXISTS es_bonificacion boolean,
  ADD COLUMN IF NOT EXISTS objeto_impuesto text;

INSERT INTO public.feature_flags (clave, nombre, descripcion, notas_prueba, alcance, licencias)
VALUES (
  'venta_linea_desglose',
  'Desglose completo por línea de venta',
  'Guarda el desglose de precio de lista, promoción, descuento manual e impuestos en cada línea de venta.',
  'Probar solo con la licencia 12324489. No modifica totales ni saldos: solo agrega campos informativos.',
  'licencias',
  ARRAY['12324489']
)
ON CONFLICT (clave) DO NOTHING;