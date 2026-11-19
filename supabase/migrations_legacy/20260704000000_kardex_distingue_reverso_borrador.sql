-- ============================================================================
-- Punto 2: el kardex distingue "Vuelta a borrador" de "Cancelación".
-- ----------------------------------------------------------------------------
-- El trigger restore_cancelled_sale_inventory se dispara tanto al CANCELAR
-- como al REGRESAR A BORRADOR una venta directa, y en ambos casos etiquetaba
-- el movimiento de devolución como referencia_tipo='cancelacion_venta'
-- ('Cancelación venta'). Eso hacía que una simple edición (vuelta a borrador)
-- se viera en el kardex como una cancelación → confusión.
--
-- Esta migración SOLO cambia la ETIQUETA del movimiento según el estado:
--   • status = 'cancelado' → 'cancelacion_venta'  / "Cancelación venta …"
--   • status = 'borrador'  → 'reverso_borrador'    / "Reverso por vuelta a borrador …"
--
-- NO cambia la matemática del inventario: se devuelve exactamente lo mismo.
-- El cálculo de "neto pendiente" ahora cuenta AMBAS etiquetas para seguir
-- siendo idempotente (movimientos viejos siguen como 'cancelacion_venta').
-- ============================================================================

CREATE OR REPLACE FUNCTION public.restore_cancelled_sale_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_stock_id uuid;
  v_stock_actual numeric;
  v_was_delivered boolean;
  v_neto_pendiente numeric;
  v_a_devolver numeric;
  v_ref_tipo text;
  v_nota text;
BEGIN
  IF NEW.tipo = 'saldo_inicial' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('cancelado', 'borrador') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.tipo <> 'venta_directa' THEN RETURN NEW; END IF;

  v_was_delivered := (COALESCE(OLD.entrega_inmediata, false) = true) OR (OLD.status = 'entregado');
  IF NOT v_was_delivered THEN RETURN NEW; END IF;
  IF NEW.almacen_id IS NULL THEN RETURN NEW; END IF;

  -- Etiqueta según el motivo real del reverso.
  IF NEW.status = 'cancelado' THEN
    v_ref_tipo := 'cancelacion_venta';
    v_nota := 'Cancelación venta ' || COALESCE(NEW.folio, NEW.id::text);
  ELSE
    v_ref_tipo := 'reverso_borrador';
    v_nota := 'Reverso por vuelta a borrador ' || COALESCE(NEW.folio, NEW.id::text);
  END IF;

  FOR v_linea IN
    SELECT producto_id, SUM(cantidad) AS cantidad
    FROM public.venta_lineas WHERE venta_id = NEW.id
    GROUP BY producto_id
  LOOP
    -- Neto pendiente = salidas previas (venta) - entradas previas de reverso
    -- (cuenta AMBAS etiquetas: histórica 'cancelacion_venta' y nueva 'reverso_borrador').
    SELECT COALESCE(SUM(CASE
              WHEN tipo = 'salida' AND referencia_tipo = 'venta' THEN cantidad
              WHEN tipo = 'entrada' AND referencia_tipo IN ('cancelacion_venta','reverso_borrador') THEN -cantidad
              ELSE 0
           END), 0)
    INTO v_neto_pendiente
    FROM public.movimientos_inventario
    WHERE referencia_id = NEW.id AND producto_id = v_linea.producto_id;

    v_a_devolver := LEAST(GREATEST(v_neto_pendiente, 0), COALESCE(v_linea.cantidad, 0));
    IF v_a_devolver <= 0 THEN CONTINUE; END IF;

    SELECT id, cantidad INTO v_stock_id, v_stock_actual
      FROM public.stock_almacen
      WHERE almacen_id = NEW.almacen_id AND producto_id = v_linea.producto_id
      FOR UPDATE LIMIT 1;

    IF v_stock_id IS NOT NULL THEN
      UPDATE public.stock_almacen
        SET cantidad = COALESCE(v_stock_actual, 0) + v_a_devolver, updated_at = now()
        WHERE id = v_stock_id;
    ELSE
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (NEW.empresa_id, NEW.almacen_id, v_linea.producto_id, v_a_devolver);
    END IF;

    INSERT INTO public.movimientos_inventario
      (id, empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas)
    VALUES
      (gen_random_uuid(), NEW.empresa_id, 'entrada', v_linea.producto_id, v_a_devolver,
       NEW.almacen_id, v_ref_tipo, NEW.id, COALESCE(NEW.vendedor_id, NEW.cliente_id),
       COALESCE(NEW.fecha, current_date), now(), v_nota);
  END LOOP;

  RETURN NEW;
END;
$function$;
