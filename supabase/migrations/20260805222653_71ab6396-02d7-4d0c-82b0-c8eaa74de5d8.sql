CREATE OR REPLACE FUNCTION public.trg_venta_sync_inventario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ventas' THEN
    PERFORM public.fn_sync_venta_inventario(COALESCE(NEW.id, OLD.id));
  ELSE
    v_id := COALESCE(NEW.venta_id, OLD.venta_id);
    PERFORM public.fn_sync_venta_inventario(v_id);
    IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'venta_lineas'
       AND NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN
      PERFORM public.fn_sync_venta_inventario(OLD.venta_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;