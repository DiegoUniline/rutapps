-- Devoluciones atascadas (parte 2 de 2): normalizar cualquier valor legacy.
--
-- Una vez que las variantes de guion son valores aceptados del enum (migración
-- anterior), aquí convertimos CUALQUIER valor que no sea válido a uno real, para
-- que nunca quede basura almacenada:
--   - con cliente  -> 'tienda'  (devolución asociada a un cliente)
--   - sin cliente  -> 'almacen' (devolución a almacén)
--
-- Se usa `tipo::text NOT IN ('almacen','tienda')` (no literales de enum) para:
--   1) cubrir cualquier variante de guion u otro valor basura de una sola vez, y
--   2) ser válida sin importar cómo se agrupen las transacciones al aplicarse
--      (castear a text no requiere que el valor sea un enum usable en esta tx).

-- 1) Limpia cualquier fila que ya exista en el servidor con un valor inválido.
UPDATE public.devoluciones
SET tipo = CASE
             WHEN cliente_id IS NOT NULL THEN 'tienda'::public.tipo_devolucion
             ELSE 'almacen'::public.tipo_devolucion
           END
WHERE tipo::text NOT IN ('almacen', 'tienda');

-- 2) Trigger que normaliza al vuelo lo que llegue DESPUÉS — los registros que
--    todavía están en el teléfono de los vendedores y subirán al reconectar.
--    Así el valor basura entra (no rebota) pero jamás se guarda como tal.
CREATE OR REPLACE FUNCTION public.normalize_devolucion_tipo()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.tipo::text NOT IN ('almacen', 'tienda') THEN
    NEW.tipo := CASE
                  WHEN NEW.cliente_id IS NOT NULL THEN 'tienda'::public.tipo_devolucion
                  ELSE 'almacen'::public.tipo_devolucion
                END;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalize_devolucion_tipo ON public.devoluciones;
CREATE TRIGGER trg_normalize_devolucion_tipo
  BEFORE INSERT OR UPDATE ON public.devoluciones
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_devolucion_tipo();
