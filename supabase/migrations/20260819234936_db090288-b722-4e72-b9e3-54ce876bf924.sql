ALTER TYPE aplica_a_tarifa ADD VALUE IF NOT EXISTS 'grupo';
ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS grupo_precio text;
ALTER TABLE public.tarifa_lineas ADD COLUMN IF NOT EXISTS grupos text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS idx_productos_grupo_precio ON public.productos(empresa_id, grupo_precio);