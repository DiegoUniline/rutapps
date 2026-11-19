CREATE TABLE public.consumo_datos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fecha date NOT NULL,
  origen text NOT NULL DEFAULT 'escritorio',
  bytes_descarga bigint NOT NULL DEFAULT 0,
  bytes_subida bigint NOT NULL DEFAULT 0,
  peticiones integer NOT NULL DEFAULT 0,
  desglose jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT consumo_datos_origen_chk CHECK (origen IN ('ruta','escritorio')),
  CONSTRAINT consumo_datos_unico UNIQUE (empresa_id, user_id, fecha, origen)
);

CREATE INDEX idx_consumo_datos_empresa_fecha ON public.consumo_datos (empresa_id, fecha DESC);
CREATE INDEX idx_consumo_datos_user_fecha ON public.consumo_datos (user_id, fecha DESC);

GRANT SELECT, INSERT, UPDATE ON public.consumo_datos TO authenticated;
GRANT ALL ON public.consumo_datos TO service_role;

ALTER TABLE public.consumo_datos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "consumo_datos_select_empresa"
ON public.consumo_datos FOR SELECT TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "consumo_datos_insert_propio"
ON public.consumo_datos FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())));

CREATE POLICY "consumo_datos_update_propio"
ON public.consumo_datos FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_consumo_datos_updated_at
BEFORE UPDATE ON public.consumo_datos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.limpiar_consumo_datos_antiguo()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.consumo_datos WHERE fecha < (CURRENT_DATE - INTERVAL '90 days');
$$;