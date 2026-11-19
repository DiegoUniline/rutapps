-- ============================================================================
-- FIX: sobrecobro de promociones "producto gratis" en ventas de ruta (offline).
--
-- CAUSA
--   El trigger `trg_venta_lineas_recalc_header` (sobre venta_lineas, agregado el
--   29/07) recalcula el encabezado:
--       ventas.total = SUM(venta_lineas.total) - descuento_extra - v_promo
--   donde, con el flag `promo_descuento_linea` OFF, v_promo = SUM(promocion_aplicada).
--
--   En el sync OFFLINE de ruta, las operaciones se encolan por separado y llegan
--   en orden: venta -> venta_lineas -> promocion_aplicada. El trigger vive en
--   venta_lineas, así que corre ANTES de que exista promocion_aplicada => v_promo = 0
--   => el total queda a PRECIO COMPLETO (no resta el regalo). Cuando promocion_aplicada
--   llega después, no hay quién re-dispare el recálculo, y el total queda sobrecobrado.
--
-- FIX
--   Re-ejecutar `fn_recalc_venta_header` cuando cambian las promociones aplicadas.
--   Así, al insertarse/actualizarse/borrarse promocion_aplicada, el encabezado se
--   recalcula con el v_promo correcto. Idempotente: fn_recalc_venta_header solo
--   escribe si algún total cambió.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.trg_promo_aplicada_recalc_header()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_recalc_venta_header(COALESCE(NEW.venta_id, OLD.venta_id));
  RETURN NULL;
END;
$$;

-- CONSTRAINT TRIGGER diferido al commit: igual que el de venta_lineas, para que
-- el recálculo vea el estado completo (todas las líneas + todas las promos) sin
-- importar el orden de los INSERT dentro de la transacción.
DROP TRIGGER IF EXISTS trg_promo_aplicada_recalc_header ON public.promocion_aplicada;

CREATE CONSTRAINT TRIGGER trg_promo_aplicada_recalc_header
AFTER INSERT OR UPDATE OR DELETE ON public.promocion_aplicada
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.trg_promo_aplicada_recalc_header();
