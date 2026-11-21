-- Post-carga del corte (D-018): lo que las migraciones posteriores a la base del 2026-11-19
-- hicieron sobre datos existentes y que NO quedó aplicado porque corrieron sobre una base vacía.
--
-- Lo ejecuta recargar-datos.sh dentro de la MISMA transacción de la carga, justo después del
-- COPY y con session_replication_role = replica (triggers apagados). Es idempotente.
-- Para correrlo solo (por ejemplo, sobre una copia): psql --single-transaction -f post-carga.sql
--
-- Reglas que respeta:
--   · D-023: el dinero histórico se deja como está (no se recalculan saldos, pagos ni cobros);
--     saldo a favor solo desde su puesta en marcha (cobro_excedentes nace vacío).
--   · D-041: comisiones históricas no se recalculan.
--   · D-049: cancelar una venta ya NO cancela sus devoluciones (el backfill de D-033 queda fuera).
--   · Lo que no está decidido NO se aplica: queda en vista previa (sección B) y en el reporte.
--
-- Revisión de las 42 migraciones posteriores a la base (20261119120000 … 20261121050000):
--   backfill incluido (A) | opcional, pendiente del dueño (B) | sin backfill (columna con default
--   correcto, solo funciones/índices/políticas) | superado por una decisión posterior.
--   Detalle en docs/migracion-corte.md § «Post-carga».
--
-- Salida: filas en la tabla temporal _corte_reporte (seccion, item, valor); recargar-datos.sh
-- las imprime al final. Nada de la sección C modifica datos.

SET search_path TO public, extensions;

CREATE TEMP TABLE IF NOT EXISTS _corte_reporte (
  orden   serial,
  seccion text,
  item    text,
  valor   text
);

-- (SET y no set_config(): en Supabase el rol postgres solo puede cambiarlo con la sentencia SET.)
-- Los UPDATE de la sección A son marcas derivadas: se hacen con triggers apagados (como el COPY)
-- para no disparar inventario/saldos/permisos sobre datos históricos.
SET LOCAL session_replication_role = replica;

-- ════════════════════════════════════════════════════════════════════════════════
-- A. Backfills deterministas (sin decisión de negocio)
-- ════════════════════════════════════════════════════════════════════════════════

-- A1 · 20261120060000_ventas_tiene_promocion: marca de promoción para el filtro de Ventas.
--      En adelante la mantienen los triggers de promocion_aplicada y venta_lineas.
WITH u AS (
  UPDATE public.ventas v SET tiene_promocion = true
   WHERE NOT v.tiene_promocion
     AND (EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_id = v.id)
          OR EXISTS (SELECT 1 FROM public.venta_lineas vl
                      WHERE vl.venta_id = v.id AND COALESCE(vl.precio_unitario, 0) = 0
                        AND COALESCE(vl.cantidad, 0) > 0))
  RETURNING 1)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'A post-carga', 'A1 ventas.tiene_promocion marcadas', count(*)::text FROM u;

-- A2 · 20261121043000_f3_liquidacion_cerrada: liquidaciones cuyo inventario ya se aplicó
--      (tienen movimientos 'descarga'). Sin esta marca, reabrir y re-aprobar volvería a meter
--      todo a la bodega (H7). No toca dinero ni lo congelado (aprobadas antes de F3 siguen en vivo).
WITH u AS (
  UPDATE public.descarga_ruta d
     SET inventario_aplicado_at = COALESCE(d.fecha_aprobacion, d.created_at)
   WHERE d.inventario_aplicado_at IS NULL
     AND EXISTS (SELECT 1 FROM public.movimientos_inventario m
                  WHERE m.referencia_id = d.id AND m.referencia_tipo = 'descarga')
  RETURNING 1)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'A post-carga', 'A2 descarga_ruta.inventario_aplicado_at marcadas', count(*)::text FROM u;

-- A3 · 20261121043000: cantidad ya aplicada a la bodega por renglón de esas liquidaciones.
WITH u AS (
  UPDATE public.descarga_ruta_lineas l
     SET cantidad_aplicada = COALESCE((
           SELECT SUM(m.cantidad) FROM public.movimientos_inventario m
            WHERE m.referencia_id = d.id AND m.referencia_tipo = 'descarga'
              AND m.tipo = 'entrada' AND m.producto_id = l.producto_id
              AND m.almacen_destino_id = d.almacen_destino_id), 0)
    FROM public.descarga_ruta d
   WHERE d.id = l.descarga_id AND d.inventario_aplicado_at IS NOT NULL
     AND l.cantidad_aplicada IS NULL
  RETURNING 1)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'A post-carga', 'A3 descarga_ruta_lineas.cantidad_aplicada llenadas', count(*)::text FROM u;

-- A4 · 20261120000000_f1b_excedentes_caja: excedentes 'previo' desde cobros.saldo_favor_monto /
--      reembolso_monto. Esas columnas nacen en 0 para todo cobro importado (no existían en
--      Lovable), así que debe dar 0 filas: el saldo a favor arranca desde su puesta en marcha (D-023).
WITH i AS (
  INSERT INTO public.cobro_excedentes (empresa_id, cliente_id, cobro_id, tipo, origen, monto, created_at)
  SELECT c.empresa_id, c.cliente_id, c.id, x.tipo, 'previo', round(x.monto, 2), c.created_at
    FROM public.cobros c
    CROSS JOIN LATERAL (VALUES ('saldo_favor', c.saldo_favor_monto), ('reembolso', c.reembolso_monto)) x(tipo, monto)
   WHERE x.monto > 0.009
     AND NOT EXISTS (SELECT 1 FROM public.cobro_excedentes e WHERE e.cobro_id = c.id AND e.tipo = x.tipo)
  RETURNING 1)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'A post-carga', 'A4 cobro_excedentes previos (esperado 0)', count(*)::text FROM i;

-- ════════════════════════════════════════════════════════════════════════════════
-- B. Recalculos que cambian estado/saldo/inventario histórico: NO se aplican sin decisión del
--    dueño. Siempre se calcula una vista previa exacta (se ejecuta y se revierte con un
--    subtransacción); se aplican solo si recargar-datos.sh recibe la bandera correspondiente
--    (GUC corte.recalcular_pedidos / corte.corregir_canceladas_devol = 'si').
--    Corren con triggers encendidos, igual que en su migración original.
-- ════════════════════════════════════════════════════════════════════════════════
SET LOCAL session_replication_role = origin;

-- B1 · 20261120030000_f2b_pedido_por_entregado (D-034): estado y saldo de cada pedido por lo
--      realmente entregado (entregas 'hecho'). Toca ventas.status/saldo_pendiente de pedidos
--      históricos → choca con D-023 si se lee literal. ❓ dueño.
DO $b1$
DECLARE
  v_aplicar boolean := COALESCE(current_setting('corte.recalcular_pedidos', true), '') = 'si';
  r record;
  v_det text;
BEGIN
  BEGIN
    DROP TABLE IF EXISTS _corte_ped_antes;
    CREATE TEMP TABLE _corte_ped_antes AS
      SELECT id, status::text AS status, saldo_pendiente FROM public.ventas WHERE tipo::text = 'pedido';

    FOR r IN SELECT DISTINCT e.pedido_id AS id FROM public.entregas e WHERE e.pedido_id IS NOT NULL LOOP
      PERFORM public.fn_sync_status_pedido(r.id);
    END LOOP;
    FOR r IN SELECT v.id FROM public.ventas v
              WHERE v.tipo::text = 'pedido'
                AND NOT EXISTS (SELECT 1 FROM public.entregas e WHERE e.pedido_id = v.id) LOOP
      PERFORM public.fn_recalc_venta_saldo(r.id);
    END LOOP;

    SELECT format('%s pedidos cambian de estado; %s cambian de saldo (Δ saldo total %s)',
                  count(*) FILTER (WHERE v.status::text <> a.status),
                  count(*) FILTER (WHERE v.saldo_pendiente IS DISTINCT FROM a.saldo_pendiente),
                  COALESCE(round(sum(COALESCE(v.saldo_pendiente, 0) - COALESCE(a.saldo_pendiente, 0)), 2), 0))
      INTO v_det
      FROM public.ventas v JOIN _corte_ped_antes a ON a.id = v.id;
    DROP TABLE _corte_ped_antes;

    IF NOT v_aplicar THEN
      RAISE EXCEPTION 'corte_vista_previa' USING DETAIL = v_det;
    END IF;
    INSERT INTO _corte_reporte (seccion, item, valor)
    VALUES ('B opcional', 'B1 pedidos por lo entregado (D-034): APLICADO', v_det);
  EXCEPTION WHEN OTHERS THEN
    -- La vista previa se revierte siempre; si falla, se reporta sin tumbar la carga.
    -- Si se pidió aplicar y falla, sí se aborta todo.
    IF SQLERRM = 'corte_vista_previa' THEN
      GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
      INSERT INTO _corte_reporte (seccion, item, valor)
      VALUES ('B opcional', 'B1 pedidos por lo entregado (D-034): NO aplicado, vista previa', v_det);
    ELSIF v_aplicar THEN
      RAISE;
    ELSE
      INSERT INTO _corte_reporte (seccion, item, valor)
      VALUES ('B opcional', 'B1 pedidos por lo entregado (D-034): NO aplicado, la vista previa falló', SQLERRM);
    END IF;
  END;
END
$b1$;

-- B2 · 20261119233000_cancelar_venta_con_devoluciones: ventas canceladas/borrador con
--      devoluciones regresaron al stock también lo ya devuelto (doble entrada). La corrección
--      vuelve a sincronizar su inventario (salidas nuevas hoy). Si después hubo conteos o ajustes
--      que ya corrigieron ese stock, descontaría dos veces. ❓ dueño.
DO $b2$
DECLARE
  v_aplicar boolean := COALESCE(current_setting('corte.corregir_canceladas_devol', true), '') = 'si';
  r record;
  v_antes bigint;
  v_ventas int := 0;
  v_det text;
BEGIN
  BEGIN
    SELECT count(*) INTO v_antes FROM public.movimientos_inventario;
    FOR r IN
      SELECT DISTINCT v.id FROM public.ventas v
        JOIN public.devoluciones d ON d.venta_id = v.id
       WHERE v.status::text IN ('cancelado', 'borrador')
    LOOP
      PERFORM public.fn_sync_venta_inventario(r.id);
      v_ventas := v_ventas + 1;
    END LOOP;
    SELECT format('%s ventas revisadas; %s movimientos de inventario nuevos; piezas netas %s',
                  v_ventas, count(*) - v_antes,
                  COALESCE((SELECT round(sum(CASE WHEN m.tipo::text = 'entrada' THEN m.cantidad ELSE -m.cantidad END), 3)
                              FROM public.movimientos_inventario m
                             WHERE m.created_at >= now() AND m.referencia_tipo IN ('venta', 'venta_lote')), 0))
      INTO v_det FROM public.movimientos_inventario;

    IF NOT v_aplicar THEN
      RAISE EXCEPTION 'corte_vista_previa' USING DETAIL = v_det;
    END IF;
    INSERT INTO _corte_reporte (seccion, item, valor)
    VALUES ('B opcional', 'B2 inventario de canceladas con devoluciones: APLICADO', v_det);
  EXCEPTION WHEN OTHERS THEN
    -- La vista previa se revierte siempre; si falla, se reporta sin tumbar la carga.
    -- Si se pidió aplicar y falla, sí se aborta todo.
    IF SQLERRM = 'corte_vista_previa' THEN
      GET STACKED DIAGNOSTICS v_det = PG_EXCEPTION_DETAIL;
      INSERT INTO _corte_reporte (seccion, item, valor)
      VALUES ('B opcional', 'B2 inventario de canceladas con devoluciones: NO aplicado, vista previa', v_det);
    ELSIF v_aplicar THEN
      RAISE;
    ELSE
      INSERT INTO _corte_reporte (seccion, item, valor)
      VALUES ('B opcional', 'B2 inventario de canceladas con devoluciones: NO aplicado, la vista previa falló', SQLERRM);
    END IF;
  END;
END
$b2$;

-- ════════════════════════════════════════════════════════════════════════════════
-- C. Verificaciones (solo lectura) — docs/migracion-corte.md § «Verificación tras importar»
-- ════════════════════════════════════════════════════════════════════════════════

-- C1 · devolucion_lineas con cantidad ≤ 0 (el CHECK devolucion_lineas_cantidad_positiva de F0
--      las rechaza: si hay, el CHECK queda NOT VALID; ver sección «constraints» del reporte).
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', 'C1 devolucion_lineas con cantidad <= 0', count(*)::text
  FROM public.devolucion_lineas WHERE cantidad <= 0;
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', '   · ' || e.nombre,
       format('devolución %s · %s · producto %s · cantidad %s', d.id, d.fecha, dl.producto_id, dl.cantidad)
  FROM public.devolucion_lineas dl
  JOIN public.devoluciones d ON d.id = dl.devolucion_id
  JOIN public.empresas e ON e.id = d.empresa_id
 WHERE dl.cantidad <= 0
 ORDER BY e.nombre, d.fecha
 LIMIT 20;

-- C2 · liquidaciones duplicadas por vendedor y día (no rechazadas). Si hay, el índice único
--      uq_descarga_ruta_vendedor_dia NO se crea (queda el trigger, igual que en su migración).
WITH dup AS (
  SELECT empresa_id, vendedor_id, COALESCE(fecha_inicio, fecha) AS dia, count(*) AS n
    FROM public.descarga_ruta
   WHERE vendedor_id IS NOT NULL AND status::text <> 'rechazada'
   GROUP BY 1, 2, 3 HAVING count(*) > 1)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', 'C2 liquidaciones duplicadas vendedor/día (grupos / filas)',
       count(*) || ' / ' || COALESCE(sum(n), 0) FROM dup;
WITH dup AS (
  SELECT empresa_id, vendedor_id, COALESCE(fecha_inicio, fecha) AS dia, count(*) AS n,
         string_agg(status::text, ',' ORDER BY created_at) AS estados
    FROM public.descarga_ruta
   WHERE vendedor_id IS NOT NULL AND status::text <> 'rechazada'
   GROUP BY 1, 2, 3 HAVING count(*) > 1)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', '   · ' || e.nombre,
       format('vendedor %s · %s · %s liquidaciones (%s)', COALESCE(p.nombre, d.vendedor_id::text), d.dia, d.n, d.estados)
  FROM dup d
  JOIN public.empresas e ON e.id = d.empresa_id
  LEFT JOIN public.profiles p ON p.id = d.vendedor_id
 ORDER BY e.nombre, d.dia DESC
 LIMIT 20;

-- C3 · entregas validadas con el mismo producto en 2+ renglones a las que les faltó descontar
--      (defecto corregido en 20261120200000; la corrección no recalcula las viejas).
WITH ent AS (
  SELECT el.entrega_id, el.producto_id, sum(el.cantidad_entregada) AS entregado
    FROM public.entrega_lineas el
    JOIN public.entregas e ON e.id = el.entrega_id
   WHERE e.status::text = 'hecho' AND el.hecho AND COALESCE(el.cantidad_entregada, 0) > 0
   GROUP BY 1, 2 HAVING count(*) > 1),
mov AS (
  SELECT m.referencia_id AS entrega_id, m.producto_id, sum(m.cantidad) AS descontado
    FROM public.movimientos_inventario m
   WHERE m.referencia_tipo = 'entrega_hecho' AND m.tipo::text = 'salida'
   GROUP BY 1, 2),
falta AS (
  SELECT ent.entrega_id, ent.producto_id, ent.entregado, COALESCE(mov.descontado, 0) AS descontado
    FROM ent LEFT JOIN mov USING (entrega_id, producto_id)
   WHERE ent.entregado > COALESCE(mov.descontado, 0) + 0.0001)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', 'C3 entregas con producto repetido sin descontar completo (renglones / piezas faltantes)',
       count(*) || ' / ' || COALESCE(round(sum(entregado - descontado), 3), 0) FROM falta;
WITH ent AS (
  SELECT el.entrega_id, el.producto_id, sum(el.cantidad_entregada) AS entregado
    FROM public.entrega_lineas el
    JOIN public.entregas e ON e.id = el.entrega_id
   WHERE e.status::text = 'hecho' AND el.hecho AND COALESCE(el.cantidad_entregada, 0) > 0
   GROUP BY 1, 2 HAVING count(*) > 1),
mov AS (
  SELECT m.referencia_id AS entrega_id, m.producto_id, sum(m.cantidad) AS descontado
    FROM public.movimientos_inventario m
   WHERE m.referencia_tipo = 'entrega_hecho' AND m.tipo::text = 'salida'
   GROUP BY 1, 2)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', '   · ' || em.nombre,
       format('%s · producto %s · entregado %s · descontado %s', e.folio, ent.producto_id, ent.entregado, COALESCE(mov.descontado, 0))
  FROM ent
  LEFT JOIN mov USING (entrega_id, producto_id)
  JOIN public.entregas e ON e.id = ent.entrega_id
  JOIN public.empresas em ON em.id = e.empresa_id
 WHERE ent.entregado > COALESCE(mov.descontado, 0) + 0.0001
 ORDER BY em.nombre, e.folio
 LIMIT 20;

-- C4 · Kardex vs existencias por ubicación (misma regla que kardex_saldo_inicial: entrada suma
--      en destino, salida resta en origen, transferencia ambas). Descuadres históricos de
--      Lovable se reportan; no se corrigen aquí.
WITH k AS (
  SELECT m.empresa_id, x.almacen_id, m.producto_id, sum(x.delta) AS kardex
    FROM public.movimientos_inventario m
    CROSS JOIN LATERAL (VALUES
      (m.almacen_destino_id, CASE WHEN m.tipo::text IN ('entrada', 'transferencia') THEN m.cantidad ELSE 0 END),
      (m.almacen_origen_id,  CASE WHEN m.tipo::text IN ('salida', 'transferencia')  THEN -m.cantidad ELSE 0 END)
    ) x(almacen_id, delta)
   WHERE x.almacen_id IS NOT NULL
   GROUP BY 1, 2, 3),
cmp AS (
  SELECT COALESCE(s.empresa_id, k.empresa_id) AS empresa_id,
         COALESCE(s.cantidad, 0) AS existencia, COALESCE(k.kardex, 0) AS kardex
    FROM public.stock_almacen s
    FULL JOIN k ON k.almacen_id = s.almacen_id AND k.producto_id = s.producto_id),
mal AS (SELECT empresa_id FROM cmp WHERE abs(existencia - kardex) > 0.0001)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', 'C4 kardex vs existencias: ubicación·producto descuadrados (total / empresas)',
       count(*) || ' / ' || count(DISTINCT empresa_id) FROM mal;
WITH k AS (
  SELECT m.empresa_id, x.almacen_id, m.producto_id, sum(x.delta) AS kardex
    FROM public.movimientos_inventario m
    CROSS JOIN LATERAL (VALUES
      (m.almacen_destino_id, CASE WHEN m.tipo::text IN ('entrada', 'transferencia') THEN m.cantidad ELSE 0 END),
      (m.almacen_origen_id,  CASE WHEN m.tipo::text IN ('salida', 'transferencia')  THEN -m.cantidad ELSE 0 END)
    ) x(almacen_id, delta)
   WHERE x.almacen_id IS NOT NULL
   GROUP BY 1, 2, 3),
cmp AS (
  SELECT COALESCE(s.empresa_id, k.empresa_id) AS empresa_id,
         COALESCE(s.cantidad, 0) AS existencia, COALESCE(k.kardex, 0) AS kardex
    FROM public.stock_almacen s
    FULL JOIN k ON k.almacen_id = s.almacen_id AND k.producto_id = s.producto_id)
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', '   · ' || e.nombre, count(*) || ' descuadres'
  FROM cmp JOIN public.empresas e ON e.id = cmp.empresa_id
 WHERE abs(existencia - kardex) > 0.0001
 GROUP BY e.nombre
 ORDER BY count(*) DESC
 LIMIT 20;

-- C5 · Folios: los generadores leen MAX+1 de los datos cargados (ventas, entregas, compras,
--      traspasos, cotizaciones, mermas…) → continúan solos. Contadores guardados que hay que
--      revisar: series CFDI y la única secuencia de public (identity).
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', 'C5 series CFDI con siguiente_folio <= folio ya usado', count(*)::text
  FROM public.cfdi_series s
 WHERE s.siguiente_folio <= (
         SELECT COALESCE(max(c.folio::bigint), 0) FROM public.cfdis c
          WHERE c.empresa_id = s.empresa_id AND c.serie = s.serie AND c.folio ~ '^[0-9]{1,18}$');
INSERT INTO _corte_reporte (seccion, item, valor)
SELECT 'C verificación', 'C5 secuencia auditoria_reparaciones_inventario (último / máx id)',
       COALESCE((SELECT last_value::text FROM public.auditoria_reparaciones_inventario_id_seq), '?')
       || ' / ' || COALESCE((SELECT max(id)::text FROM public.auditoria_reparaciones_inventario), '0');

-- Deja los triggers apagados como estaban (recargar-datos.sh los enciende al final).
SET LOCAL session_replication_role = replica;
