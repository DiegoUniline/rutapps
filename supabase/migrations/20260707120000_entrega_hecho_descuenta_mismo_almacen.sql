-- BUG CRÍTICO de inventario: al marcar 'hecho' una entrega, el stock NO baja
-- cuando el vendedor entrega desde la MISMA bodega de origen (no tiene un almacén
-- de camión separado). En el kardex se ve un 'entrega_hecho' con cantidad 0 y
-- nota "Anclaje (descuento previo)", y el saldo no se mueve → inventario inflado.
--
-- Causa raíz (matiz que faltaba en el fix de doble-descuento 20260702160000):
--   El flujo por línea es  Surtido(−X) → Carga(+X) → Hecho(−X).
--   El "descontado previo" (v_neto) que usa 'hecho' para ser idempotente contaba
--   las salidas de referencia_tipo IN ('entrega','entrega_cargado','entrega_hecho').
--   Cuando origen = destino (mismo almacén), la salida del SURTIDO ('entrega')
--   sale del mismo almacén donde 'hecho' quiere descontar, así que v_neto la
--   contaba como "ya descontado" y 'hecho' anclaba (0). PERO la Carga(+X) ya había
--   revertido ese surtido, así que en realidad NADA había salido en neto → stock
--   inflado.
--
-- Arreglo: v_neto debe contar SOLO las deducciones previas del propio 'hecho'
-- (referencia_tipo = 'entrega_hecho'). Eso es lo único que garantiza idempotencia
-- real (no descontar dos veces si 'hecho' se dispara de nuevo), sin confundir el
-- surtido —que la carga ya compensó— con una deducción de entrega.
--
-- Resultado por caso (todos correctos):
--   • Sin camión (origen=destino): Surtido−X, Carga+X, Hecho−X = −X  ✅
--   • Con camión (origen≠destino): Surtido−X bodega, Carga+X camión, Hecho−X
--     camión = bodega −X, camión 0  ✅
--   • Cancelar/no entregado: Surtido−X, Carga+X, se queda = neto 0  ✅ (no cambia)
--   • Re-disparo de 'hecho': ya existe salida 'entrega_hecho' → ancla, no duplica ✅
--
-- Único cambio vs. la versión viva (20260702160000): el filtro referencia_tipo de
-- v_neto. Todo lo demás queda idéntico.

CREATE OR REPLACE FUNCTION public.apply_entrega_hecho_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_vendedor_id uuid;
  v_almacen_id uuid;
  v_linea record;
  v_neto numeric;
  v_pendiente numeric;
BEGIN
  -- Reversión: si pasamos de 'hecho' a otro estado
  IF TG_OP = 'UPDATE' AND OLD.status = 'hecho' AND NEW.status IS DISTINCT FROM 'hecho' THEN
    FOR v_linea IN
      SELECT producto_id, cantidad, almacen_origen_id
      FROM public.movimientos_inventario
      WHERE referencia_id = NEW.id
        AND referencia_tipo IN ('entrega_hecho', 'entrega')
        AND tipo = 'salida'
    LOOP
      IF v_linea.almacen_origen_id IS NOT NULL AND v_linea.cantidad > 0 THEN
        UPDATE public.stock_almacen
        SET cantidad = cantidad + v_linea.cantidad, updated_at = now()
        WHERE almacen_id = v_linea.almacen_origen_id AND producto_id = v_linea.producto_id;
      END IF;
    END LOOP;
    DELETE FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo IN ('entrega_hecho', 'entrega')
      AND tipo = 'salida';
    RETURN NEW;
  END IF;

  -- Solo aplicar si pasa a 'hecho'
  IF NEW.status IS DISTINCT FROM 'hecho' THEN RETURN NEW; END IF;

  v_vendedor_id := COALESCE(NEW.vendedor_ruta_id, NEW.vendedor_id);
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_vendedor_id;
  IF v_almacen_id IS NULL THEN v_almacen_id := NEW.almacen_id; END IF;
  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_entrega_hecho_inventory: no almacen for entrega %', NEW.id;
    RETURN NEW;
  END IF;

  FOR v_linea IN
    SELECT id, producto_id, cantidad_entregada, unidad_id
    FROM public.entrega_lineas
    WHERE entrega_id = NEW.id AND hecho = true AND COALESCE(cantidad_entregada, 0) > 0
  LOOP
    -- FIX: v_neto = SOLO deducciones previas de 'hecho' (idempotencia real).
    -- Antes contaba también 'entrega' (surtido); cuando origen=destino eso hacía
    -- que el surtido —ya compensado por la Carga— se viera como "ya descontado"
    -- y 'hecho' anclaba en 0 → stock inflado.
    SELECT COALESCE(SUM(CASE WHEN tipo = 'salida' AND almacen_origen_id = v_almacen_id THEN cantidad ELSE 0 END), 0)
    INTO v_neto
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id
      AND referencia_tipo = 'entrega_hecho'
      AND producto_id = v_linea.producto_id;

    v_pendiente := v_linea.cantidad_entregada - v_neto;

    IF v_pendiente > 0 THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad, updated_at)
      VALUES (NEW.empresa_id, v_almacen_id, v_linea.producto_id, -v_pendiente, now())
      ON CONFLICT (almacen_id, producto_id)
        DO UPDATE SET cantidad = public.stock_almacen.cantidad - v_pendiente, updated_at = now();

      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
        vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
      ) VALUES (
        NEW.empresa_id, 'salida', v_linea.producto_id, v_pendiente, v_linea.unidad_id, v_almacen_id,
        v_vendedor_id, 'entrega_hecho', NEW.id,
        'Entrega a cliente (folio ' || COALESCE(NEW.folio, '—') || ')', CURRENT_DATE
      );
    ELSE
      -- Ya descontado por 'hecho' antes: anclaje de control (idempotencia)
      INSERT INTO public.movimientos_inventario (
        empresa_id, tipo, producto_id, cantidad, unidad_id, almacen_origen_id,
        vendedor_destino_id, referencia_tipo, referencia_id, notas, fecha
      )
      SELECT NEW.empresa_id, 'salida', v_linea.producto_id, 0, v_linea.unidad_id, v_almacen_id,
        v_vendedor_id, 'entrega_hecho', NEW.id, 'Anclaje (descuento previo)', CURRENT_DATE
      WHERE NOT EXISTS (
        SELECT 1 FROM public.movimientos_inventario
        WHERE referencia_id = NEW.id AND referencia_tipo = 'entrega_hecho' AND producto_id = v_linea.producto_id
      );
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
