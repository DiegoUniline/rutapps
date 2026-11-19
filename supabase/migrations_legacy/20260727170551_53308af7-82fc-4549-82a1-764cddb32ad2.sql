CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clave text NOT NULL UNIQUE,
  nombre text NOT NULL,
  descripcion text,
  notas_prueba text,
  alcance text NOT NULL DEFAULT 'nadie',
  licencias text[] NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_feature_flags_clave ON public.feature_flags(clave);

GRANT SELECT ON public.feature_flags TO authenticated;
GRANT ALL ON public.feature_flags TO service_role;

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "feature_flags_select_auth" ON public.feature_flags
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "feature_flags_admin_all" ON public.feature_flags
  FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

GRANT INSERT, UPDATE, DELETE ON public.feature_flags TO authenticated;

CREATE TRIGGER trg_feature_flags_updated_at
  BEFORE UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.validate_feature_flag_alcance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.alcance NOT IN ('nadie','licencias','todos') THEN
    RAISE EXCEPTION 'alcance invalido: %', NEW.alcance;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_feature_flags_validate
  BEFORE INSERT OR UPDATE ON public.feature_flags
  FOR EACH ROW EXECUTE FUNCTION public.validate_feature_flag_alcance();

INSERT INTO public.feature_flags (clave, nombre, descripcion, notas_prueba, alcance, licencias)
VALUES (
  'promo_persist',
  'Promociones en reportes',
  'Guarda el desglose del descuento por promocion en cada linea de venta para que los reportes por producto y por cliente no cuenten los productos gratis a precio completo.',
  E'1) Ventas > nueva venta con promocion (ej. 9 piezas con 1 gratis) y guardar.\n2) Reportes > Reporte general > Ventas por producto: el total del producto gratis debe bajar.\n3) Reportes > Producto por cliente: mismo ajuste.\n4) Reabrir la venta y volver a guardar: el descuento NO debe duplicarse.\n5) Ruta movil: hacer venta con promocion offline, sincronizar y revisar el reporte.',
  'licencias',
  ARRAY['12324489']
);