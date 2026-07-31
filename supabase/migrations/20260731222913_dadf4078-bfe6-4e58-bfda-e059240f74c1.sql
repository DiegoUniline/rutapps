ALTER TABLE public.venta_lineas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS update_venta_lineas_updated_at ON public.venta_lineas;
CREATE TRIGGER update_venta_lineas_updated_at
BEFORE UPDATE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();