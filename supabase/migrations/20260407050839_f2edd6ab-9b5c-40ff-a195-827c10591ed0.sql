-- Migration 5: Descarga de ruta — deduct stock_camion when approved
CREATE OR REPLACE FUNCTION public.apply_descarga_ruta_aprobada()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric;
  v_new_qty numeric;
BEGIN
  IF NEW.status <> 'aprobada' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprobada' THEN RETURN NEW; END IF;

  FOR v_linea IN
    SELECT producto_id, cantidad_real
    FROM public.descarga_ruta_lineas
    WHERE descarga_id = NEW.id AND cantidad_real > 0
  LOOP
    SELECT id, cantidad_actual INTO v_stock_id, v_stock_actual
    FROM public.stock_camion
    WHERE vendedor_id = NEW.vendedor_id
      AND producto_id = v_linea.producto_id
    ORDER BY fecha DESC
    LIMIT 1
    FOR UPDATE;

    IF v_stock_id IS NOT NULL THEN
      v_new_qty := GREATEST(0, COALESCE(v_stock_actual, 0) - v_linea.cantidad_real);
      UPDATE public.stock_camion SET cantidad_actual = v_new_qty WHERE id = v_stock_id;
    END IF;

    INSERT INTO public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, vendedor_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES
      (gen_random_uuid(), NEW.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad_real,
       NEW.vendedor_id, 'descarga', NEW.id, NEW.aprobado_por,
       COALESCE(NEW.fecha, current_date), now(), 'Descarga de ruta aprobada');
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_apply_descarga_ruta_aprobada ON descarga_ruta;
CREATE TRIGGER trg_apply_descarga_ruta_aprobada
  AFTER UPDATE OF status ON descarga_ruta
  FOR EACH ROW EXECUTE FUNCTION apply_descarga_ruta_aprobada();