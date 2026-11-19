
-- Polyline cache for optimize-route edge function
CREATE TABLE public.ruta_polyline_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  vendedor_id text NOT NULL,
  waypoints_hash text NOT NULL,
  encoded_polyline text NOT NULL,
  distancia_total_m integer,
  duracion_total_s integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (vendedor_id, waypoints_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ruta_polyline_cache TO authenticated;
GRANT ALL ON public.ruta_polyline_cache TO service_role;
ALTER TABLE public.ruta_polyline_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polyline_cache empresa access" ON public.ruta_polyline_cache FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));
CREATE INDEX ON public.ruta_polyline_cache (empresa_id, vendedor_id);

-- Distance pair cache (rounded coords)
CREATE TABLE public.distancia_cache (
  empresa_id uuid NOT NULL,
  origen_hash text NOT NULL,
  destino_hash text NOT NULL,
  distancia_m integer NOT NULL,
  duracion_s integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_id, origen_hash, destino_hash)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.distancia_cache TO authenticated;
GRANT ALL ON public.distancia_cache TO service_role;
ALTER TABLE public.distancia_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "distancia_cache empresa access" ON public.distancia_cache FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));
