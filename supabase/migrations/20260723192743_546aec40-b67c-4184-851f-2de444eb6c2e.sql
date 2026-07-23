-- 1. Add empresa_id column
ALTER TABLE public.venta_lineas ADD COLUMN IF NOT EXISTS empresa_id uuid;

-- 2. Backfill from venta header
UPDATE public.venta_lineas vl
SET empresa_id = v.empresa_id
FROM public.ventas v
WHERE vl.venta_id = v.id
  AND vl.empresa_id IS DISTINCT FROM v.empresa_id;

-- 3. Trigger to auto-fill empresa_id from parent venta on insert/update
CREATE OR REPLACE FUNCTION public.set_venta_linea_empresa_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.empresa_id IS NULL OR (TG_OP = 'UPDATE' AND NEW.venta_id IS DISTINCT FROM OLD.venta_id) THEN
    SELECT v.empresa_id INTO NEW.empresa_id
    FROM public.ventas v
    WHERE v.id = NEW.venta_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_venta_linea_empresa_id ON public.venta_lineas;
CREATE TRIGGER trg_set_venta_linea_empresa_id
BEFORE INSERT OR UPDATE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.set_venta_linea_empresa_id();

-- 4. Enforce NOT NULL after backfill
ALTER TABLE public.venta_lineas ALTER COLUMN empresa_id SET NOT NULL;

-- 5. FK + index
DO $$ BEGIN
  ALTER TABLE public.venta_lineas
    ADD CONSTRAINT venta_lineas_empresa_id_fkey
    FOREIGN KEY (empresa_id) REFERENCES public.empresas(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_venta_lineas_empresa_id ON public.venta_lineas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_venta_lineas_empresa_venta ON public.venta_lineas(empresa_id, venta_id);

-- 6. Add empresa_id to supabase_realtime publication filter capability (REPLICA IDENTITY already set)
ALTER TABLE public.venta_lineas REPLICA IDENTITY FULL;