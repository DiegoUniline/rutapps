
CREATE OR REPLACE FUNCTION public.trg_entrega_lineas_consume_apartado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linea_id uuid;
  v_apartado numeric;
BEGIN
  SELECT vl.id INTO v_linea_id
    FROM public.venta_lineas vl
    JOIN public.entregas e ON e.id = NEW.entrega_id
   WHERE vl.venta_id = e.pedido_id
     AND vl.producto_id = NEW.producto_id
   LIMIT 1;

  IF v_linea_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cantidad INTO v_apartado FROM public.stock_apartado WHERE venta_linea_id = v_linea_id;
  IF v_apartado IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_apartado - COALESCE(NEW.cantidad_pedida, 0) <= 0 THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = v_linea_id;
  ELSE
    UPDATE public.stock_apartado
       SET cantidad = cantidad - COALESCE(NEW.cantidad_pedida, 0), updated_at = now()
     WHERE venta_linea_id = v_linea_id;
  END IF;

  RETURN NEW;
END;
$function$;
