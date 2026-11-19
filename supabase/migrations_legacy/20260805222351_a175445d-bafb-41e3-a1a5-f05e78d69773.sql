-- ============================================================
-- Sincronización delta e idempotente del inventario de ventas
-- ============================================================
CREATE OR REPLACE FUNCTION public.fn_sync_venta_inventario(p_venta_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta       public.ventas%ROWTYPE;
  v_almacen     uuid;
  v_aplica      boolean;
  v_ref_entrada text;
  p             RECORD;
  l             RECORD;
  v_lote        RECORD;
  v_diff        numeric;
  v_pend        numeric;
  v_take        numeric;
  v_maneja      boolean;
  v_sin_stock   boolean;
  v_stock_id    uuid;
  v_stock_act   numeric;
  v_new_qty     numeric;
  v_user        uuid;
  v_nombre      text;
  v_log         jsonb := '[]'::jsonb;
BEGIN
  IF p_venta_id IS NULL THEN RETURN; END IF;

  -- Serializa por venta: dos peticiones simultáneas no pueden duplicar movimientos.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_venta_id::text, 0));

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_venta.tipo::text = 'saldo_inicial' OR COALESCE(v_venta.es_saldo_inicial, false) THEN RETURN; END IF;

  -- Los pedidos surtidos por el flujo de entregas los controla ese flujo.
  IF v_venta.tipo::text = 'pedido'
     AND EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = p_venta_id) THEN
    RETURN;
  END IF;

  v_almacen := COALESCE(
    v_venta.almacen_id,
    (SELECT almacen_id FROM public.profiles WHERE id = v_venta.vendedor_id LIMIT 1)
  );

  v_aplica := CASE
    WHEN v_venta.status::text IN ('cancelado', 'borrador') THEN false
    WHEN v_venta.tipo::text = 'venta_directa'
      THEN COALESCE(v_venta.entrega_inmediata, false) OR v_venta.status::text IN ('entregado', 'facturado')
    WHEN v_venta.tipo::text = 'pedido'
      THEN v_venta.status::text IN ('entregado', 'facturado')
    ELSE false
  END;

  IF v_almacen IS NULL THEN
    IF v_aplica THEN
      RAISE EXCEPTION 'No se puede aplicar inventario de la venta % sin almacén asignado.',
        COALESCE(v_venta.folio, v_venta.id::text);
    END IF;
    RETURN;
  END IF;

  v_ref_entrada := CASE WHEN v_venta.status::text = 'cancelado'
                        THEN 'cancelacion_venta' ELSE 'reverso_borrador' END;

  v_user := COALESCE(auth.uid(), v_venta.vendedor_id, v_venta.creado_por);
  SELECT nombre INTO v_nombre FROM public.profiles WHERE id = v_user;

  FOR p IN
    WITH deseado AS (
      SELECT vl.producto_id, d.lote_id, SUM(COALESCE(d.cantidad, 0)) AS cant
        FROM public.venta_lineas vl
        JOIN public.venta_linea_lotes d ON d.venta_linea_id = vl.id
       WHERE vl.venta_id = p_venta_id AND v_aplica
       GROUP BY 1, 2
      UNION ALL
      SELECT vl.producto_id, vl.lote_id, SUM(COALESCE(vl.cantidad, 0)) AS cant
        FROM public.venta_lineas vl
       WHERE vl.venta_id = p_venta_id AND v_aplica
         AND NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d WHERE d.venta_linea_id = vl.id)
       GROUP BY 1, 2
    ),
    aplicado AS (
      SELECT mi.producto_id, mi.lote_id,
             SUM(CASE WHEN mi.tipo::text = 'salida' THEN COALESCE(mi.cantidad, 0)
                      ELSE -COALESCE(mi.cantidad, 0) END) AS cant
        FROM public.movimientos_inventario mi
       WHERE mi.referencia_id = p_venta_id
         AND mi.referencia_tipo IN ('venta', 'venta_lote', 'cancelacion_venta',
                                    'reverso_borrador', 'cancelacion_venta_lote',
                                    'reverso_borrador_lote')
       GROUP BY 1, 2
    ),
    llaves AS (
      SELECT producto_id, lote_id, SUM(cant) AS deseado, 0::numeric AS aplicado FROM deseado GROUP BY 1,2
      UNION ALL
      SELECT producto_id, lote_id, 0::numeric, SUM(cant) FROM aplicado GROUP BY 1,2
    )
    SELECT producto_id,
           SUM(deseado)  AS deseado_total,
           SUM(aplicado) AS aplicado_total
      FROM llaves
     GROUP BY producto_id
  LOOP
    v_diff := ROUND(COALESCE(p.deseado_total, 0) - COALESCE(p.aplicado_total, 0), 6);
    IF ABS(v_diff) < 0.000001 THEN CONTINUE; END IF;

    SELECT COALESCE(maneja_lote, false), COALESCE(vender_sin_stock, false)
      INTO v_maneja, v_sin_stock
      FROM public.productos WHERE id = p.producto_id;

    IF v_diff > 0 THEN
      -- ── Faltante: descontar la diferencia ───────────────────────────────
      v_pend := v_diff;

      FOR l IN
        WITH deseado AS (
          SELECT vl.producto_id, d.lote_id, SUM(COALESCE(d.cantidad,0)) AS cant
            FROM public.venta_lineas vl JOIN public.venta_linea_lotes d ON d.venta_linea_id = vl.id
           WHERE vl.venta_id = p_venta_id AND vl.producto_id = p.producto_id AND d.lote_id IS NOT NULL
           GROUP BY 1,2
          UNION ALL
          SELECT vl.producto_id, vl.lote_id, SUM(COALESCE(vl.cantidad,0))
            FROM public.venta_lineas vl
           WHERE vl.venta_id = p_venta_id AND vl.producto_id = p.producto_id AND vl.lote_id IS NOT NULL
             AND NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d WHERE d.venta_linea_id = vl.id)
           GROUP BY 1,2
        ),
        aplicado AS (
          SELECT mi.lote_id,
                 SUM(CASE WHEN mi.tipo::text='salida' THEN COALESCE(mi.cantidad,0) ELSE -COALESCE(mi.cantidad,0) END) AS cant
            FROM public.movimientos_inventario mi
           WHERE mi.referencia_id = p_venta_id AND mi.producto_id = p.producto_id AND mi.lote_id IS NOT NULL
             AND mi.referencia_tipo IN ('venta','venta_lote','cancelacion_venta','reverso_borrador',
                                        'cancelacion_venta_lote','reverso_borrador_lote')
           GROUP BY 1
        )
        SELECT d.lote_id,
               ROUND(SUM(d.cant) - COALESCE((SELECT a.cant FROM aplicado a WHERE a.lote_id = d.lote_id), 0), 6) AS falta
          FROM deseado d
         WHERE v_aplica
         GROUP BY d.lote_id
        HAVING ROUND(SUM(d.cant) - COALESCE((SELECT a.cant FROM aplicado a WHERE a.lote_id = d.lote_id), 0), 6) > 0
         ORDER BY 2 DESC
      LOOP
        EXIT WHEN v_pend <= 0;
        v_take := LEAST(l.falta, v_pend);
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id,
           referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_venta.empresa_id, 'salida', p.producto_id, v_take, v_almacen, l.lote_id,
                'venta', p_venta_id, v_user, COALESCE(v_venta.fecha, CURRENT_DATE),
                'Venta ' || COALESCE(v_venta.folio, '') || ' · ajuste inventario');
        v_pend := v_pend - v_take;
      END LOOP;

      IF v_pend > 0 AND v_maneja THEN
        FOR v_lote IN
          SELECT sl.lote_id, sl.cantidad AS existencia
            FROM public.stock_lotes sl JOIN public.lotes lo ON lo.id = sl.lote_id
           WHERE sl.almacen_id = v_almacen AND sl.producto_id = p.producto_id AND sl.cantidad > 0
           ORDER BY lo.fecha_caducidad ASC NULLS LAST, lo.created_at ASC
           FOR UPDATE OF sl
        LOOP
          EXIT WHEN v_pend <= 0;
          v_take := LEAST(v_lote.existencia, v_pend);
          INSERT INTO public.movimientos_inventario
            (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id,
             referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_venta.empresa_id, 'salida', p.producto_id, v_take, v_almacen, v_lote.lote_id,
                  'venta', p_venta_id, v_user, COALESCE(v_venta.fecha, CURRENT_DATE),
                  'Venta ' || COALESCE(v_venta.folio, '') || ' · lote FEFO');
          v_pend := v_pend - v_take;
        END LOOP;
      END IF;

      IF v_pend > 0 THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id,
           referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_venta.empresa_id, 'salida', p.producto_id, v_pend, v_almacen,
                'venta', p_venta_id, v_user, COALESCE(v_venta.fecha, CURRENT_DATE),
                'Venta ' || COALESCE(v_venta.folio, '') || ' · ajuste inventario');
      END IF;

      SELECT id, cantidad INTO v_stock_id, v_stock_act
        FROM public.stock_almacen
       WHERE almacen_id = v_almacen AND producto_id = p.producto_id FOR UPDATE;
      v_new_qty := COALESCE(v_stock_act, 0) - v_diff;
      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (v_venta.empresa_id, v_almacen, p.producto_id, v_new_qty);
      END IF;

    ELSE
      -- ── Sobrante: devolver la diferencia ────────────────────────────────
      v_pend := -v_diff;

      FOR l IN
        WITH deseado AS (
          SELECT d.lote_id, SUM(COALESCE(d.cantidad,0)) AS cant
            FROM public.venta_lineas vl JOIN public.venta_linea_lotes d ON d.venta_linea_id = vl.id
           WHERE vl.venta_id = p_venta_id AND vl.producto_id = p.producto_id AND d.lote_id IS NOT NULL AND v_aplica
           GROUP BY 1
          UNION ALL
          SELECT vl.lote_id, SUM(COALESCE(vl.cantidad,0))
            FROM public.venta_lineas vl
           WHERE vl.venta_id = p_venta_id AND vl.producto_id = p.producto_id AND vl.lote_id IS NOT NULL AND v_aplica
             AND NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d WHERE d.venta_linea_id = vl.id)
           GROUP BY 1
        ),
        aplicado AS (
          SELECT mi.lote_id,
                 SUM(CASE WHEN mi.tipo::text='salida' THEN COALESCE(mi.cantidad,0) ELSE -COALESCE(mi.cantidad,0) END) AS cant
            FROM public.movimientos_inventario mi
           WHERE mi.referencia_id = p_venta_id AND mi.producto_id = p.producto_id AND mi.lote_id IS NOT NULL
             AND mi.referencia_tipo IN ('venta','venta_lote','cancelacion_venta','reverso_borrador',
                                        'cancelacion_venta_lote','reverso_borrador_lote')
           GROUP BY 1
        )
        SELECT a.lote_id,
               ROUND(a.cant - COALESCE((SELECT SUM(d.cant) FROM deseado d WHERE d.lote_id = a.lote_id), 0), 6) AS sobra
          FROM aplicado a
         WHERE ROUND(a.cant - COALESCE((SELECT SUM(d.cant) FROM deseado d WHERE d.lote_id = a.lote_id), 0), 6) > 0
         ORDER BY 2 DESC
      LOOP
        EXIT WHEN v_pend <= 0;
        v_take := LEAST(l.sobra, v_pend);
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id,
           referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_venta.empresa_id, 'entrada', p.producto_id, v_take, v_almacen, l.lote_id,
                v_ref_entrada, p_venta_id, v_user, COALESCE(v_venta.fecha, CURRENT_DATE),
                'Reverso venta ' || COALESCE(v_venta.folio, '') || ' · lote');
        v_pend := v_pend - v_take;
      END LOOP;

      IF v_pend > 0 THEN
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
           referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_venta.empresa_id, 'entrada', p.producto_id, v_pend, v_almacen,
                v_ref_entrada, p_venta_id, v_user, COALESCE(v_venta.fecha, CURRENT_DATE),
                'Reverso venta ' || COALESCE(v_venta.folio, ''));
      END IF;

      SELECT id, cantidad INTO v_stock_id, v_stock_act
        FROM public.stock_almacen
       WHERE almacen_id = v_almacen AND producto_id = p.producto_id FOR UPDATE;
      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen
           SET cantidad = COALESCE(v_stock_act, 0) + (-v_diff), updated_at = now()
         WHERE id = v_stock_id;
      ELSE
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (v_venta.empresa_id, v_almacen, p.producto_id, -v_diff);
      END IF;
    END IF;

    v_log := v_log || jsonb_build_object(
      'producto_id', p.producto_id,
      'almacen_id', v_almacen,
      'deseado', p.deseado_total,
      'aplicado_previo', p.aplicado_total,
      'ajuste', v_diff
    );
  END LOOP;

  IF jsonb_array_length(v_log) > 0 THEN
    INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles)
    VALUES (p_venta_id, v_venta.empresa_id, v_user, COALESCE(v_nombre, 'sistema'),
            'inventario_ajustado',
            jsonb_build_object('status', v_venta.status, 'aplica', v_aplica, 'ajustes', v_log));
  END IF;
END;
$$;

-- ── Triggers puente ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.trg_venta_sync_inventario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  IF TG_TABLE_NAME = 'ventas' THEN
    v_id := COALESCE(NEW.id, OLD.id);
  ELSE
    v_id := COALESCE(NEW.venta_id, OLD.venta_id);
  END IF;
  PERFORM public.fn_sync_venta_inventario(v_id);
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'venta_lineas'
     AND NEW.venta_id IS DISTINCT FROM OLD.venta_id THEN
    PERFORM public.fn_sync_venta_inventario(OLD.venta_id);
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Reemplaza el esquema anterior (aplicación solo en INSERT y reversas parciales)
DROP TRIGGER IF EXISTS trg_apply_immediate_sale_inventory ON public.venta_lineas;
DROP TRIGGER IF EXISTS trg_aplicar_lote_venta_inmediata ON public.venta_lineas;
DROP TRIGGER IF EXISTS trg_apply_delivered_direct_sale_inventory ON public.ventas;
DROP TRIGGER IF EXISTS trg_apply_pedido_entregado_inventory ON public.ventas;
DROP TRIGGER IF EXISTS trg_restore_cancelled_sale_inventory ON public.ventas;
DROP TRIGGER IF EXISTS trg_revertir_lote_venta_cancel ON public.ventas;

DROP TRIGGER IF EXISTS trg_ventas_sync_inventario ON public.ventas;
CREATE CONSTRAINT TRIGGER trg_ventas_sync_inventario
  AFTER UPDATE OF status, almacen_id, entrega_inmediata ON public.ventas
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_venta_sync_inventario();

DROP TRIGGER IF EXISTS trg_venta_lineas_sync_inventario ON public.venta_lineas;
CREATE CONSTRAINT TRIGGER trg_venta_lineas_sync_inventario
  AFTER INSERT OR DELETE OR UPDATE OF cantidad, producto_id, lote_id, venta_id ON public.venta_lineas
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_venta_sync_inventario();

DROP TRIGGER IF EXISTS trg_venta_linea_lotes_sync_inventario ON public.venta_linea_lotes;
CREATE CONSTRAINT TRIGGER trg_venta_linea_lotes_sync_inventario
  AFTER INSERT OR DELETE OR UPDATE ON public.venta_linea_lotes
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.trg_venta_sync_inventario();

GRANT EXECUTE ON FUNCTION public.fn_sync_venta_inventario(uuid) TO authenticated, service_role;