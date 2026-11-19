
CREATE TABLE public.reportes_personalizados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  fuente text NOT NULL DEFAULT 'ventas',
  columnas jsonb NOT NULL DEFAULT '[]'::jsonb,
  filtros_default jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reportes_personalizados_empresa ON public.reportes_personalizados(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.reportes_personalizados TO authenticated;
GRANT ALL ON public.reportes_personalizados TO service_role;

ALTER TABLE public.reportes_personalizados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Empresa members manage reportes_personalizados"
ON public.reportes_personalizados FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
