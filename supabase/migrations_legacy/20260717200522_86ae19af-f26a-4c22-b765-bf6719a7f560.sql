
-- Ensure producto.costo se actualiza SIEMPRE según calculo_costo
-- Cubre: INSERT/UPDATE de compras, cambios en compra_lineas,
-- cambios de calculo_costo/proveedor principal en producto, y proveedor principal.

-- 1) Trigger de compras: INSERT y UPDATE (no sólo transición de status)
CREATE OR REPLACE FUNCTION public.trg_compra_recalc_costos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_should boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_should := NEW.status IN ('recibida', 'pagada');
  ELSIF TG_OP = 'UPDATE' THEN
    -- recalc si status cambió a recibida/pagada, o si sigue en esos estados y cambió fecha/proveedor
    v_should := (NEW.status IN ('recibida', 'pagada'))
                AND (OLD.status IS DISTINCT FROM NEW.status
                     OR OLD.fecha IS DISTINCT FROM NEW.fecha
                     OR OLD.proveedor_id IS DISTINCT FROM NEW.proveedor_id
                     OR OLD.condicion_pago IS DISTINCT FROM NEW.condicion_pago);
  END IF;

  IF v_should THEN
    FOR r IN SELECT DISTINCT producto_id FROM compra_lineas WHERE compra_id = NEW.id
    LOOP
      PERFORM recalc_producto_costo(r.producto_id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_compra_recalc_costos ON public.compras;
CREATE TRIGGER trg_compra_recalc_costos
AFTER INSERT OR UPDATE ON public.compras
FOR EACH ROW EXECUTE FUNCTION public.trg_compra_recalc_costos();

-- 2) Trigger en compra_lineas: cualquier cambio en líneas de una compra recibida/pagada recalcula
CREATE OR REPLACE FUNCTION public.trg_compra_lineas_recalc_costos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_status text;
  v_prod uuid;
BEGIN
  v_prod := COALESCE(NEW.producto_id, OLD.producto_id);
  SELECT status INTO v_status FROM compras WHERE id = COALESCE(NEW.compra_id, OLD.compra_id);
  IF v_status IN ('recibida','pagada') AND v_prod IS NOT NULL THEN
    PERFORM recalc_producto_costo(v_prod);
    -- si cambió el producto de la línea, recalcula también el anterior
    IF TG_OP = 'UPDATE' AND NEW.producto_id IS DISTINCT FROM OLD.producto_id AND OLD.producto_id IS NOT NULL THEN
      PERFORM recalc_producto_costo(OLD.producto_id);
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_compra_lineas_recalc_costos ON public.compra_lineas;
CREATE TRIGGER trg_compra_lineas_recalc_costos
AFTER INSERT OR UPDATE OR DELETE ON public.compra_lineas
FOR EACH ROW EXECUTE FUNCTION public.trg_compra_lineas_recalc_costos();

-- 3) Trigger en productos: al cambiar calculo_costo (o al crear producto con método no manual) recalcula
CREATE OR REPLACE FUNCTION public.trg_producto_recalc_on_calculo_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.calculo_costo IS DISTINCT FROM OLD.calculo_costo THEN
    PERFORM recalc_producto_costo(NEW.id);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_producto_recalc_on_calculo_change ON public.productos;
CREATE TRIGGER trg_producto_recalc_on_calculo_change
AFTER UPDATE OF calculo_costo ON public.productos
FOR EACH ROW EXECUTE FUNCTION public.trg_producto_recalc_on_calculo_change();

-- 4) Trigger en producto_proveedores: cambio de proveedor principal recalcula si método es ultimo_proveedor
CREATE OR REPLACE FUNCTION public.trg_pp_recalc_costos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prod uuid;
  v_metodo calculo_costo;
BEGIN
  v_prod := COALESCE(NEW.producto_id, OLD.producto_id);
  SELECT calculo_costo INTO v_metodo FROM productos WHERE id = v_prod;
  IF v_metodo = 'ultimo_proveedor' THEN
    PERFORM recalc_producto_costo(v_prod);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_pp_recalc_costos ON public.producto_proveedores;
CREATE TRIGGER trg_pp_recalc_costos
AFTER INSERT OR UPDATE OR DELETE ON public.producto_proveedores
FOR EACH ROW EXECUTE FUNCTION public.trg_pp_recalc_costos();

-- 5) Backfill: recalcular TODOS los productos con método automático para dejar la base coherente
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM productos WHERE calculo_costo IN ('promedio','ultimo','ultimo_compra','ultimo_proveedor')
  LOOP
    PERFORM recalc_producto_costo(r.id);
  END LOOP;
END $$;
