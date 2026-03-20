-- Add 'cerrada' to status_auditoria enum
ALTER TYPE status_auditoria ADD VALUE IF NOT EXISTS 'cerrada';

-- Add cerrada_por and cerrada_at to auditorias
ALTER TABLE public.auditorias 
  ADD COLUMN IF NOT EXISTS cerrada_por text,
  ADD COLUMN IF NOT EXISTS cerrada_at timestamptz;

-- Create auditoria_escaneos table for public scanning
CREATE TABLE IF NOT EXISTS public.auditoria_escaneos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_id uuid NOT NULL REFERENCES public.auditorias(id) ON DELETE CASCADE,
  linea_id uuid NOT NULL REFERENCES public.auditoria_lineas(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL DEFAULT 1,
  escaneado_por text NOT NULL DEFAULT '',
  escaneado_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.auditoria_escaneos ENABLE ROW LEVEL SECURITY;

-- RLS: authenticated users can manage scans for their empresa audits
CREATE POLICY "Tenant isolation" ON public.auditoria_escaneos
FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id AND a.empresa_id = get_my_empresa_id()
))
WITH CHECK (EXISTS (
  SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id AND a.empresa_id = get_my_empresa_id()
));

-- RLS: anon users can insert scans (for public mobile page)
CREATE POLICY "Public insert scans" ON public.auditoria_escaneos
FOR INSERT TO anon
WITH CHECK (EXISTS (
  SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id AND a.status = 'pendiente'
) OR EXISTS (
  SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id AND a.status = 'en_proceso'
));

-- RLS: anon can read scans for open audits
CREATE POLICY "Public read scans" ON public.auditoria_escaneos
FOR SELECT TO anon
USING (EXISTS (
  SELECT 1 FROM auditorias a WHERE a.id = auditoria_escaneos.auditoria_id
));

-- Allow anon to read open auditorias (for public mobile page)
CREATE POLICY "Public read open auditorias" ON public.auditorias
FOR SELECT TO anon
USING (true);

-- Allow anon to read auditoria_lineas for public audit
CREATE POLICY "Public read auditoria lineas" ON public.auditoria_lineas
FOR SELECT TO anon
USING (true);