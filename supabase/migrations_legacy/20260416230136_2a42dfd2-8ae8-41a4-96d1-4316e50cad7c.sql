-- ============================================================
-- VENDEDOR LIVE LOCATIONS
-- Solo guarda la última posición (1 fila por vendedor) + RLS estricto
-- ============================================================

CREATE TABLE IF NOT EXISTS public.vendedor_ubicaciones (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  lat            double precision NOT NULL,
  lng            double precision NOT NULL,
  accuracy       real,
  speed          real,
  heading        real,
  battery_level  smallint,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vendedor_ubicaciones_empresa
  ON public.vendedor_ubicaciones (empresa_id, updated_at DESC);

ALTER TABLE public.vendedor_ubicaciones ENABLE ROW LEVEL SECURITY;

-- Policy: el propio usuario puede insertar/actualizar SU ubicación
CREATE POLICY "vu_self_upsert"
  ON public.vendedor_ubicaciones
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid() AND empresa_id = public.get_my_empresa_id());

CREATE POLICY "vu_self_update"
  ON public.vendedor_ubicaciones
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid() AND empresa_id = public.get_my_empresa_id());

-- Policy: cualquier usuario autenticado de la misma empresa puede VER las ubicaciones
-- (los supervisores las usan; el rol granular se filtra en frontend con permisos)
CREATE POLICY "vu_company_select"
  ON public.vendedor_ubicaciones
  FOR SELECT
  TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

-- Policy: el propio usuario puede borrar su ubicación (al cerrar sesión)
CREATE POLICY "vu_self_delete"
  ON public.vendedor_ubicaciones
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.vendedor_ubicaciones;
ALTER TABLE public.vendedor_ubicaciones REPLICA IDENTITY FULL;

-- Auto-limpieza: borrar ubicaciones >24h de inactividad (mantiene tabla pequeña)
CREATE OR REPLACE FUNCTION public.cleanup_stale_vendedor_ubicaciones()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.vendedor_ubicaciones
  WHERE updated_at < now() - interval '24 hours';
$$;