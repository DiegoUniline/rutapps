-- Historial de posiciones GPS de los vendedores (recorrido del día)
CREATE TABLE IF NOT EXISTS public.vendedor_ubicaciones_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy double precision,
  battery_level integer,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

-- Índice principal: consulta por vendedor + fecha (recorrido del día)
CREATE INDEX IF NOT EXISTS idx_vuh_user_recorded
  ON public.vendedor_ubicaciones_historial (user_id, recorded_at DESC);

-- Índice secundario por empresa (para limpieza/listados)
CREATE INDEX IF NOT EXISTS idx_vuh_empresa_recorded
  ON public.vendedor_ubicaciones_historial (empresa_id, recorded_at DESC);

-- RLS
ALTER TABLE public.vendedor_ubicaciones_historial ENABLE ROW LEVEL SECURITY;

-- Cada empresa puede leer su propio historial
CREATE POLICY "Empresa puede leer su historial"
  ON public.vendedor_ubicaciones_historial
  FOR SELECT
  TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

-- Un usuario puede insertar sus propios puntos
CREATE POLICY "Usuario inserta su propio punto"
  ON public.vendedor_ubicaciones_historial
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND empresa_id = public.get_my_empresa_id()
  );

-- Limpieza automática: borrar puntos con más de 7 días
CREATE OR REPLACE FUNCTION public.cleanup_old_vendedor_historial()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.vendedor_ubicaciones_historial
  WHERE recorded_at < now() - interval '7 days';
$$;