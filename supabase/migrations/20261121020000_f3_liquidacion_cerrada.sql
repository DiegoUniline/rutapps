-- F3 liquidación cerrada (D-049): aprobar congela el efectivo esperado con su desglose;
-- rechazar y reabrir solo con permiso, con motivo e historial; al re-aprobar el
-- inventario se reajusta POR DIFERENCIA (H7); una liquidación por vendedor y día.
--
-- Solo agrega: columnas nuevas (nullable/default), una tabla de historial, funciones,
-- triggers e índices. No borra datos, no quita columnas ni políticas, no cambia FKs.
-- La fórmula del efectivo esperado sigue siendo fn_liquidacion_esperado (F0): aquí
-- solo se CONSUME (sus llaves se copian tal cual al desglose).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Columnas nuevas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.descarga_ruta
  ADD COLUMN IF NOT EXISTS esperado_desglose      jsonb,
  ADD COLUMN IF NOT EXISTS congelado_at           timestamptz,
  ADD COLUMN IF NOT EXISTS inventario_aplicado_at timestamptz,
  ADD COLUMN IF NOT EXISTS reabierta_por          uuid,
  ADD COLUMN IF NOT EXISTS reabierta_at           timestamptz,
  ADD COLUMN IF NOT EXISTS motivo_reapertura      text,
  ADD COLUMN IF NOT EXISTS veces_reabierta        integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.descarga_ruta.esperado_desglose IS
  'F3: desglose del efectivo esperado congelado al aprobar (fn_liquidacion_desglose). NULL = pendiente/rechazada o aprobada antes de F3.';
COMMENT ON COLUMN public.descarga_ruta.inventario_aplicado_at IS
  'F3: primera vez que la aprobación movió inventario (descargo de camión). Si ya tiene valor, re-aprobar solo aplica la diferencia.';

-- Cantidad que esta liquidación ya metió a la bodega por renglón (base del reajuste por diferencia).
ALTER TABLE public.descarga_ruta_lineas
  ADD COLUMN IF NOT EXISTS cantidad_aplicada numeric;

COMMENT ON COLUMN public.descarga_ruta_lineas.cantidad_aplicada IS
  'F3: físico ya aplicado a la bodega destino al aprobar. NULL = aún no aplicado.';

-- Respaldo de datos anteriores a F3 (aprobadas que ya movieron inventario).
-- Los UPDATE no tocan status: no disparan los triggers de inventario.
UPDATE public.descarga_ruta d
   SET inventario_aplicado_at = COALESCE(d.fecha_aprobacion, d.created_at)
 WHERE d.inventario_aplicado_at IS NULL
   AND EXISTS (SELECT 1 FROM public.movimientos_inventario m
                WHERE m.referencia_id = d.id AND m.referencia_tipo = 'descarga');

UPDATE public.descarga_ruta_lineas l
   SET cantidad_aplicada = COALESCE((
         SELECT SUM(m.cantidad) FROM public.movimientos_inventario m
          WHERE m.referencia_id = d.id AND m.referencia_tipo = 'descarga'
            AND m.tipo = 'entrada' AND m.producto_id = l.producto_id
            AND m.almacen_destino_id = d.almacen_destino_id), 0)
  FROM public.descarga_ruta d
 WHERE d.id = l.descarga_id AND d.inventario_aplicado_at IS NOT NULL
   AND l.cantidad_aplicada IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Historial de aprobaciones, rechazos y reaperturas (solo se agrega)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.descarga_ruta_eventos (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL,
  descarga_id    uuid NOT NULL,
  accion         text NOT NULL CHECK (accion IN ('aprobada', 'rechazada', 'reabierta')),
  motivo         text,
  desglose       jsonb,
  user_id        uuid,
  usuario_nombre text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_descarga_ruta_eventos_descarga
  ON public.descarga_ruta_eventos (descarga_id, created_at);
CREATE INDEX IF NOT EXISTS idx_descarga_ruta_eventos_empresa
  ON public.descarga_ruta_eventos (empresa_id, created_at);

ALTER TABLE public.descarga_ruta_eventos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tenant isolation (lectura)" ON public.descarga_ruta_eventos;
CREATE POLICY "Tenant isolation (lectura)" ON public.descarga_ruta_eventos
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_my_empresa_id())
         OR (SELECT public.is_super_admin((SELECT auth.uid()))));
-- Sin políticas de escritura: solo las RPC (SECURITY DEFINER) escriben el historial.

REVOKE ALL ON public.descarga_ruta_eventos FROM anon;
GRANT SELECT ON public.descarga_ruta_eventos TO authenticated;
GRANT ALL ON public.descarga_ruta_eventos TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Desglose del efectivo esperado de UNA liquidación (en vivo).
--    Copia todas las llaves de fn_liquidacion_esperado (cobros_efectivo, gastos,
--    devoluciones_dinero, reembolsos, esperado, y las que se agreguen) y suma lo
--    informativo: cobros por método, ventas de contado y crédito, cobros de saldos
--    anteriores, efectivo entregado y diferencia.
--    SECURITY INVOKER: con RLS solo ve su empresa.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_liquidacion_desglose(p_descarga_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  d        record;
  v_desde  date;
  v_hasta  date;
  v_uid    uuid;
  x        jsonb;
  v_met    jsonb := '{}'::jsonb;
  v_cobtot numeric := 0;
  v_ant    numeric := 0;
  v_cont   numeric := 0;
  v_cont_n integer := 0;
  v_cred   numeric := 0;
  v_cred_n integer := 0;
  v_esp    numeric;
  v_dev    numeric;
BEGIN
  SELECT id, empresa_id, vendedor_id, user_id, fecha, fecha_inicio, fecha_fin, efectivo_entregado
    INTO d FROM public.descarga_ruta WHERE id = p_descarga_id;
  IF NOT FOUND THEN RETURN NULL; END IF;

  v_desde := COALESCE(d.fecha_inicio, d.fecha);
  v_hasta := COALESCE(d.fecha_fin, d.fecha);
  x := public.fn_liquidacion_esperado(d.empresa_id, d.vendedor_id, v_desde, v_hasta, d.user_id);

  -- Quién cobró: el usuario del vendedor (mismo criterio que fn_liquidacion_esperado).
  IF d.vendedor_id IS NOT NULL THEN
    SELECT user_id INTO v_uid FROM public.profiles WHERE id = d.vendedor_id;
  END IF;
  v_uid := COALESCE(v_uid, d.user_id);

  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(jsonb_object_agg(s.metodo, s.total), '{}'::jsonb), COALESCE(SUM(s.total), 0)
      INTO v_met, v_cobtot
      FROM (SELECT COALESCE(NULLIF(c.metodo_pago, ''), 'efectivo') AS metodo, round(SUM(c.monto), 2) AS total
              FROM public.cobros c
             WHERE c.empresa_id = d.empresa_id AND c.user_id = v_uid
               AND c.fecha BETWEEN v_desde AND v_hasta
               AND c.status <> 'cancelado'
               AND c.metodo_pago NOT IN ('saldo_favor', 'ajuste_liquidacion')  -- no es dinero
             GROUP BY 1) s;

    -- Cobros del periodo aplicados a ventas de fechas anteriores (saldos anteriores).
    SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_ant
      FROM public.cobros c
      JOIN public.cobro_aplicaciones ca ON ca.cobro_id = c.id
      JOIN public.ventas v ON v.id = ca.venta_id
     WHERE c.empresa_id = d.empresa_id AND c.user_id = v_uid
       AND c.fecha BETWEEN v_desde AND v_hasta
       AND c.status <> 'cancelado'
       AND c.metodo_pago NOT IN ('saldo_favor', 'ajuste_liquidacion')
       AND v.fecha < v_desde;
  END IF;

  IF d.vendedor_id IS NOT NULL THEN
    SELECT COALESCE(SUM(v.total) FILTER (WHERE v.condicion_pago::text = 'contado'), 0),
           COUNT(*) FILTER (WHERE v.condicion_pago::text = 'contado'),
           COALESCE(SUM(v.total) FILTER (WHERE v.condicion_pago::text = 'credito'), 0),
           COUNT(*) FILTER (WHERE v.condicion_pago::text = 'credito')
      INTO v_cont, v_cont_n, v_cred, v_cred_n
      FROM public.ventas v
     WHERE v.empresa_id = d.empresa_id AND v.vendedor_id = d.vendedor_id
       AND v.fecha BETWEEN v_desde AND v_hasta
       AND v.status::text <> 'cancelado';
  END IF;

  v_esp := COALESCE((x->>'esperado')::numeric, 0);
  v_dev := COALESCE((x->>'devoluciones_dinero')::numeric, 0) + COALESCE((x->>'reembolsos')::numeric, 0);

  RETURN COALESCE(x, '{}'::jsonb) || jsonb_build_object(
    'version',                  1,
    'desde',                    v_desde,
    'hasta',                    v_hasta,
    'cobros_por_metodo',        v_met,
    'cobros_transferencia',     COALESCE((v_met->>'transferencia')::numeric, 0),
    'cobros_tarjeta',           COALESCE((v_met->>'tarjeta')::numeric, 0),
    'cobros_total',             round(v_cobtot, 2),
    'cobros_saldos_anteriores', round(v_ant, 2),
    'dinero_devuelto',          round(v_dev, 2),
    'ventas_contado',           round(v_cont, 2),
    'ventas_contado_n',         v_cont_n,
    'ventas_credito',           round(v_cred, 2),
    'ventas_credito_n',         v_cred_n,
    'efectivo_entregado',       round(COALESCE(d.efectivo_entregado, 0), 2),
    'diferencia',               round(COALESCE(d.efectivo_entregado, 0) - v_esp, 2),
    'calculado_at',             now());
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_liquidacion_desglose(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_liquidacion_desglose(uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Una liquidación por vendedor y día (no cuentan las rechazadas).
--    Trigger = mensaje claro y también evita periodos traslapados;
--    índice único = garantía ante dos envíos simultáneos del mismo día.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_descarga_ruta_unica()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_otra record;
BEGIN
  IF NEW.vendedor_id IS NULL OR NEW.status::text = 'rechazada' THEN RETURN NEW; END IF;
  IF COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND (NEW.vendedor_id, NEW.fecha, NEW.fecha_inicio, NEW.fecha_fin, NEW.status, NEW.empresa_id)
         IS NOT DISTINCT FROM
         (OLD.vendedor_id, OLD.fecha, OLD.fecha_inicio, OLD.fecha_fin, OLD.status, OLD.empresa_id) THEN
    RETURN NEW;
  END IF;

  SELECT o.id, o.status::text AS status, COALESCE(o.fecha_inicio, o.fecha) AS desde
    INTO v_otra
    FROM public.descarga_ruta o
   WHERE o.empresa_id = NEW.empresa_id
     AND o.vendedor_id = NEW.vendedor_id
     AND o.id <> NEW.id
     AND o.status::text <> 'rechazada'
     AND COALESCE(o.fecha_inicio, o.fecha) <= COALESCE(NEW.fecha_fin, NEW.fecha)
     AND COALESCE(o.fecha_fin, o.fecha)    >= COALESCE(NEW.fecha_inicio, NEW.fecha)
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Ya existe una liquidación (%) de este vendedor que cubre el %. Ábrela en lugar de crear otra.',
      v_otra.status, to_char(v_otra.desde, 'DD/MM/YYYY')
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_descarga_ruta_unica ON public.descarga_ruta;
CREATE TRIGGER trg_descarga_ruta_unica
  BEFORE INSERT OR UPDATE ON public.descarga_ruta
  FOR EACH ROW EXECUTE FUNCTION public.tg_descarga_ruta_unica();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.descarga_ruta
     WHERE vendedor_id IS NOT NULL AND status::text <> 'rechazada'
     GROUP BY empresa_id, vendedor_id, COALESCE(fecha_inicio, fecha)
    HAVING COUNT(*) > 1
  ) THEN
    -- Datos viejos duplicados: no se borran; el trigger protege las filas nuevas.
    RAISE NOTICE 'F3: hay liquidaciones duplicadas por vendedor y día; no se crea el índice único (solo el trigger).';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_descarga_ruta_vendedor_dia
      ON public.descarga_ruta (empresa_id, vendedor_id, (COALESCE(fecha_inicio, fecha)))
      WHERE vendedor_id IS NOT NULL AND status <> 'rechazada'::public.status_descarga;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) Marca de inventario aplicado: al pasar a 'aprobada' con descargo de camión,
--    la primera vez se anota la fecha. Los triggers AFTER leen OLD.inventario_aplicado_at
--    para saber si es la primera aprobación (todo) o una re-aprobación (diferencia).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_descarga_ruta_marca_aplicado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status::text = 'aprobada' AND OLD.status::text <> 'aprobada'
     AND COALESCE(NEW.descargo_camion, false) THEN
    NEW.inventario_aplicado_at := COALESCE(OLD.inventario_aplicado_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_descarga_ruta_marca_aplicado ON public.descarga_ruta;
CREATE TRIGGER trg_descarga_ruta_marca_aplicado
  BEFORE UPDATE OF status ON public.descarga_ruta
  FOR EACH ROW EXECUTE FUNCTION public.tg_descarga_ruta_marca_aplicado();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Inventario al aprobar (H7). Primera aprobación: igual que antes (físico a la
--    bodega, camión en 0, diferencia como ajuste) y anota cantidad_aplicada.
--    Re-aprobación: por renglón aplica SOLO real − cantidad_aplicada en la bodega
--    (entrada o salida, con kardex) y registra el cambio de la diferencia como
--    ajuste; el camión no se vuelve a tocar. Un renglón agregado al reabrir se
--    aplica como en la primera vez (sale del camión a la bodega).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_descarga_ruta_aprobada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camion uuid; v_bodega uuid; v_linea RECORD;
  v_real numeric; v_cam_now numeric; v_dif numeric; v_delta numeric;
  v_reaj boolean;
  v_user uuid;
  v_fecha date;
BEGIN
  IF NEW.status <> 'aprobada' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprobada' THEN RETURN NEW; END IF;
  IF NOT COALESCE(NEW.descargo_camion, false) THEN RETURN NEW; END IF;
  v_reaj := OLD.inventario_aplicado_at IS NOT NULL;
  -- Anterior a F3 sin marca: si ya movió inventario no se repite.
  IF NOT v_reaj AND EXISTS (SELECT 1 FROM public.movimientos_inventario
                             WHERE referencia_tipo='descarga' AND referencia_id=NEW.id) THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_camion FROM public.profiles WHERE id = NEW.vendedor_id;
  v_bodega := NEW.almacen_destino_id;
  IF v_camion IS NULL OR v_bodega IS NULL THEN
    RAISE EXCEPTION 'Descarga %: falta camión o bodega destino (camión=%, bodega=%)', NEW.id, v_camion, v_bodega; END IF;
  IF v_camion = v_bodega THEN
    RAISE EXCEPTION 'Descarga %: la bodega destino no puede ser el mismo almacén del camión', NEW.id; END IF;
  v_user := COALESCE(NEW.aprobado_por, NEW.user_id);
  v_fecha := COALESCE(NEW.fecha, CURRENT_DATE);

  FOR v_linea IN SELECT id, producto_id, cantidad_real, cantidad_esperada, cantidad_aplicada
                   FROM public.descarga_ruta_lineas WHERE descarga_id=NEW.id LOOP
    v_real := COALESCE(v_linea.cantidad_real,0);

    IF v_reaj AND v_linea.cantidad_aplicada IS NOT NULL THEN
      -- Re-aprobación: solo la diferencia contra lo ya aplicado.
      v_delta := v_real - v_linea.cantidad_aplicada;
      IF v_delta <> 0 THEN
        INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (NEW.empresa_id, v_bodega, v_linea.producto_id, v_delta)
        ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad=public.stock_almacen.cantidad+EXCLUDED.cantidad, updated_at=now();
        IF v_delta > 0 THEN
          INSERT INTO public.movimientos_inventario (empresa_id,tipo,producto_id,cantidad,almacen_destino_id,referencia_tipo,referencia_id,user_id,fecha,notas)
          VALUES (NEW.empresa_id,'entrada',v_linea.producto_id,v_delta,v_bodega,'descarga',NEW.id,v_user,v_fecha,
                  'Descarga de ruta reabierta: reajuste +'||v_delta||' a bodega (conteo '||v_linea.cantidad_aplicada||' → '||v_real||', descarga '||NEW.id||')');
        ELSE
          INSERT INTO public.movimientos_inventario (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,referencia_tipo,referencia_id,user_id,fecha,notas)
          VALUES (NEW.empresa_id,'salida',v_linea.producto_id,-v_delta,v_bodega,'descarga',NEW.id,v_user,v_fecha,
                  'Descarga de ruta reabierta: reajuste '||v_delta||' en bodega (conteo '||v_linea.cantidad_aplicada||' → '||v_real||', descarga '||NEW.id||')');
        END IF;
        INSERT INTO public.ajustes_inventario (empresa_id,producto_id,almacen_id,cantidad_anterior,cantidad_nueva,diferencia,motivo,user_id,fecha)
        VALUES (NEW.empresa_id,v_linea.producto_id,v_camion,v_linea.cantidad_aplicada,v_real,v_delta,
                'Reajuste de descarga reabierta (revisar) — descarga '||NEW.id||' · conteo anterior '||v_linea.cantidad_aplicada||' · nuevo '||v_real,
                v_user,v_fecha);
      END IF;
      UPDATE public.descarga_ruta_lineas
         SET diferencia = v_real - COALESCE(cantidad_esperada, 0), cantidad_aplicada = v_real
       WHERE id = v_linea.id;
      CONTINUE;
    END IF;

    -- Primera aplicación del renglón (comportamiento de siempre).
    SELECT cantidad INTO v_cam_now FROM public.stock_almacen WHERE almacen_id=v_camion AND producto_id=v_linea.producto_id;
    v_cam_now := COALESCE(v_cam_now,0);
    IF v_real > 0 THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (NEW.empresa_id, v_bodega, v_linea.producto_id, v_real)
      ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad=public.stock_almacen.cantidad+EXCLUDED.cantidad, updated_at=now();
      INSERT INTO public.movimientos_inventario (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,almacen_destino_id,referencia_tipo,referencia_id,user_id,fecha,notas)
      VALUES (NEW.empresa_id,'entrada',v_linea.producto_id,v_real,v_camion,v_bodega,'descarga',NEW.id,v_user,v_fecha,'Descarga de ruta: entrada a bodega (descarga '||NEW.id||')');
    END IF;
    IF v_cam_now <> 0 THEN
      UPDATE public.stock_almacen SET cantidad=0, updated_at=now() WHERE almacen_id=v_camion AND producto_id=v_linea.producto_id;
      INSERT INTO public.movimientos_inventario (empresa_id,tipo,producto_id,cantidad,almacen_origen_id,referencia_tipo,referencia_id,user_id,fecha,notas)
      VALUES (NEW.empresa_id,'salida',v_linea.producto_id,v_cam_now,v_camion,'descarga',NEW.id,v_user,v_fecha,'Descarga de ruta: salida de camión (descarga '||NEW.id||')');
    END IF;
    v_dif := v_real - v_cam_now;
    IF v_dif <> 0 THEN
      INSERT INTO public.ajustes_inventario (empresa_id,producto_id,almacen_id,cantidad_anterior,cantidad_nueva,diferencia,motivo,user_id,fecha)
      VALUES (NEW.empresa_id,v_linea.producto_id,v_camion,v_cam_now,v_real,v_dif,'Diferencia en descarga (revisar) — descarga '||NEW.id||' · esperado '||v_cam_now||' · físico '||v_real,v_user,v_fecha);
    END IF;
    UPDATE public.descarga_ruta_lineas SET cantidad_esperada=v_cam_now, diferencia=v_dif, cantidad_aplicada=v_real WHERE id=v_linea.id;
  END LOOP;
  RETURN NEW;
END; $function$;

-- Lotes: solo en la primera aprobación (el reajuste por diferencia va sin lote).
CREATE OR REPLACE FUNCTION public.aplicar_lote_descarga()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_camion uuid; v_bodega uuid; v_linea RECORD; v_pending numeric; v_lote RECORD; v_take numeric;
BEGIN
  IF NEW.status <> 'aprobada' THEN RETURN NEW; END IF;
  IF OLD.status = 'aprobada' THEN RETURN NEW; END IF;
  IF NOT COALESCE(NEW.descargo_camion, false) THEN RETURN NEW; END IF;
  IF OLD.inventario_aplicado_at IS NOT NULL THEN RETURN NEW; END IF;  -- F3: re-aprobación
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario WHERE referencia_id = NEW.id AND referencia_tipo = 'descarga_lote') THEN RETURN NEW; END IF;
  SELECT almacen_id INTO v_camion FROM public.profiles WHERE id = NEW.vendedor_id;
  v_bodega := NEW.almacen_destino_id;
  IF v_camion IS NULL OR v_bodega IS NULL THEN RETURN NEW; END IF;
  FOR v_linea IN SELECT producto_id, COALESCE(cantidad_real, 0) AS cantidad_real FROM public.descarga_ruta_lineas WHERE descarga_id = NEW.id LOOP
    v_pending := v_linea.cantidad_real;
    FOR v_lote IN
      SELECT sl.lote_id, sl.cantidad AS existencia FROM public.stock_lotes sl JOIN public.lotes l ON l.id = sl.lote_id
      WHERE sl.almacen_id = v_camion AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0
      ORDER BY l.fecha_caducidad ASC NULLS LAST, l.created_at ASC FOR UPDATE OF sl
    LOOP
      EXIT WHEN v_pending <= 0;
      v_take := LEAST(v_lote.existencia, v_pending);
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES (NEW.empresa_id, 'traspaso', v_linea.producto_id, v_take, v_camion, v_bodega, v_lote.lote_id, 'descarga_lote', NEW.id, COALESCE(NEW.fecha, CURRENT_DATE), 'Descarga lote · camión→bodega (FEFO)');
      v_pending := v_pending - v_take;
    END LOOP;
    FOR v_lote IN
      SELECT sl.lote_id, sl.cantidad AS existencia FROM public.stock_lotes sl
      WHERE sl.almacen_id = v_camion AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0 FOR UPDATE OF sl
    LOOP
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, fecha, notas)
      VALUES (NEW.empresa_id, 'salida', v_linea.producto_id, v_lote.existencia, v_camion, v_lote.lote_id, 'descarga_lote', NEW.id, COALESCE(NEW.fecha, CURRENT_DATE), 'Descarga lote · merma/faltante en camión');
    END LOOP;
  END LOOP;
  RETURN NEW;
END; $function$;

-- Merma del camión: se pasa a Mermas solo en la primera aprobación. Al re-aprobar,
-- lo que haya en «Merma en camión» ya es de días siguientes (va en su liquidación).
CREATE OR REPLACE FUNCTION public.tg_descarga_merma_camion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_camion  uuid;
  v_mcam    uuid;
  v_central uuid;
  r record;
BEGIN
  IF NEW.status <> 'aprobada' OR OLD.status = 'aprobada' THEN RETURN NEW; END IF;
  IF NOT COALESCE(NEW.descargo_camion, false) THEN RETURN NEW; END IF;
  IF OLD.inventario_aplicado_at IS NOT NULL THEN RETURN NEW; END IF;  -- F3: re-aprobación
  SELECT almacen_id INTO v_camion FROM public.profiles WHERE id = NEW.vendedor_id;
  IF v_camion IS NULL THEN RETURN NEW; END IF;
  SELECT id INTO v_mcam FROM public.almacenes WHERE merma_de_almacen_id = v_camion;
  IF v_mcam IS NULL THEN RETURN NEW; END IF;
  v_central := public.ensure_almacen_mermas(NEW.empresa_id);
  FOR r IN SELECT producto_id, cantidad FROM public.stock_almacen WHERE almacen_id = v_mcam AND cantidad > 0 LOOP
    PERFORM public._mover_stock_entre_almacenes(NEW.empresa_id, r.producto_id, r.cantidad, v_mcam, v_central,
      'descarga', NEW.id, COALESCE(NEW.aprobado_por, NEW.user_id), COALESCE(NEW.fecha, CURRENT_DATE),
      'Descarga de ruta: merma del camión a Mermas (descarga ' || NEW.id || ')');
  END LOOP;
  RETURN NEW;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) Permisos (F0) + F3: el estado solo cambia por las RPC (aprobar, rechazar,
--    reabrir); una aprobada no se modifica (se reabre); lo congelado solo lo
--    escriben las RPC. Exentos: service_role, SQL directo y borrado de empresa.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_descarga_ruta_permisos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_rpc boolean := COALESCE(current_setting('app.liquidacion_rpc', true), '') = '1';
BEGIN
  -- Procesos del servidor, SQL directo y eliminación de empresa (D-046) quedan exentos.
  IF COALESCE(auth.role(), '') = 'service_role' OR v_uid IS NULL
     OR COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status::text <> 'pendiente' OR NEW.aprobado_por IS NOT NULL
       OR NEW.fecha_aprobacion IS NOT NULL
       OR NEW.esperado_desglose IS NOT NULL OR NEW.congelado_at IS NOT NULL
       OR NEW.inventario_aplicado_at IS NOT NULL OR NEW.reabierta_por IS NOT NULL
       OR NEW.reabierta_at IS NOT NULL OR NEW.motivo_reapertura IS NOT NULL
       OR COALESCE(NEW.veces_reabierta, 0) <> 0 THEN
      RAISE EXCEPTION 'La liquidación se registra pendiente; se aprueba o rechaza desde Liquidaciones.'
        USING ERRCODE = '42501';
    END IF;
    IF public.fn_puede_descargas(v_uid, NEW.empresa_id, 'editar') THEN RETURN NEW; END IF;
    IF NEW.notas_supervisor IS NOT NULL THEN
      RAISE EXCEPTION 'Solo quien tiene permiso de aprobar liquidaciones puede registrarla aprobada o rechazada.'
        USING ERRCODE = '42501';
    END IF;
    IF public.fn_puede_descargas(v_uid, NEW.empresa_id, 'crear') THEN RETURN NEW; END IF;
    IF NEW.user_id IS DISTINCT FROM v_uid
       OR (NEW.vendedor_id IS NOT NULL AND NOT public._descarga_es_propia(v_uid, NULL, NEW.vendedor_id)) THEN
      RAISE EXCEPTION 'Solo puedes registrar tu propia liquidación.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NOT v_rpc THEN
      IF NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'El estado de la liquidación se cambia con Aprobar, Rechazar o Reabrir.'
          USING ERRCODE = '42501';
      END IF;
      IF (NEW.esperado_desglose, NEW.congelado_at, NEW.inventario_aplicado_at, NEW.reabierta_por,
          NEW.reabierta_at, NEW.motivo_reapertura, NEW.veces_reabierta, NEW.aprobado_por, NEW.fecha_aprobacion)
         IS DISTINCT FROM
         (OLD.esperado_desglose, OLD.congelado_at, OLD.inventario_aplicado_at, OLD.reabierta_por,
          OLD.reabierta_at, OLD.motivo_reapertura, OLD.veces_reabierta, OLD.aprobado_por, OLD.fecha_aprobacion) THEN
        RAISE EXCEPTION 'La aprobación y el cuadre congelado solo los escribe Aprobar/Rechazar/Reabrir.'
          USING ERRCODE = '42501';
      END IF;
      IF OLD.status::text = 'aprobada'
         AND (NEW.efectivo_entregado, NEW.efectivo_esperado, NEW.diferencia_efectivo, NEW.descargo_camion,
              NEW.almacen_destino_id, NEW.empresa_id, NEW.user_id, NEW.vendedor_id, NEW.carga_id,
              NEW.fecha, NEW.fecha_inicio, NEW.fecha_fin, NEW.notas_supervisor)
             IS DISTINCT FROM
             (OLD.efectivo_entregado, OLD.efectivo_esperado, OLD.diferencia_efectivo, OLD.descargo_camion,
              OLD.almacen_destino_id, OLD.empresa_id, OLD.user_id, OLD.vendedor_id, OLD.carga_id,
              OLD.fecha, OLD.fecha_inicio, OLD.fecha_fin, OLD.notas_supervisor) THEN
        RAISE EXCEPTION 'La liquidación está aprobada: reábrela (con motivo) para cambiarla.'
          USING ERRCODE = '42501';
      END IF;
    END IF;
    IF public.fn_puede_descargas(v_uid, OLD.empresa_id, 'editar') THEN RETURN NEW; END IF;
    IF NOT public._descarga_es_propia(v_uid, OLD.user_id, OLD.vendedor_id) THEN
      RAISE EXCEPTION 'No tienes permiso para modificar esta liquidación.' USING ERRCODE = '42501';
    END IF;
    IF OLD.status::text <> 'pendiente' THEN
      RAISE EXCEPTION 'La liquidación ya fue revisada; solo un supervisor puede reabrirla o cambiarla.'
        USING ERRCODE = '42501';
    END IF;
    IF (NEW.status, NEW.aprobado_por, NEW.fecha_aprobacion, NEW.notas_supervisor, NEW.almacen_destino_id,
        NEW.efectivo_entregado, NEW.efectivo_esperado, NEW.diferencia_efectivo, NEW.descargo_camion,
        NEW.empresa_id, NEW.user_id, NEW.vendedor_id, NEW.carga_id, NEW.fecha, NEW.fecha_inicio, NEW.fecha_fin)
       IS DISTINCT FROM
       (OLD.status, OLD.aprobado_por, OLD.fecha_aprobacion, OLD.notas_supervisor, OLD.almacen_destino_id,
        OLD.efectivo_entregado, OLD.efectivo_esperado, OLD.diferencia_efectivo, OLD.descargo_camion,
        OLD.empresa_id, OLD.user_id, OLD.vendedor_id, OLD.carga_id, OLD.fecha, OLD.fecha_inicio, OLD.fecha_fin)
    THEN
      RAISE EXCEPTION 'Solo un supervisor puede cambiar el estado, la aprobación o los montos de la liquidación.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- DELETE
  IF public.fn_puede_descargas(v_uid, OLD.empresa_id, 'eliminar') THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'No tienes permiso para eliminar liquidaciones.' USING ERRCODE = '42501';
END;
$function$;

-- Conteo: con la liquidación aprobada nadie lo cambia (se reabre primero);
-- el resto igual que F0.
CREATE OR REPLACE FUNCTION public.tg_descarga_ruta_lineas_permisos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_d   record;
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role' OR v_uid IS NULL
     OR COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  SELECT empresa_id, status::text AS status, user_id, vendedor_id INTO v_d
    FROM public.descarga_ruta
   WHERE id = CASE WHEN TG_OP = 'DELETE' THEN OLD.descarga_id ELSE NEW.descarga_id END;
  IF NOT FOUND THEN RETURN COALESCE(NEW, OLD); END IF;  -- la FK decide
  IF v_d.status = 'aprobada' AND COALESCE(current_setting('app.liquidacion_rpc', true), '') <> '1' THEN
    RAISE EXCEPTION 'La liquidación está aprobada: reábrela (con motivo) para cambiar el conteo.' USING ERRCODE = '42501';
  END IF;
  IF public.fn_puede_descargas(v_uid, v_d.empresa_id, 'editar') THEN RETURN COALESCE(NEW, OLD); END IF;
  IF v_d.status <> 'pendiente' THEN
    RAISE EXCEPTION 'La liquidación ya fue revisada; su conteo solo lo cambia un supervisor.' USING ERRCODE = '42501';
  END IF;
  IF NOT public._descarga_es_propia(v_uid, v_d.user_id, v_d.vendedor_id)
     AND NOT public.fn_puede_descargas(v_uid, v_d.empresa_id, 'crear') THEN
    RAISE EXCEPTION 'No tienes permiso para modificar esta liquidación.' USING ERRCODE = '42501';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) RPC: aprobar, rechazar y reabrir (cada una en una transacción).
-- ─────────────────────────────────────────────────────────────────────────────
-- Valida sesión, empresa y permiso; bloquea la fila.
CREATE OR REPLACE FUNCTION public._liquidacion_para_accion(p_id uuid)
RETURNS public.descarga_ruta
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_d   public.descarga_ruta;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_d FROM public.descarga_ruta WHERE id = p_id FOR UPDATE;
  -- Otra empresa = no encontrada (no se revela que existe).
  IF NOT FOUND OR (v_d.empresa_id IS DISTINCT FROM public.get_my_empresa_id()
                   AND NOT public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Liquidación no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.fn_puede_descargas(v_uid, v_d.empresa_id, 'editar') THEN
    RAISE EXCEPTION 'No tienes permiso para aprobar, rechazar o reabrir liquidaciones.' USING ERRCODE = '42501';
  END IF;
  RETURN v_d;
END;
$function$;

REVOKE ALL ON FUNCTION public._liquidacion_para_accion(uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._liquidacion_evento(
  p_d public.descarga_ruta, p_accion text, p_motivo text, p_desglose jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  INSERT INTO public.descarga_ruta_eventos (empresa_id, descarga_id, accion, motivo, desglose, user_id, usuario_nombre)
  VALUES (p_d.empresa_id, p_d.id, p_accion, NULLIF(btrim(COALESCE(p_motivo, '')), ''), p_desglose, v_uid,
          (SELECT p.nombre FROM public.profiles p WHERE p.user_id = v_uid
            ORDER BY (p.empresa_id = p_d.empresa_id) DESC, p.created_at LIMIT 1));
END;
$function$;

REVOKE ALL ON FUNCTION public._liquidacion_evento(public.descarga_ruta, text, text, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public._liquidacion_perfil(p_empresa_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p.id FROM public.profiles p
   WHERE p.user_id = auth.uid()
   ORDER BY (p.empresa_id = p_empresa_id) DESC, p.created_at
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public._liquidacion_perfil(uuid) FROM PUBLIC, anon, authenticated;

-- Aprobar: congela el desglose y mueve el inventario (triggers). Re-aprobar ajusta por diferencia.
CREATE OR REPLACE FUNCTION public.aprobar_liquidacion(
  p_descarga_id uuid, p_notas text DEFAULT NULL, p_almacen_destino_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d       public.descarga_ruta;
  v_bodega  uuid;
  v_des     jsonb;
  v_esp     numeric;
BEGIN
  v_d := public._liquidacion_para_accion(p_descarga_id);
  IF v_d.status::text <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se aprueba una liquidación pendiente (está %).', v_d.status USING ERRCODE = 'P0001';
  END IF;

  v_bodega := COALESCE(p_almacen_destino_id, v_d.almacen_destino_id);
  IF COALESCE(v_d.descargo_camion, false) THEN
    IF v_bodega IS NULL THEN
      RAISE EXCEPTION 'Elige la bodega destino para descargar el camión.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = v_bodega AND a.empresa_id = v_d.empresa_id) THEN
      RAISE EXCEPTION 'La bodega destino no es de esta empresa.' USING ERRCODE = '22023';
    END IF;
    IF v_d.inventario_aplicado_at IS NOT NULL AND v_d.almacen_destino_id IS NOT NULL
       AND v_bodega IS DISTINCT FROM v_d.almacen_destino_id THEN
      RAISE EXCEPTION 'El inventario ya entró a otra bodega; al re-aprobar no se cambia la bodega destino.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_des := public.fn_liquidacion_desglose(v_d.id);
  v_esp := COALESCE((v_des->>'esperado')::numeric, 0);

  PERFORM set_config('app.liquidacion_rpc', '1', true);
  UPDATE public.descarga_ruta
     SET status             = 'aprobada',
         aprobado_por       = public._liquidacion_perfil(v_d.empresa_id),
         fecha_aprobacion   = now(),
         notas_supervisor   = COALESCE(NULLIF(btrim(COALESCE(p_notas, '')), ''), notas_supervisor),
         almacen_destino_id = CASE WHEN COALESCE(descargo_camion, false) THEN v_bodega ELSE almacen_destino_id END,
         efectivo_esperado  = v_esp,
         diferencia_efectivo = round(COALESCE(efectivo_entregado, 0) - v_esp, 2),
         esperado_desglose  = v_des,
         congelado_at       = now()
   WHERE id = v_d.id;
  PERFORM set_config('app.liquidacion_rpc', '', true);

  PERFORM public._liquidacion_evento(v_d, 'aprobada', p_notas, v_des);
  RETURN v_des;
END;
$function$;

-- Rechazar: motivo obligatorio. No se rechaza una que ya movió inventario (D-006).
CREATE OR REPLACE FUNCTION public.rechazar_liquidacion(p_descarga_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d public.descarga_ruta;
BEGIN
  IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Escribe el motivo del rechazo.' USING ERRCODE = '22023';
  END IF;
  v_d := public._liquidacion_para_accion(p_descarga_id);
  IF v_d.status::text <> 'pendiente' THEN
    RAISE EXCEPTION 'Solo se rechaza una liquidación pendiente (está %).', v_d.status USING ERRCODE = 'P0001';
  END IF;
  IF v_d.inventario_aplicado_at IS NOT NULL THEN
    RAISE EXCEPTION 'Esta liquidación ya movió inventario: corrige el conteo y apruébala de nuevo; no se rechaza.'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.liquidacion_rpc', '1', true);
  UPDATE public.descarga_ruta
     SET status            = 'rechazada',
         aprobado_por      = public._liquidacion_perfil(v_d.empresa_id),
         fecha_aprobacion  = now(),
         notas_supervisor  = btrim(p_motivo),
         esperado_desglose = NULL,
         congelado_at      = NULL
   WHERE id = v_d.id;
  PERFORM set_config('app.liquidacion_rpc', '', true);

  PERFORM public._liquidacion_evento(v_d, 'rechazada', p_motivo, NULL);
END;
$function$;

-- Reabrir: motivo obligatorio; registra quién, cuándo y por qué (también en historial).
CREATE OR REPLACE FUNCTION public.reabrir_liquidacion(p_descarga_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_d public.descarga_ruta;
BEGIN
  IF NULLIF(btrim(COALESCE(p_motivo, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Escribe el motivo para reabrir la liquidación.' USING ERRCODE = '22023';
  END IF;
  v_d := public._liquidacion_para_accion(p_descarga_id);
  IF v_d.status::text NOT IN ('aprobada', 'rechazada') THEN
    RAISE EXCEPTION 'La liquidación ya está pendiente.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.liquidacion_rpc', '1', true);
  UPDATE public.descarga_ruta
     SET status            = 'pendiente',
         aprobado_por      = NULL,
         fecha_aprobacion  = NULL,
         esperado_desglose = NULL,
         congelado_at      = NULL,
         reabierta_por     = auth.uid(),
         reabierta_at      = now(),
         motivo_reapertura = btrim(p_motivo),
         veces_reabierta   = COALESCE(veces_reabierta, 0) + 1
   WHERE id = v_d.id;
  PERFORM set_config('app.liquidacion_rpc', '', true);

  -- El evento guarda lo que estaba congelado (si estaba aprobada).
  PERFORM public._liquidacion_evento(v_d, 'reabierta', p_motivo, v_d.esperado_desglose);
END;
$function$;

REVOKE ALL ON FUNCTION public.aprobar_liquidacion(uuid, text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.rechazar_liquidacion(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reabrir_liquidacion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aprobar_liquidacion(uuid, text, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rechazar_liquidacion(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reabrir_liquidacion(uuid, text) TO authenticated, service_role;
