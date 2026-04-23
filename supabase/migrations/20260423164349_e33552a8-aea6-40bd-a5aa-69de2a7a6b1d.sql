
-- Helper trigger function for updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ============= VEHICULOS =============
CREATE TABLE public.vehiculos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  placa TEXT,
  marca TEXT,
  modelo TEXT,
  anio INTEGER,
  tipo TEXT NOT NULL DEFAULT 'camioneta',
  capacidad_kg NUMERIC,
  km_actual NUMERIC NOT NULL DEFAULT 0,
  foto_url TEXT,
  vendedor_default_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'activo',
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_vehiculos_empresa ON public.vehiculos(empresa_id);
CREATE INDEX idx_vehiculos_vendedor ON public.vehiculos(vendedor_default_id);

ALTER TABLE public.vehiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "vehiculos_select_empresa" ON public.vehiculos
  FOR SELECT USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "vehiculos_insert_empresa" ON public.vehiculos
  FOR INSERT WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "vehiculos_update_empresa" ON public.vehiculos
  FOR UPDATE USING (empresa_id = public.get_my_empresa_id());
CREATE POLICY "vehiculos_delete_empresa" ON public.vehiculos
  FOR DELETE USING (empresa_id = public.get_my_empresa_id());

CREATE TRIGGER trg_vehiculos_updated_at
  BEFORE UPDATE ON public.vehiculos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============= RUTA_SESIONES =============
CREATE TABLE public.ruta_sesiones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  vehiculo_id UUID NOT NULL REFERENCES public.vehiculos(id) ON DELETE RESTRICT,
  vendedor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  carga_id UUID REFERENCES public.cargas(id) ON DELETE SET NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  inicio_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  km_inicio NUMERIC NOT NULL,
  lat_inicio NUMERIC,
  lng_inicio NUMERIC,
  foto_inicio_url TEXT,
  notas_inicio TEXT,
  fin_at TIMESTAMPTZ,
  km_fin NUMERIC,
  lat_fin NUMERIC,
  lng_fin NUMERIC,
  foto_fin_url TEXT,
  notas_fin TEXT,
  km_recorridos NUMERIC GENERATED ALWAYS AS (COALESCE(km_fin, 0) - km_inicio) STORED,
  status TEXT NOT NULL DEFAULT 'en_ruta',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ruta_sesiones_empresa ON public.ruta_sesiones(empresa_id);
CREATE INDEX idx_ruta_sesiones_vendedor ON public.ruta_sesiones(vendedor_id);
CREATE INDEX idx_ruta_sesiones_vehiculo ON public.ruta_sesiones(vehiculo_id);
CREATE INDEX idx_ruta_sesiones_fecha ON public.ruta_sesiones(fecha);
CREATE INDEX idx_ruta_sesiones_status ON public.ruta_sesiones(status);
CREATE INDEX idx_ruta_sesiones_carga ON public.ruta_sesiones(carga_id);

ALTER TABLE public.ruta_sesiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ruta_sesiones_select_empresa" ON public.ruta_sesiones
  FOR SELECT USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "ruta_sesiones_insert_empresa" ON public.ruta_sesiones
  FOR INSERT WITH CHECK (empresa_id = public.get_my_empresa_id());
CREATE POLICY "ruta_sesiones_update_empresa" ON public.ruta_sesiones
  FOR UPDATE USING (empresa_id = public.get_my_empresa_id());
CREATE POLICY "ruta_sesiones_delete_empresa" ON public.ruta_sesiones
  FOR DELETE USING (empresa_id = public.get_my_empresa_id());

CREATE TRIGGER trg_ruta_sesiones_updated_at
  BEFORE UPDATE ON public.ruta_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Validate km + sync vehiculo
CREATE OR REPLACE FUNCTION public.ruta_sesion_validate_and_sync_km()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_km_actual NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT km_actual INTO v_km_actual FROM public.vehiculos WHERE id = NEW.vehiculo_id;
    IF v_km_actual IS NOT NULL AND NEW.km_inicio < v_km_actual THEN
      RAISE EXCEPTION 'KM inicial (%) no puede ser menor al último KM registrado del vehículo (%)', NEW.km_inicio, v_km_actual;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.status = 'cerrada' AND OLD.status <> 'cerrada' THEN
      IF NEW.km_fin IS NULL THEN
        RAISE EXCEPTION 'Para cerrar la jornada se requiere KM final';
      END IF;
      IF NEW.km_fin < NEW.km_inicio THEN
        RAISE EXCEPTION 'KM final (%) no puede ser menor al KM inicial (%)', NEW.km_fin, NEW.km_inicio;
      END IF;
      IF NEW.fin_at IS NULL THEN
        NEW.fin_at := now();
      END IF;
      UPDATE public.vehiculos SET km_actual = NEW.km_fin, updated_at = now() WHERE id = NEW.vehiculo_id;
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ruta_sesion_validate
  BEFORE INSERT OR UPDATE ON public.ruta_sesiones
  FOR EACH ROW EXECUTE FUNCTION public.ruta_sesion_validate_and_sync_km();

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('ruta-fotos', 'ruta-fotos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "ruta_fotos_public_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'ruta-fotos');
CREATE POLICY "ruta_fotos_authenticated_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'ruta-fotos' AND auth.role() = 'authenticated');
CREATE POLICY "ruta_fotos_authenticated_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'ruta-fotos' AND auth.role() = 'authenticated');
CREATE POLICY "ruta_fotos_authenticated_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'ruta-fotos' AND auth.role() = 'authenticated');
