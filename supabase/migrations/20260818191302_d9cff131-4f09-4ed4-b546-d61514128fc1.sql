CREATE OR REPLACE FUNCTION public.fn_fill_venta_linea_almacen()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.almacen_id IS NULL THEN
    SELECT v.almacen_id INTO NEW.almacen_id
    FROM public.ventas v
    WHERE v.id = NEW.venta_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_venta_linea_almacen ON public.venta_lineas;
CREATE TRIGGER trg_fill_venta_linea_almacen
BEFORE INSERT OR UPDATE OF almacen_id, venta_id ON public.venta_lineas
FOR EACH ROW
EXECUTE FUNCTION public.fn_fill_venta_linea_almacen();