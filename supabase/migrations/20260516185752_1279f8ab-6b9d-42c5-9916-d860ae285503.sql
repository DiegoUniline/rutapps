
CREATE OR REPLACE FUNCTION public.apply_carga_kardex(_carga_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
BEGIN
  SELECT id, empresa_id, almacen_id, almacen_destino_id, vendedor_id, fecha
    INTO c
  FROM public.cargas
  WHERE id = _carga_id;

  IF c.id IS NULL THEN RETURN; END IF;
  IF c.almacen_id IS NULL OR c.almacen_destino_id IS NULL THEN RETURN; END IF;

  -- Skip if already recorded
  IF EXISTS (
    SELECT 1 FROM public.movimientos_inventario
    WHERE referencia_tipo = 'carga' AND referencia_id = c.id
  ) THEN
    RETURN;
  END IF;

  -- Salida del almacén origen
  INSERT INTO public.movimientos_inventario
    (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, vendedor_destino_id,
     referencia_tipo, referencia_id, notas, fecha)
  SELECT
    c.empresa_id, 'salida'::tipo_movimiento, cl.producto_id, cl.cantidad_cargada,
    c.almacen_id, c.vendedor_id,
    'carga', c.id,
    'Carga a ruta (asignación de stock)',
    c.fecha
  FROM public.carga_lineas cl
  WHERE cl.carga_id = c.id AND cl.cantidad_cargada > 0;

  -- Entrada al almacén destino (ruta)
  INSERT INTO public.movimientos_inventario
    (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, vendedor_destino_id,
     referencia_tipo, referencia_id, notas, fecha)
  SELECT
    c.empresa_id, 'entrada'::tipo_movimiento, cl.producto_id, cl.cantidad_cargada,
    c.almacen_destino_id, c.vendedor_id,
    'carga', c.id,
    'Carga a ruta (recepción en almacén de ruta)',
    c.fecha
  FROM public.carga_lineas cl
  WHERE cl.carga_id = c.id AND cl.cantidad_cargada > 0;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_apply_carga_kardex()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('en_ruta','completada')
      AND (OLD.status IS DISTINCT FROM NEW.status))
     OR (TG_OP = 'INSERT' AND NEW.status IN ('en_ruta','completada')) THEN
    PERFORM public.apply_carga_kardex(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cargas_kardex ON public.cargas;
CREATE TRIGGER trg_cargas_kardex
AFTER INSERT OR UPDATE OF status ON public.cargas
FOR EACH ROW
EXECUTE FUNCTION public.trg_apply_carga_kardex();

-- Backfill cargas históricas
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT id FROM public.cargas
    WHERE status IN ('en_ruta','completada')
      AND almacen_id IS NOT NULL
      AND almacen_destino_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario m
        WHERE m.referencia_tipo='carga' AND m.referencia_id = cargas.id
      )
  LOOP
    PERFORM public.apply_carga_kardex(r.id);
  END LOOP;
END $$;
