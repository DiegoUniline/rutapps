-- SINCRONIZAR productos.usa_presentaciones con sus presentaciones activas.
--
-- Problema: la bandera productos.usa_presentaciones (toggle "Vender por
-- presentaciones") se desincroniza de producto_presentaciones. Si un producto
-- tiene filas activas pero el flag quedó en false (seed/import/edición parcial),
-- unas pantallas lo muestran (móvil/tienda miran las filas) y otras no (el POS
-- miraba el flag) → el producto "desaparece" de forma inconsistente.
--
-- Solución: un trigger mantiene el flag SIEMPRE igual a "¿tiene al menos una
-- presentación activa?". Así, al agregar la primera presentación activa el
-- producto se vuelve vendible por presentaciones en todos lados, y al quitar/
-- desactivar la última, se apaga. Imposible desincronizar, venga de donde venga
-- la escritura (formulario, seed, import).
--
-- Solo actualiza un boolean; no toca stock ni movimientos.

CREATE OR REPLACE FUNCTION public.sync_usa_presentaciones()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_producto uuid;
  v_tiene boolean;
BEGIN
  v_producto := COALESCE(NEW.producto_id, OLD.producto_id);
  v_tiene := EXISTS (
    SELECT 1 FROM public.producto_presentaciones pp
    WHERE pp.producto_id = v_producto AND pp.activo = true
  );
  UPDATE public.productos p
  SET usa_presentaciones = v_tiene
  WHERE p.id = v_producto
    AND p.usa_presentaciones IS DISTINCT FROM v_tiene;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_usa_presentaciones ON public.producto_presentaciones;
CREATE TRIGGER trg_sync_usa_presentaciones
AFTER INSERT OR UPDATE OR DELETE ON public.producto_presentaciones
FOR EACH ROW EXECUTE FUNCTION public.sync_usa_presentaciones();

-- Backfill: cuadrar el flag de todos los productos con su realidad actual.
UPDATE public.productos p
SET usa_presentaciones = EXISTS (
  SELECT 1 FROM public.producto_presentaciones pp
  WHERE pp.producto_id = p.id AND pp.activo = true
)
WHERE p.usa_presentaciones IS DISTINCT FROM EXISTS (
  SELECT 1 FROM public.producto_presentaciones pp
  WHERE pp.producto_id = p.id AND pp.activo = true
);
