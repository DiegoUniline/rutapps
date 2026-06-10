
CREATE TABLE IF NOT EXISTS public.metas_venta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  vendedor_id uuid NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  producto_id uuid NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  presentacion_id uuid NULL REFERENCES public.producto_presentaciones(id) ON DELETE CASCADE,
  periodo_year int NOT NULL,
  periodo_month int NOT NULL CHECK (periodo_month BETWEEN 1 AND 12),
  meta_unidades numeric NOT NULL DEFAULT 0,
  meta_monto numeric NOT NULL DEFAULT 0,
  notas text NULL,
  created_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS metas_venta_unique_key
  ON public.metas_venta (
    empresa_id,
    COALESCE(vendedor_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(producto_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(presentacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
    periodo_year,
    periodo_month
  );

CREATE INDEX IF NOT EXISTS metas_venta_periodo_idx ON public.metas_venta (empresa_id, periodo_year, periodo_month);
CREATE INDEX IF NOT EXISTS metas_venta_vendedor_idx ON public.metas_venta (empresa_id, vendedor_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.metas_venta TO authenticated;
GRANT ALL ON public.metas_venta TO service_role;

ALTER TABLE public.metas_venta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "metas_venta tenant access"
  ON public.metas_venta
  FOR ALL
  TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE OR REPLACE FUNCTION public.metas_venta_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS metas_venta_updated_at ON public.metas_venta;
CREATE TRIGGER metas_venta_updated_at
  BEFORE UPDATE ON public.metas_venta
  FOR EACH ROW EXECUTE FUNCTION public.metas_venta_set_updated_at();
