ALTER TABLE public.compras ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) DEFAULT auth.uid();
CREATE INDEX IF NOT EXISTS idx_compras_created_by ON public.compras(created_by);