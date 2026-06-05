
-- Add codigo_origen column to productos (external system code)
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS codigo_origen TEXT;
CREATE INDEX IF NOT EXISTS idx_productos_codigo_origen ON public.productos(empresa_id, codigo_origen) WHERE codigo_origen IS NOT NULL;

-- 1) producto_equivalencias: maps N external codes to one internal producto
CREATE TABLE IF NOT EXISTS public.producto_equivalencias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  codigo_externo TEXT NOT NULL,
  sistema_origen TEXT,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  UNIQUE (empresa_id, codigo_externo, sistema_origen)
);
CREATE INDEX IF NOT EXISTS idx_pe_empresa ON public.producto_equivalencias(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pe_producto ON public.producto_equivalencias(producto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_equivalencias TO authenticated;
GRANT ALL ON public.producto_equivalencias TO service_role;

ALTER TABLE public.producto_equivalencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant manage producto_equivalencias"
ON public.producto_equivalencias FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

-- 2) import_jobs: header for each import run
CREATE TABLE IF NOT EXISTS public.import_jobs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  tipo TEXT NOT NULL DEFAULT 'homologacion_catalogo',
  archivo_nombre TEXT,
  sistema_origen TEXT,
  total_filas INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  sin_coincidencia INTEGER NOT NULL DEFAULT 0,
  duplicados INTEGER NOT NULL DEFAULT 0,
  errores INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'procesando',
  resumen JSONB,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_import_jobs_empresa ON public.import_jobs(empresa_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_jobs TO authenticated;
GRANT ALL ON public.import_jobs TO service_role;

ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant manage import_jobs"
ON public.import_jobs FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

-- 3) import_job_lineas: per-row detail
CREATE TABLE IF NOT EXISTS public.import_job_lineas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
  empresa_id UUID NOT NULL,
  fila_num INTEGER NOT NULL,
  codigo_externo TEXT,
  descripcion_externa TEXT,
  cantidad NUMERIC,
  precio NUMERIC,
  producto_id UUID REFERENCES public.productos(id) ON DELETE SET NULL,
  match_tipo TEXT NOT NULL,
  mensaje TEXT,
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ijl_job ON public.import_job_lineas(job_id);
CREATE INDEX IF NOT EXISTS idx_ijl_empresa ON public.import_job_lineas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_ijl_match ON public.import_job_lineas(job_id, match_tipo);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_job_lineas TO authenticated;
GRANT ALL ON public.import_job_lineas TO service_role;

ALTER TABLE public.import_job_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant manage import_job_lineas"
ON public.import_job_lineas FOR ALL
TO authenticated
USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

-- updated_at triggers
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_pe_updated ON public.producto_equivalencias;
CREATE TRIGGER trg_pe_updated BEFORE UPDATE ON public.producto_equivalencias
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_ij_updated ON public.import_jobs;
CREATE TRIGGER trg_ij_updated BEFORE UPDATE ON public.import_jobs
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
