-- Seguridad fase 1 (auditoría 2026-11-23, docs/auditoria/2026-11-23-auditoria-9de10.md §1.5 y §2 #1-2).
-- Solo agrega/endurece: helper nuevo, guardas al inicio de funciones existentes (mismas firmas
-- y tipos de retorno), REVOKE de funciones internas, RLS en una tabla de respaldo. No borra
-- datos, columnas, funciones ni políticas.
--
--  0. Precondición: cada función que se reescribe debe tener en la BD el cuerpo esperado
--     (md5 de prosrc = el de producción leído el 2026-11-23, o el ya parchado por esta
--     misma migración). Si alguien la cambió, la migración aborta sin tocar nada.
--  1. public.fn_assert_empresa(p_empresa_id): lanza 42501 «Sin acceso a esa empresa» si la
--     empresa no es la del usuario (get_my_empresa_id(), que ya respeta el override del super
--     admin) y el usuario no es super admin. Sin auth.uid() (service_role, cron, SQL directo)
--     no aplica; anon/authenticated sin sub nunca pasan.
--  2. (b)/(c)/(d) Guardas en funciones que llama el front: empresa del parámetro o del
--     registro, cliente/ventas/entrega/compra/almacén de la misma empresa y, con sesión,
--     auth.uid() en lugar de p_user_id.
--  3. (a) Funciones internas (solo triggers, otras SECURITY DEFINER, cron o edge functions con
--     service_role): REVOKE EXECUTE de PUBLIC, anon y authenticated; service_role conserva.
--  4. cliente_orden_ruta_dia_respaldo: RLS activado, sin políticas, sin permisos para
--     anon/authenticated (nadie la usa: 0 referencias en src, funciones ni migraciones).
--
-- Reversión: docs/sql/2026-11-23_verificar_seguridad_fase1.sql (sección REVERTIR) — re-crear las
-- funciones desde 20261119000001_base_public.sql (y 20261119000001 para cerrar_pedido_parcial),
-- GRANT EXECUTE ... TO authenticated en la lista (a), ALTER TABLE ... DISABLE ROW LEVEL SECURITY.

BEGIN;

-- ─── 0. Precondición: cuerpos esperados ───────────────────────────────────────────────
DO $pre$
DECLARE
  r record;
  v_md5 text;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,uuid,text,text,uuid)', '69e55111d52264c2bd60e8829281f15b', '40987b4d60307c1e79750aaa58339cb4'),
    ('public.registrar_saldo_inicial(uuid,uuid,numeric,date,text,uuid,date)', '6955b367e3a946dbfc84ff888553fb0d', '42e7bdab608611eb5e401e5edaaa80f0'),
    ('public.saldo_clientes_a_la_fecha(uuid,date)', 'bdf2ddfaca0ac443a48d0c823cd4fd7f', '7c47686e9fefd05b5a6a837cc42ec75d'),
    ('public.verify_admin_pin(uuid,text)', 'f77fda23cfe51b4011285a1558fdd28d', 'ff88d021dd607bee5656a9fce4f9d396'),
    ('public.has_admin_pin(uuid)', '75c70a9ba10376f4982344545b1df6d2', 'ff1b422bcef7309689fa9df402a097d4'),
    ('public.surtir_linea_entrega(uuid,uuid,uuid,numeric,uuid,uuid,uuid)', '79ca672d04af8a382375a4bf213363f4', '427b59dc6ee06f6e6f20cc4ed4c4ceef'),
    ('public.surtir_linea_entrega_parcial(uuid,uuid,uuid,numeric,uuid,uuid,uuid)', 'd5a1a58c2466a19ea286b64d3adc4342', 'afd9a5a6ad4579f6849e69e9aa7c281e'),
    ('public.surtir_linea_entrega_lotes(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)', '2d747790e3584c0853273be0f223715b', '2485fbcda298d585686d9e9c92d04616'),
    ('public.revertir_surtido_linea(uuid,uuid,uuid)', 'dfcf15f49a22bfac2b623335585ac794', '0d39d85841aa56c6e04524d0dc973e7c'),
    ('public.recibir_compra_linea_parcial(uuid,numeric,uuid,uuid,uuid,text,uuid,uuid)', '95cb10729d9cda781eff8ff8d2787a4b', '3b448cff788cd741c80aaaf597afabb7'),
    ('public.asignar_lote_masivo(uuid,uuid,text,date,date,numeric,jsonb,uuid)', 'b748282558c941ada7298edd02f7a52b', '1ce84222f1fef5bb8df0783669aad9bd'),
    ('public.cancelar_traspaso(uuid,uuid)', '124482186ec4b7435f5ebc4ba9bf946c', '1af5084240504b4795f4e5ee225ca51d'),
    ('public.reabrir_pedido_parcial(uuid)', 'b786b7b88ecf6572e24681de868f77ce', '79853ac2174d9b7d7113564fff72c6a2'),
    ('public.cerrar_pedido_parcial(uuid,uuid,text)', '0941d9cbb42e05892e054dc1e87ef8ce', 'cfee19b0716cfcafb46956a31dc38b99'),
    ('public.close_audit_line(uuid,boolean)', '60390896f5da04fecf718889b65d9e51', 'b8cd0cb18379c136f110daf3bba27523'),
    ('public.close_full_audit(uuid,text)', '67d7a4f407ab7eec67989e4d5ba69e9d', '99727381682aff829386e37a7016ba6d'),
    ('public.get_audit_users(uuid)', '05e1061083e36ffb9563f7f1c0eb8a0d', '0594ca1ea650bf0599ec41d763f58920'),
    ('public.validar_stock_cotizacion(uuid,uuid)', '0f7e3d50f9f09523bcfafbc6fd5dfc3f', '49889045daed90813fe03ca928914aa6'),
    ('public.stock_almacen_at_eod_v2(uuid,date)', '7837baaa094fd21181cd63c2705f267f', 'e9937d2a1928020559801f74e40291d5'),
    ('public.get_optimization_quota(uuid)', '39a242bfeb8598e97ac57eedaa9ad4e1', 'b3fcca463bed79a6e55707e02d7df3cf'),
    ('public.get_sandbox_usage(uuid)', 'b748b9fb0f26a5d10af8b95756981e44', '44c61cb4f43b04924485c9173d9eac7c'),
    ('public.next_folio(text,uuid)', 'e4fcd145c44dc0ec3e034f205540b216', '41f915f1f7b091c59156bc1e74a1a9be')
  ) AS t(sig, md5_prod, md5_parchado) LOOP
    SELECT md5(p.prosrc) INTO v_md5 FROM pg_proc p WHERE p.oid = to_regprocedure(r.sig);
    IF v_md5 IS NULL THEN
      RAISE EXCEPTION 'Seguridad fase 1: no existe %', r.sig;
    ELSIF v_md5 NOT IN (r.md5_prod, r.md5_parchado) THEN
      RAISE EXCEPTION 'Seguridad fase 1: % cambió desde la auditoría (md5 %); revisar antes de aplicar', r.sig, v_md5;
    END IF;
  END LOOP;
END
$pre$;

-- ─── 1. Helper ────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_assert_empresa(p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    -- Sin usuario: backend (service_role) o conexión directa (cron, migraciones) → permitido.
    IF auth.role() IN ('anon', 'authenticated') THEN
      RAISE EXCEPTION 'Sin acceso a esa empresa' USING ERRCODE = '42501';
    END IF;
    RETURN;
  END IF;

  IF p_empresa_id IS NULL
     OR (p_empresa_id IS DISTINCT FROM public.get_my_empresa_id()
         AND NOT public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Sin acceso a esa empresa' USING ERRCODE = '42501';
  END IF;
END
$fn$;

COMMENT ON FUNCTION public.fn_assert_empresa(uuid) IS
  'Seguridad fase 1: 42501 si p_empresa_id no es la empresa del usuario (get_my_empresa_id) y no es super admin. Sin auth.uid() (service_role/cron) no aplica.';

REVOKE ALL ON FUNCTION public.fn_assert_empresa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_assert_empresa(uuid) TO service_role;

-- ─── 2. Guardas en funciones llamadas por el front ──────────────────────────────────

-- [b+c+d] public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,uuid,text,text,uuid)
CREATE OR REPLACE FUNCTION public.aplicar_cobro(p_empresa_id uuid, p_cliente_id uuid, p_monto numeric, p_metodo text, p_referencia text, p_fecha date, p_aplicaciones jsonb, p_turno_id uuid, p_origen text, p_notas text DEFAULT NULL::text, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_cobro_id uuid;
  v_app jsonb;
  v_total_app numeric := 0;
  -- (c) Con sesión de usuario manda auth.uid(); p_user_id solo cuenta para service_role / backend.
  v_user_id uuid := COALESCE(auth.uid(), p_user_id);
  v_origen text := NULLIF(lower(btrim(p_origen)), '');
BEGIN
  -- (b) Seguridad fase 1: la empresa debe ser la del usuario (o super admin).
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF p_cliente_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  -- (d) Toda venta aplicada debe ser de la misma empresa.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb)) a
    WHERE COALESCE((a->>'monto_aplicado')::numeric, 0) > 0
      AND NOT EXISTS (SELECT 1 FROM public.ventas v
                      WHERE v.id = (a->>'venta_id')::uuid AND v.empresa_id = p_empresa_id)
  ) THEN
    RAISE EXCEPTION 'Una venta del cobro no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;

  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto del cobro debe ser mayor a 0';
  END IF;

  FOR v_app IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb))
  LOOP
    v_total_app := v_total_app + COALESCE((v_app->>'monto_aplicado')::numeric, 0);
  END LOOP;

  IF v_total_app > p_monto + 0.01 THEN
    RAISE EXCEPTION 'Suma de aplicaciones (%) excede monto del cobro (%)', v_total_app, p_monto;
  END IF;

  IF v_origen = 'pos' THEN
    IF p_turno_id IS NULL THEN
      RAISE EXCEPTION 'Un cobro POS requiere un turno activo';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.caja_turnos t
      WHERE t.id = p_turno_id
        AND t.empresa_id = p_empresa_id
        AND t.cajero_id = v_user_id
        AND t.status = 'abierto'
    ) THEN
      RAISE EXCEPTION 'El turno POS no está abierto o no corresponde a la empresa y cajero';
    END IF;
  ELSIF p_turno_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo los cobros con origen POS pueden asociarse a un turno';
  END IF;

  INSERT INTO public.cobros (
    empresa_id,
    cliente_id,
    user_id,
    monto,
    metodo_pago,
    referencia,
    fecha,
    notas,
    status,
    turno_id,
    origen
  ) VALUES (
    p_empresa_id,
    p_cliente_id,
    v_user_id,
    p_monto,
    p_metodo,
    p_referencia,
    p_fecha,
    p_notas,
    'activo',
    p_turno_id,
    v_origen
  )
  RETURNING id INTO v_cobro_id;

  FOR v_app IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb))
  LOOP
    IF COALESCE((v_app->>'monto_aplicado')::numeric, 0) > 0 THEN
      INSERT INTO public.cobro_aplicaciones (cobro_id, venta_id, monto_aplicado)
      VALUES (
        v_cobro_id,
        (v_app->>'venta_id')::uuid,
        (v_app->>'monto_aplicado')::numeric
      );
    END IF;
  END LOOP;

  RETURN v_cobro_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,uuid,text,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,uuid,text,text,uuid) TO authenticated, service_role;

-- [b+d] public.registrar_saldo_inicial(uuid,uuid,numeric,date,text,uuid,date)
CREATE OR REPLACE FUNCTION public.registrar_saldo_inicial(p_empresa_id uuid, p_cliente_id uuid, p_monto numeric, p_fecha date DEFAULT CURRENT_DATE, p_concepto text DEFAULT 'Saldo anterior'::text, p_user_id uuid DEFAULT NULL::uuid, p_fecha_vencimiento date DEFAULT NULL::date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta_id uuid;
  v_folio text;
BEGIN
  -- (b) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF p_cliente_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.clientes WHERE id = p_cliente_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'El cliente no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;

  SELECT 'SAL-' || public.folio_lpad((COALESCE(MAX(
    CASE WHEN folio ~ '^SAL-[0-9]+$'
      THEN CAST(SUBSTRING(folio FROM 5) AS BIGINT)
      ELSE 0
    END
  ), 0) + 1)::TEXT, 4, '0')
  INTO v_folio
  FROM public.ventas
  WHERE empresa_id = p_empresa_id;

  INSERT INTO public.ventas (
    empresa_id, cliente_id, total, saldo_pendiente,
    subtotal, iva_total, ieps_total,
    tipo, es_saldo_inicial, fecha, concepto,
    status, condicion_pago, folio, vendedor_id, fecha_vencimiento
  ) VALUES (
    p_empresa_id, p_cliente_id, p_monto, p_monto,
    p_monto, 0, 0,
    'saldo_inicial', true, p_fecha, p_concepto,
    'confirmado', 'credito', v_folio, NULL, p_fecha_vencimiento
  ) RETURNING id INTO v_venta_id;

  RETURN v_venta_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.registrar_saldo_inicial(uuid,uuid,numeric,date,text,uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_saldo_inicial(uuid,uuid,numeric,date,text,uuid,date) TO authenticated, service_role;

-- [b] public.saldo_clientes_a_la_fecha(uuid,date)
CREATE OR REPLACE FUNCTION public.saldo_clientes_a_la_fecha(p_empresa_id uuid, p_fecha date)
 RETURNS TABLE(cliente_id uuid, cliente text, cargos numeric, abonos numeric, saldo numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- (b) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  RETURN QUERY
WITH cargos AS (
    SELECT v.cliente_id, COALESCE(SUM(v.total),0) AS monto
    FROM public.ventas v
    WHERE v.empresa_id = p_empresa_id AND v.fecha <= p_fecha
      AND v.status::text <> 'cancelado' AND v.cliente_id IS NOT NULL
    GROUP BY v.cliente_id
  ),
  abonos AS (
    SELECT c.cliente_id, COALESCE(SUM(c.monto),0) AS monto
    FROM public.cobros c
    WHERE c.empresa_id = p_empresa_id AND c.fecha <= p_fecha
      AND COALESCE(c.status,'activo') <> 'cancelado' AND c.cliente_id IS NOT NULL
    GROUP BY c.cliente_id
  ),
  ids AS (SELECT cliente_id FROM cargos UNION SELECT cliente_id FROM abonos)
  SELECT i.cliente_id, cl.nombre, COALESCE(ca.monto,0), COALESCE(ab.monto,0),
         COALESCE(ca.monto,0) - COALESCE(ab.monto,0)
  FROM ids i
  JOIN public.clientes cl ON cl.id = i.cliente_id
  LEFT JOIN cargos ca ON ca.cliente_id = i.cliente_id
  LEFT JOIN abonos ab ON ab.cliente_id = i.cliente_id
  WHERE cl.empresa_id = p_empresa_id
  ORDER BY (COALESCE(ca.monto,0) - COALESCE(ab.monto,0)) DESC, cl.nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.saldo_clientes_a_la_fecha(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldo_clientes_a_la_fecha(uuid,date) TO authenticated, service_role;

-- [c] public.verify_admin_pin(uuid,text)
CREATE OR REPLACE FUNCTION public.verify_admin_pin(p_user_id uuid, p_pin text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- (c) Seguridad fase 1: con sesión solo se consulta el PIN propio; sin sesión solo backend.
  IF auth.uid() IS NOT NULL THEN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Solo puedes verificar tu propio PIN' USING ERRCODE = '42501';
    END IF;
  ELSIF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  RETURN (
SELECT EXISTS (
    SELECT 1 FROM profiles 
    WHERE user_id = p_user_id 
    AND pin_code = p_pin
    AND pin_code IS NOT NULL
  )
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.verify_admin_pin(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.verify_admin_pin(uuid,text) TO authenticated, service_role;

-- [c] public.has_admin_pin(uuid)
CREATE OR REPLACE FUNCTION public.has_admin_pin(p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- (c) Seguridad fase 1: con sesión solo se consulta el PIN propio; sin sesión solo backend.
  IF auth.uid() IS NOT NULL THEN
    IF p_user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Solo puedes verificar tu propio PIN' USING ERRCODE = '42501';
    END IF;
  ELSIF auth.role() IN ('anon', 'authenticated') THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  RETURN (
SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE user_id = p_user_id
      AND pin_code IS NOT NULL
      AND length(btrim(pin_code)) > 0
  )
  );
END;
$function$;
REVOKE ALL ON FUNCTION public.has_admin_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_admin_pin(uuid) TO authenticated, service_role;

-- [b+c+d] public.surtir_linea_entrega(uuid,uuid,uuid,numeric,uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.surtir_linea_entrega(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_cantidad_surtida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_new_qty numeric;
  v_already boolean;
BEGIN
  -- (b)+(d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF NOT EXISTS (SELECT 1 FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id WHERE el.id = p_linea_id AND e.id = p_entrega_id AND e.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'La entrega no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_origen_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = p_producto_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El producto no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  p_user_id := COALESCE(auth.uid(), p_user_id);  -- (c) con sesión manda auth.uid(); p_user_id solo backend

  -- IDEMPOTENCIA: bloquear la línea y salir si ya fue surtida.
  SELECT hecho INTO v_already
  FROM entrega_lineas
  WHERE id = p_linea_id
  FOR UPDATE;

  IF COALESCE(v_already, false) THEN
    RETURN; -- ya surtida: no-op
  END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  v_new_qty := COALESCE(v_sa_qty, 0) - p_cantidad_surtida;

  IF NOT COALESCE(v_vender_sin_stock, false) THEN
    IF v_sa_id IS NULL OR v_new_qty < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %, solicitado: %', COALESCE(v_sa_qty, 0), p_cantidad_surtida;
    END IF;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
  END IF;

  UPDATE entrega_lineas SET cantidad_entregada = p_cantidad_surtida, almacen_origen_id = p_almacen_origen_id, hecho = true WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, p_cantidad_surtida, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');
END;
$function$;
REVOKE ALL ON FUNCTION public.surtir_linea_entrega(uuid,uuid,uuid,numeric,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surtir_linea_entrega(uuid,uuid,uuid,numeric,uuid,uuid,uuid) TO authenticated, service_role;

-- [b+c+d] public.surtir_linea_entrega_parcial(uuid,uuid,uuid,numeric,uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.surtir_linea_entrega_parcial(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_cantidad_pedida numeric, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_vender_sin_stock boolean;
  v_today date := current_date;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_disponible numeric;
  v_surtir numeric;
  v_already boolean;
BEGIN
  -- (b)+(d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF NOT EXISTS (SELECT 1 FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id WHERE el.id = p_linea_id AND e.id = p_entrega_id AND e.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'La entrega no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_origen_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = p_producto_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El producto no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  p_user_id := COALESCE(auth.uid(), p_user_id);  -- (c) con sesión manda auth.uid(); p_user_id solo backend

  -- IDEMPOTENCIA: bloquear la línea y salir si ya fue surtida.
  SELECT hecho INTO v_already
  FROM entrega_lineas
  WHERE id = p_linea_id
  FOR UPDATE;

  IF COALESCE(v_already, false) THEN
    RETURN 0; -- ya surtida: no-op
  END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado'; END IF;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  v_disponible := COALESCE(v_sa_qty, 0);

  IF COALESCE(v_vender_sin_stock, false) THEN
    -- Puede ir a negativo: surtir lo pedido completo.
    v_surtir := p_cantidad_pedida;
  ELSE
    -- Clamp al disponible: surtir el máximo que alcance.
    v_surtir := LEAST(p_cantidad_pedida, v_disponible);
  END IF;

  -- Nada que surtir (0 disponible o pedido 0) → dejar la línea PENDIENTE.
  IF v_surtir <= 0 THEN
    RETURN 0;
  END IF;

  IF v_sa_id IS NOT NULL THEN
    UPDATE stock_almacen SET cantidad = v_disponible - v_surtir, updated_at = now() WHERE id = v_sa_id;
  END IF;

  UPDATE entrega_lineas
  SET cantidad_entregada = v_surtir, almacen_origen_id = p_almacen_origen_id, hecho = true
  WHERE id = p_linea_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (p_empresa_id, 'salida', p_producto_id, v_surtir, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega');

  RETURN v_surtir;
END;
$function$;
REVOKE ALL ON FUNCTION public.surtir_linea_entrega_parcial(uuid,uuid,uuid,numeric,uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surtir_linea_entrega_parcial(uuid,uuid,uuid,numeric,uuid,uuid,uuid) TO authenticated, service_role;

-- [b+c+d] public.surtir_linea_entrega_lotes(uuid,uuid,uuid,uuid,uuid,uuid,jsonb)
CREATE OR REPLACE FUNCTION public.surtir_linea_entrega_lotes(p_linea_id uuid, p_producto_id uuid, p_almacen_origen_id uuid, p_entrega_id uuid, p_empresa_id uuid, p_user_id uuid, p_asignacion jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total numeric := 0;
  v_item jsonb;
  v_lote uuid;
  v_cant numeric;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_vender_sin_stock boolean;
  v_today date := current_date;
BEGIN
  -- (b)+(d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF NOT EXISTS (SELECT 1 FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id WHERE el.id = p_linea_id AND e.id = p_entrega_id AND e.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'La entrega no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = p_almacen_origen_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.productos WHERE id = p_producto_id AND empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'El producto no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  p_user_id := COALESCE(auth.uid(), p_user_id);  -- (c) con sesión manda auth.uid(); p_user_id solo backend

  SELECT COALESCE(SUM((x->>'cantidad')::numeric), 0) INTO v_total
  FROM jsonb_array_elements(COALESCE(p_asignacion, '[]'::jsonb)) x;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Asignación de lotes vacía'; END IF;

  SELECT vender_sin_stock INTO v_vender_sin_stock FROM productos WHERE id = p_producto_id;

  SELECT id, cantidad INTO v_sa_id, v_sa_qty
  FROM stock_almacen WHERE almacen_id = p_almacen_origen_id AND producto_id = p_producto_id FOR UPDATE;

  IF v_sa_id IS NULL THEN
    IF NOT COALESCE(v_vender_sin_stock, false) THEN
      RAISE EXCEPTION 'Sin stock en el almacén origen';
    END IF;
    INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    VALUES (p_empresa_id, p_almacen_origen_id, p_producto_id, -v_total);
  ELSE
    IF NOT COALESCE(v_vender_sin_stock, false) AND COALESCE(v_sa_qty,0) - v_total < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente en almacén. Disponible: %, solicitado: %', COALESCE(v_sa_qty,0), v_total;
    END IF;
    UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) - v_total, updated_at = now() WHERE id = v_sa_id;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_asignacion, '[]'::jsonb))
  LOOP
    v_lote := (v_item->>'lote_id')::uuid;
    v_cant := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_lote IS NULL OR v_cant <= 0 THEN CONTINUE; END IF;
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = v_lote AND producto_id = p_producto_id) THEN
      RAISE EXCEPTION 'Un lote no corresponde al producto';
    END IF;
    INSERT INTO movimientos_inventario
      (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
    VALUES
      (p_empresa_id, 'salida', p_producto_id, v_cant, p_almacen_origen_id, 'entrega', p_entrega_id, p_user_id, v_today, 'Surtido de entrega (lote)', v_lote);
  END LOOP;

  UPDATE entrega_lineas
  SET cantidad_entregada = v_total, almacen_origen_id = p_almacen_origen_id, hecho = true
  WHERE id = p_linea_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.surtir_linea_entrega_lotes(uuid,uuid,uuid,uuid,uuid,uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.surtir_linea_entrega_lotes(uuid,uuid,uuid,uuid,uuid,uuid,jsonb) TO authenticated, service_role;

-- [b+d] public.revertir_surtido_linea(uuid,uuid,uuid)
CREATE OR REPLACE FUNCTION public.revertir_surtido_linea(p_linea_id uuid, p_entrega_id uuid, p_empresa_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_producto uuid;
  v_hecho boolean;
  v_mov record;
  v_upd int;
BEGIN
  -- (b)+(d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF NOT EXISTS (SELECT 1 FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id WHERE el.id = p_linea_id AND e.id = p_entrega_id AND e.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'La entrega no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;

  SELECT producto_id, hecho INTO v_producto, v_hecho
  FROM entrega_lineas WHERE id = p_linea_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Línea no encontrada'; END IF;

  FOR v_mov IN
    SELECT id, cantidad, lote_id, almacen_origen_id
    FROM movimientos_inventario
    WHERE empresa_id = p_empresa_id
      AND referencia_tipo = 'entrega'
      AND referencia_id = p_entrega_id
      AND producto_id = v_producto
      AND tipo = 'salida'
    FOR UPDATE
  LOOP
    IF v_mov.almacen_origen_id IS NOT NULL THEN
      UPDATE stock_almacen
      SET cantidad = cantidad + v_mov.cantidad, updated_at = now()
      WHERE almacen_id = v_mov.almacen_origen_id AND producto_id = v_producto;
      GET DIAGNOSTICS v_upd = ROW_COUNT;
      IF v_upd = 0 THEN
        INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
        VALUES (p_empresa_id, v_mov.almacen_origen_id, v_producto, v_mov.cantidad);
      END IF;
    END IF;

    IF v_mov.lote_id IS NOT NULL AND v_mov.almacen_origen_id IS NOT NULL THEN
      PERFORM public._aplica_stock_lote(p_empresa_id, v_mov.almacen_origen_id, v_producto, v_mov.lote_id, v_mov.cantidad);
    END IF;

    DELETE FROM movimientos_inventario WHERE id = v_mov.id;
  END LOOP;

  UPDATE entrega_lineas
  SET hecho = false, cantidad_entregada = 0
  WHERE id = p_linea_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.revertir_surtido_linea(uuid,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revertir_surtido_linea(uuid,uuid,uuid) TO authenticated, service_role;

-- [b+c+d] public.recibir_compra_linea_parcial(uuid,numeric,uuid,uuid,uuid,text,uuid,uuid)
CREATE OR REPLACE FUNCTION public.recibir_compra_linea_parcial(p_linea_id uuid, p_piezas numeric, p_almacen_id uuid, p_empresa_id uuid, p_compra_id uuid, p_folio text, p_user_id uuid, p_lote_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_producto_id uuid; v_cantidad numeric; v_factor numeric; v_recibido numeric;
  v_total_piezas numeric; v_pendiente numeric; v_a_recibir numeric;
  v_sa_id uuid; v_sa_qty numeric; v_today date := current_date;
  v_pendiente_compra numeric; v_sl_id uuid; v_sl_qty numeric;
BEGIN
  -- (b)+(d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF NOT EXISTS (SELECT 1 FROM public.compra_lineas cl JOIN public.compras c ON c.id = cl.compra_id WHERE cl.id = p_linea_id AND c.id = p_compra_id AND c.empresa_id = p_empresa_id) THEN
    RAISE EXCEPTION 'La compra no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF p_almacen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacenes WHERE id = p_almacen_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  p_user_id := COALESCE(auth.uid(), p_user_id);  -- (c) con sesión manda auth.uid(); p_user_id solo backend

  SELECT producto_id, cantidad, COALESCE(NULLIF(factor_conversion,0), 1), cantidad_recibida
    INTO v_producto_id, v_cantidad, v_factor, v_recibido
  FROM compra_lineas WHERE id = p_linea_id FOR UPDATE;

  IF v_producto_id IS NULL THEN RAISE EXCEPTION 'Línea de compra no encontrada'; END IF;

  v_total_piezas := v_cantidad * v_factor;
  v_pendiente := GREATEST(0, v_total_piezas - v_recibido);
  IF v_pendiente <= 0 THEN RETURN; END IF;

  v_a_recibir := LEAST(COALESCE(p_piezas, v_pendiente), v_pendiente);
  IF v_a_recibir <= 0 THEN RETURN; END IF;

  IF p_lote_id IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM lotes WHERE id = p_lote_id AND producto_id = v_producto_id) THEN
      RAISE EXCEPTION 'El lote no corresponde al producto de la línea';
    END IF;
  END IF;

  IF p_almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = p_almacen_id AND producto_id = v_producto_id FOR UPDATE;
    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sa_id;
    ELSE
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (p_empresa_id, p_almacen_id, v_producto_id, v_a_recibir);
    END IF;

    IF p_lote_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_sl_id, v_sl_qty
      FROM stock_lotes WHERE almacen_id = p_almacen_id AND lote_id = p_lote_id FOR UPDATE;
      IF v_sl_id IS NOT NULL THEN
        UPDATE stock_lotes SET cantidad = COALESCE(v_sl_qty,0) + v_a_recibir, updated_at = now() WHERE id = v_sl_id;
      ELSE
        INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
        VALUES (p_empresa_id, p_almacen_id, v_producto_id, p_lote_id, v_a_recibir);
      END IF;
    END IF;
  END IF;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
  VALUES (p_empresa_id, 'entrada', v_producto_id, v_a_recibir, p_almacen_id, 'compra', p_compra_id, p_user_id, v_today,
          concat('Compra ', COALESCE(p_folio, p_compra_id::text), ' recepción parcial'), p_lote_id);

  UPDATE compra_lineas SET cantidad_recibida = v_recibido + v_a_recibir WHERE id = p_linea_id;

  SELECT COALESCE(SUM(GREATEST(0, cantidad * COALESCE(NULLIF(factor_conversion,0),1) - cantidad_recibida)), 0)
    INTO v_pendiente_compra
  FROM compra_lineas WHERE compra_id = p_compra_id;

  IF v_pendiente_compra = 0 THEN
    UPDATE compras SET status = 'recibida'
     WHERE id = p_compra_id AND status NOT IN ('recibida','pagada','cancelada');
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.recibir_compra_linea_parcial(uuid,numeric,uuid,uuid,uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recibir_compra_linea_parcial(uuid,numeric,uuid,uuid,uuid,text,uuid,uuid) TO authenticated, service_role;

-- [b+d] public.asignar_lote_masivo(uuid,uuid,text,date,date,numeric,jsonb,uuid)
CREATE OR REPLACE FUNCTION public.asignar_lote_masivo(p_empresa_id uuid, p_almacen_id uuid, p_codigo text, p_caducidad date, p_fabricacion date, p_costo numeric, p_items jsonb, p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_item jsonb; v_producto uuid; v_cant numeric; v_lote uuid; v_count int := 0;
BEGIN
  -- (b)+(d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  IF p_almacen_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.almacenes WHERE id = p_almacen_id AND empresa_id = p_empresa_id
  ) THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;

  IF p_almacen_id IS NULL THEN RAISE EXCEPTION 'Falta el almacén'; END IF;
  IF p_codigo IS NULL OR btrim(p_codigo) = '' THEN RAISE EXCEPTION 'El código de lote es obligatorio'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb))
  LOOP
    v_producto := (v_item->>'producto_id')::uuid;
    v_cant := COALESCE((v_item->>'cantidad')::numeric, 0);
    IF v_producto IS NULL THEN CONTINUE; END IF;
    UPDATE productos SET maneja_lote = true WHERE id = v_producto AND empresa_id = p_empresa_id;
    SELECT id INTO v_lote FROM lotes
     WHERE empresa_id = p_empresa_id AND producto_id = v_producto AND codigo = btrim(p_codigo)
       AND COALESCE(fecha_caducidad,'9999-12-31'::date) = COALESCE(p_caducidad,'9999-12-31'::date);
    IF v_lote IS NULL THEN
      INSERT INTO lotes (empresa_id, producto_id, codigo, fecha_caducidad, fecha_fabricacion, costo)
      VALUES (p_empresa_id, v_producto, btrim(p_codigo), p_caducidad, p_fabricacion, p_costo) RETURNING id INTO v_lote;
    ELSE
      UPDATE lotes SET fecha_fabricacion = COALESCE(p_fabricacion, fecha_fabricacion), costo = COALESCE(p_costo, costo) WHERE id = v_lote;
    END IF;
    INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
    VALUES (p_empresa_id, p_almacen_id, v_producto, v_lote, v_cant)
    ON CONFLICT (almacen_id, lote_id) DO UPDATE SET cantidad = EXCLUDED.cantidad, updated_at = now();
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END; $function$;
REVOKE ALL ON FUNCTION public.asignar_lote_masivo(uuid,uuid,text,date,date,numeric,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asignar_lote_masivo(uuid,uuid,text,date,date,numeric,jsonb,uuid) TO authenticated, service_role;

-- [c+d] public.cancelar_traspaso(uuid,uuid)
CREATE OR REPLACE FUNCTION public.cancelar_traspaso(p_traspaso_id uuid, p_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_traspaso traspasos%ROWTYPE;
  v_linea RECORD;
  v_today date := CURRENT_DATE;
  v_sa_id uuid;
  v_sa_qty numeric;
  v_new_qty numeric;
  v_prod_name text;
  v_allow_negative boolean;
  v_vendedor_almacen_id uuid;
BEGIN
  SELECT * INTO v_traspaso FROM traspasos WHERE id = p_traspaso_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  -- (d)+(c) Seguridad fase 1
  PERFORM public.fn_assert_empresa(v_traspaso.empresa_id);
  p_user_id := COALESCE(auth.uid(), p_user_id);  -- (c) con sesión manda auth.uid(); p_user_id solo backend
  IF v_traspaso.status = 'cancelado' THEN RAISE EXCEPTION 'Este traspaso ya está cancelado'; END IF;

  IF v_traspaso.status = 'confirmado' THEN
    FOR v_linea IN SELECT * FROM traspaso_lineas WHERE traspaso_id = p_traspaso_id LOOP
      SELECT nombre, vender_sin_stock INTO v_prod_name, v_allow_negative FROM productos WHERE id = v_linea.producto_id;

      -- === RETURN TO ORIGIN ===
      IF v_traspaso.almacen_origen_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_origen_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
        ELSE
          INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_traspaso.almacen_origen_id, v_linea.producto_id, v_linea.cantidad);
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_origen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_origen_id;
        IF v_vendedor_almacen_id IS NOT NULL THEN
          SELECT id, cantidad INTO v_sa_id, v_sa_qty
          FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

          IF v_sa_id IS NOT NULL THEN
            UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_sa_id;
          ELSE
            INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad) VALUES (v_traspaso.empresa_id, v_vendedor_almacen_id, v_linea.producto_id, v_linea.cantidad);
          END IF;

          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (devuelto a ruta)');
        END IF;
      END IF;

      -- === DEDUCT FROM DESTINATION ===
      IF v_traspaso.almacen_destino_id IS NOT NULL THEN
        SELECT id, cantidad INTO v_sa_id, v_sa_qty
        FROM stock_almacen WHERE almacen_id = v_traspaso.almacen_destino_id AND producto_id = v_linea.producto_id FOR UPDATE;

        IF v_sa_id IS NOT NULL THEN
          v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
          IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
            RAISE EXCEPTION 'Stock insuficiente en destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
          END IF;
          UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
        END IF;

        INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_traspaso.almacen_destino_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, ''));
      END IF;

      IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
        SELECT almacen_id INTO v_vendedor_almacen_id FROM profiles WHERE id = v_traspaso.vendedor_destino_id;
        IF v_vendedor_almacen_id IS NOT NULL THEN
          SELECT id, cantidad INTO v_sa_id, v_sa_qty
          FROM stock_almacen WHERE almacen_id = v_vendedor_almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;

          IF v_sa_id IS NOT NULL THEN
            v_new_qty := COALESCE(v_sa_qty, 0) - v_linea.cantidad;
            IF NOT COALESCE(v_allow_negative, false) AND v_new_qty < 0 THEN
              RAISE EXCEPTION 'Stock insuficiente en ruta destino para cancelar "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_sa_qty, 0), v_linea.cantidad;
            END IF;
            UPDATE stock_almacen SET cantidad = v_new_qty, updated_at = now() WHERE id = v_sa_id;
          END IF;

          INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
          VALUES (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad, v_vendedor_almacen_id, 'traspaso', p_traspaso_id, p_user_id, v_today, 'Cancelación traspaso ' || COALESCE(v_traspaso.folio, '') || ' (retirado de ruta)');
        END IF;
      END IF;

    END LOOP;
  END IF;

  UPDATE traspasos SET status = 'cancelado' WHERE id = p_traspaso_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.cancelar_traspaso(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_traspaso(uuid,uuid) TO authenticated, service_role;

-- [d] public.reabrir_pedido_parcial(uuid)
CREATE OR REPLACE FUNCTION public.reabrir_pedido_parcial(p_venta_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa((SELECT v.empresa_id FROM public.ventas v WHERE v.id = p_venta_id));

  UPDATE public.ventas
  SET cerrado_at = NULL, cerrado_por = NULL, total_efectivo = NULL, cerrado_snapshot = NULL
  WHERE id = p_venta_id AND cerrado_at IS NOT NULL;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
END;
$function$;
REVOKE ALL ON FUNCTION public.reabrir_pedido_parcial(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reabrir_pedido_parcial(uuid) TO authenticated, service_role;

-- [c+d] public.cerrar_pedido_parcial(uuid,uuid,text)
CREATE OR REPLACE FUNCTION public.cerrar_pedido_parcial(p_venta_id uuid, p_user_id uuid DEFAULT NULL::uuid, p_excedente text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta      public.ventas%ROWTYPE;
  v_orig_base  numeric;
  v_deliv_base numeric;
  v_cobrable   numeric;
  v_cobros     numeric;
  v_saldo      numeric;
  v_snapshot   jsonb;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido no encontrado'; END IF;
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(v_venta.empresa_id);

  IF v_venta.tipo::text <> 'pedido' THEN
    RAISE EXCEPTION 'Solo se pueden cerrar pedidos'; END IF;
  IF v_venta.politica_cobro IS DISTINCT FROM 'entregado' THEN
    RAISE EXCEPTION 'Solo aplica a pedidos con política de cobro por entregado'; END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido ya está cerrado'; END IF;
  IF v_venta.status::text IN ('cancelado','facturado') THEN
    RAISE EXCEPTION 'No se puede cerrar un pedido cancelado o facturado'; END IF;
  IF COALESCE(v_venta.es_saldo_inicial,false) THEN
    RAISE EXCEPTION 'No aplica a saldos iniciales'; END IF;

  SELECT COALESCE(SUM(base), 0), COALESCE(SUM(base * ratio), 0)
    INTO v_orig_base, v_deliv_base
  FROM (
    SELECT
      (COALESCE(vl.subtotal,0) + COALESCE(vl.iva_monto,0) + COALESCE(vl.ieps_monto,0)) AS base,
      CASE WHEN vl.cantidad > 0
           THEN LEAST(COALESCE(ent.entregado, 0), vl.cantidad) / vl.cantidad
           ELSE 0 END AS ratio
    FROM public.venta_lineas vl
    LEFT JOIN LATERAL (
      SELECT COALESCE(SUM(el.cantidad_entregada), 0) AS entregado
      FROM public.entrega_lineas el
      JOIN public.entregas e ON e.id = el.entrega_id
      WHERE e.pedido_id = p_venta_id
        AND e.status::text NOT IN ('cancelado','no_entregado')
        AND el.producto_id = vl.producto_id
    ) ent ON true
    WHERE vl.venta_id = p_venta_id
  ) q;

  IF COALESCE(v_deliv_base, 0) <= 0 THEN
    RAISE EXCEPTION 'No hay nada entregado: cancela el pedido en vez de cerrarlo';
  END IF;

  v_cobrable := CASE WHEN COALESCE(v_orig_base,0) > 0
                     THEN ROUND(COALESCE(v_venta.total,0) * (v_deliv_base / v_orig_base), 2)
                     ELSE 0 END;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_cobros
  FROM public.cobro_aplicaciones ca
  JOIN public.cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';

  v_saldo := GREATEST(0, v_cobrable - v_cobros);

  v_snapshot := jsonb_build_object(
    'pedido_total',    COALESCE(v_venta.total,0),
    'total_efectivo',  v_cobrable,
    'cobros',          v_cobros,
    'saldo',           v_saldo,
    'base_original',   v_orig_base,
    'base_entregada',  v_deliv_base,
    'lineas', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'linea_id',    vl.id,
               'producto_id', vl.producto_id,
               'pedido',      vl.cantidad,
               'entregado',   COALESCE((
                  SELECT SUM(el.cantidad_entregada)
                  FROM public.entrega_lineas el JOIN public.entregas e ON e.id = el.entrega_id
                  WHERE e.pedido_id = p_venta_id
                    AND e.status::text NOT IN ('cancelado','no_entregado')
                    AND el.producto_id = vl.producto_id), 0),
               'subtotal_orig', vl.subtotal,
               'iva_orig',      vl.iva_monto,
               'ieps_orig',     vl.ieps_monto,
               'total_orig',    vl.total
             )), '[]'::jsonb)
      FROM public.venta_lineas vl WHERE vl.venta_id = p_venta_id
    )
  );

  -- UPDATE sin LATERAL: el ratio se calcula inline usando vl (target) y ent (FROM).
  UPDATE public.venta_lineas vl
  SET
    cantidad   = LEAST(COALESCE(ent.entregado, 0), vl.cantidad),
    subtotal   = ROUND(COALESCE(vl.subtotal,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    iva_monto  = ROUND(COALESCE(vl.iva_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    ieps_monto = ROUND(COALESCE(vl.ieps_monto,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2),
    total      = ROUND(COALESCE(vl.total,0)
                       * CASE WHEN vl.cantidad > 0
                              THEN LEAST(COALESCE(ent.entregado,0), vl.cantidad) / vl.cantidad
                              ELSE 0 END, 2)
  FROM (
    SELECT vl2.id AS linea_id,
           COALESCE((SELECT SUM(el.cantidad_entregada)
                       FROM public.entrega_lineas el
                       JOIN public.entregas e ON e.id = el.entrega_id
                      WHERE e.pedido_id = p_venta_id
                        AND e.status::text NOT IN ('cancelado','no_entregado')
                        AND el.producto_id = vl2.producto_id), 0) AS entregado
    FROM public.venta_lineas vl2
    WHERE vl2.venta_id = p_venta_id
  ) ent
  WHERE vl.id = ent.linea_id AND vl.venta_id = p_venta_id;

  UPDATE public.ventas
  SET cerrado_at       = now(),
      cerrado_por      = COALESCE(auth.uid(), p_user_id),
      total_efectivo   = v_cobrable,
      cerrado_snapshot = v_snapshot
  WHERE id = p_venta_id;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
  PERFORM public._resolver_excedente_venta(p_venta_id, p_excedente, auth.uid());
END;
$function$;
REVOKE ALL ON FUNCTION public.cerrar_pedido_parcial(uuid,uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cerrar_pedido_parcial(uuid,uuid,text) TO authenticated, service_role;

-- [d] public.close_audit_line(uuid,boolean)
CREATE OR REPLACE FUNCTION public.close_audit_line(p_linea_id uuid, p_cerrada boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_auditoria_id uuid;
  v_producto_id uuid;
  v_cantidad_esperada numeric;
  v_total_scans numeric;
BEGIN
  SELECT auditoria_id, producto_id, cantidad_esperada
  INTO v_auditoria_id, v_producto_id, v_cantidad_esperada
  FROM auditoria_lineas WHERE id = p_linea_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Line not found'; END IF;
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa((SELECT a.empresa_id FROM public.auditorias a WHERE a.id = v_auditoria_id));

  -- Sum scans
  SELECT COALESCE(SUM(cantidad), 0) INTO v_total_scans
  FROM auditoria_escaneos WHERE linea_id = p_linea_id;

  IF p_cerrada THEN
    -- Try to recalculate expected via teorico engine
    BEGIN
      PERFORM calc_audit_stock_teorico(v_auditoria_id);
    EXCEPTION WHEN OTHERS THEN
      NULL; -- ignore if function doesn't exist
    END;

    -- Re-read cantidad_esperada after recalc
    SELECT cantidad_esperada INTO v_cantidad_esperada
    FROM auditoria_lineas WHERE id = p_linea_id;

    UPDATE auditoria_lineas SET
      cerrada = true,
      cerrada_at = now(),
      cantidad_real = v_total_scans,
      diferencia = v_total_scans - v_cantidad_esperada
    WHERE id = p_linea_id;
  ELSE
    UPDATE auditoria_lineas SET
      cerrada = false,
      cerrada_at = NULL
    WHERE id = p_linea_id;
  END IF;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_audit_line(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_audit_line(uuid,boolean) TO authenticated, service_role;

-- [d] public.close_full_audit(uuid,text)
CREATE OR REPLACE FUNCTION public.close_full_audit(p_auditoria_id uuid, p_cerrada_por text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_linea RECORD;
  v_teorico numeric;
BEGIN
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa((SELECT a.empresa_id FROM public.auditorias a WHERE a.id = p_auditoria_id));

  -- Recalculate theoretical stock for all unclosed lines
  FOR v_linea IN 
    SELECT id, COALESCE(cantidad_real, 0) as contado 
    FROM auditoria_lineas 
    WHERE auditoria_id = p_auditoria_id AND cerrada = false
  LOOP
    v_teorico := calc_audit_stock_teorico(v_linea.id);
    UPDATE auditoria_lineas 
    SET cerrada = true,
        cantidad_esperada = v_teorico,
        diferencia = v_linea.contado - v_teorico
    WHERE id = v_linea.id;
  END LOOP;
  
  -- Close the audit
  UPDATE auditorias SET status = 'cerrada', cerrada_por = p_cerrada_por, cerrada_at = now() WHERE id = p_auditoria_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_full_audit(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_full_audit(uuid,text) TO authenticated, service_role;

-- [d] public.get_audit_users(uuid)
CREATE OR REPLACE FUNCTION public.get_audit_users(p_auditoria_id uuid)
 RETURNS TABLE(user_id uuid, nombre text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa((SELECT a.empresa_id FROM public.auditorias a WHERE a.id = p_auditoria_id));
  RETURN QUERY
SELECT p.user_id, p.nombre
  FROM profiles p
  WHERE p.empresa_id = (
    SELECT a.empresa_id FROM auditorias a WHERE a.id = p_auditoria_id LIMIT 1
  )
  AND p.estado = 'activo'
  ORDER BY p.nombre;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_audit_users(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_audit_users(uuid) TO authenticated, service_role;

-- [d] public.validar_stock_cotizacion(uuid,uuid)
CREATE OR REPLACE FUNCTION public.validar_stock_cotizacion(p_cotizacion_id uuid, p_almacen_id uuid)
 RETURNS TABLE(producto_id uuid, descripcion text, cantidad_solicitada numeric, stock_disponible numeric, faltante numeric, ok boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa((SELECT c.empresa_id FROM public.cotizaciones c WHERE c.id = p_cotizacion_id));
  IF p_almacen_id IS NOT NULL THEN
    PERFORM public.fn_assert_empresa((SELECT a.empresa_id FROM public.almacenes a WHERE a.id = p_almacen_id));
  END IF;
  RETURN QUERY
SELECT
    cl.producto_id,
    COALESCE(cl.descripcion, p.nombre) AS descripcion,
    cl.cantidad AS cantidad_solicitada,
    COALESCE(sa.cantidad, 0) AS stock_disponible,
    GREATEST(cl.cantidad - COALESCE(sa.cantidad, 0), 0) AS faltante,
    (COALESCE(sa.cantidad, 0) >= cl.cantidad OR COALESCE(p.vender_sin_stock, false)) AS ok
  FROM public.cotizacion_lineas cl
  LEFT JOIN public.productos p ON p.id = cl.producto_id
  LEFT JOIN public.stock_almacen sa ON sa.producto_id = cl.producto_id AND sa.almacen_id = p_almacen_id
  WHERE cl.cotizacion_id = p_cotizacion_id AND cl.producto_id IS NOT NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.validar_stock_cotizacion(uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validar_stock_cotizacion(uuid,uuid) TO authenticated, service_role;

-- [d] public.stock_almacen_at_eod_v2(uuid,date)
CREATE OR REPLACE FUNCTION public.stock_almacen_at_eod_v2(p_almacen_id uuid, p_fecha date)
 RETURNS TABLE(producto_id uuid, cantidad numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_tz text;
  v_cutoff timestamptz;
BEGIN
  SELECT a.empresa_id, COALESCE(e.zona_horaria, 'America/Mexico_City')
    INTO v_empresa_id, v_tz
  FROM public.almacenes a
  LEFT JOIN public.empresas e ON e.id = a.empresa_id
  WHERE a.id = p_almacen_id;

  IF v_empresa_id IS NULL THEN
    RETURN;
  END IF;
  -- (d) Seguridad fase 1
  PERFORM public.fn_assert_empresa(v_empresa_id);

  v_cutoff := ((p_fecha + 1)::timestamp AT TIME ZONE v_tz);

  RETURN QUERY
  WITH live AS (
    SELECT s.producto_id, COALESCE(s.cantidad, 0)::numeric AS cantidad
    FROM public.stock_almacen s
    WHERE s.almacen_id = p_almacen_id
  ),
  posteriores AS (
    SELECT
      m.producto_id,
      SUM(
        CASE
          -- Entradas al almacén (sumaron stock → revertir restando)
          WHEN m.tipo = 'entrada' AND m.almacen_destino_id = p_almacen_id
            THEN COALESCE(m.cantidad,0)
          WHEN m.tipo = 'transferencia' AND m.almacen_destino_id = p_almacen_id
            THEN COALESCE(m.cantidad,0)
          -- Salidas del almacén (restaron stock → revertir sumando)
          WHEN m.tipo = 'salida' AND m.almacen_origen_id = p_almacen_id
            THEN -COALESCE(m.cantidad,0)
          WHEN m.tipo = 'transferencia' AND m.almacen_origen_id = p_almacen_id
            THEN -COALESCE(m.cantidad,0)
          ELSE 0
        END
      )::numeric AS delta
    FROM public.movimientos_inventario m
    WHERE m.empresa_id = v_empresa_id
      AND (m.almacen_origen_id = p_almacen_id OR m.almacen_destino_id = p_almacen_id)
      AND m.created_at >= v_cutoff
    GROUP BY m.producto_id
  )
  SELECT
    COALESCE(l.producto_id, p.producto_id) AS producto_id,
    (COALESCE(l.cantidad,0) - COALESCE(p.delta,0))::numeric AS cantidad
  FROM live l
  FULL OUTER JOIN posteriores p ON p.producto_id = l.producto_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.stock_almacen_at_eod_v2(uuid,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.stock_almacen_at_eod_v2(uuid,date) TO authenticated, service_role;

-- [b] public.get_optimization_quota(uuid)
CREATE OR REPLACE FUNCTION public.get_optimization_quota(_empresa_id uuid)
 RETURNS TABLE(usuarios_activos integer, cuota_base integer, recargas_disponibles integer, cuota_total integer, usadas_mes_actual integer, disponibles integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuarios INTEGER;
  v_base INTEGER;
  v_recargas INTEGER;
  v_usadas INTEGER;
  v_first_of_month TIMESTAMPTZ;
BEGIN
  -- (b) Seguridad fase 1
  PERFORM public.fn_assert_empresa(_empresa_id);

  v_first_of_month := date_trunc('month', now());

  SELECT COUNT(*)::INTEGER INTO v_usuarios
  FROM public.profiles
  WHERE empresa_id = _empresa_id AND estado = 'activo';

  v_base := COALESCE(v_usuarios, 0) * 30;

  SELECT COALESCE(SUM(cantidad_creditos - creditos_consumidos), 0)::INTEGER INTO v_recargas
  FROM public.optimizacion_recargas
  WHERE empresa_id = _empresa_id
    AND status = 'paid'
    AND cantidad_creditos > creditos_consumidos;

  SELECT COUNT(*)::INTEGER INTO v_usadas
  FROM public.optimizacion_rutas_log
  WHERE empresa_id = _empresa_id
    AND created_at >= v_first_of_month;

  RETURN QUERY SELECT
    v_usuarios,
    v_base,
    v_recargas,
    v_base + v_recargas,
    v_usadas,
    GREATEST(0, (v_base + v_recargas) - v_usadas);
END;
$function$;
REVOKE ALL ON FUNCTION public.get_optimization_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_optimization_quota(uuid) TO authenticated, service_role;

-- [b] public.get_sandbox_usage(uuid)
CREATE OR REPLACE FUNCTION public.get_sandbox_usage(p_empresa_id uuid)
 RETURNS TABLE(clientes_count integer, clientes_max integer, productos_count integer, productos_max integer, ventas_count integer, ventas_max integer)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  -- (b) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);
  RETURN QUERY
SELECT
    (SELECT count(*)::int FROM clientes WHERE empresa_id = p_empresa_id), 10,
    (SELECT count(*)::int FROM productos WHERE empresa_id = p_empresa_id), 20,
    (SELECT count(*)::int FROM ventas WHERE empresa_id = p_empresa_id), 50;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_sandbox_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sandbox_usage(uuid) TO authenticated, service_role;

-- [b] public.next_folio(text,uuid)
CREATE OR REPLACE FUNCTION public.next_folio(prefix text, p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num BIGINT;
  pattern TEXT := '^' || prefix || '-[0-9]+$';
BEGIN
  -- (b) Seguridad fase 1
  PERFORM public.fn_assert_empresa(p_empresa_id);

  PERFORM pg_advisory_xact_lock(hashtext('folio:' || prefix), hashtext(p_empresa_id::text));
  IF prefix IN ('VTA', 'PED') THEN
    SELECT COALESCE(MAX(CASE WHEN folio ~ pattern THEN CAST(SUBSTRING(folio FROM LENGTH(prefix) + 2) AS BIGINT) ELSE 0 END), 0) + 1
    INTO next_num FROM public.ventas WHERE empresa_id = p_empresa_id AND folio ~ pattern;
  ELSIF prefix = 'CLI' THEN
    SELECT COALESCE(MAX(CASE WHEN codigo ~ pattern THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS BIGINT) ELSE 0 END), 0) + 1
    INTO next_num FROM public.clientes WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'PROD' THEN
    SELECT COALESCE(MAX(CASE WHEN codigo ~ pattern THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS BIGINT) ELSE 0 END), 0) + 1
    INTO next_num FROM public.productos WHERE empresa_id = p_empresa_id;
  ELSE
    next_num := 1;
  END IF;
  RETURN prefix || '-' || public.folio_num(next_num);
END;
$function$;
REVOKE ALL ON FUNCTION public.next_folio(text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.next_folio(text,uuid) TO authenticated, service_role;

-- [b+c vía delegación] public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,text,uuid): solo llama a la de 11 parámetros (que ya valida).
REVOKE ALL ON FUNCTION public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,text,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_cobro(uuid,uuid,numeric,text,text,date,jsonb,text,uuid) TO authenticated, service_role;

-- ─── 3. (a) Funciones internas: sin EXECUTE para PUBLIC/anon/authenticated ──────────
REVOKE EXECUTE ON FUNCTION public._aj_regresar_a_bodega(public.entregas,uuid,uuid,numeric,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._aj_regresar_a_bodega(public.entregas,uuid,uuid,numeric,uuid,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public._aplica_stock_lote(uuid,uuid,uuid,uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._aplica_stock_lote(uuid,uuid,uuid,uuid,numeric) TO service_role;
REVOKE EXECUTE ON FUNCTION public._aplicar_delta_compra_edicion(uuid,uuid,uuid,uuid,numeric,uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._aplicar_delta_compra_edicion(uuid,uuid,uuid,uuid,numeric,uuid,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public._descarga_es_propia(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._descarga_es_propia(uuid,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public._inotif_cliente_nombre(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._inotif_cliente_nombre(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public._mover_stock_entre_almacenes(uuid,uuid,numeric,uuid,uuid,text,uuid,uuid,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._mover_stock_entre_almacenes(uuid,uuid,numeric,uuid,uuid,text,uuid,uuid,date,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.aplicar_partner_referido(uuid,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_partner_referido(uuid,text,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.apply_carga_kardex(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_carga_kardex(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.calc_audit_stock_teorico(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calc_audit_stock_teorico(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.check_stock_lote_paridad(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_stock_lote_paridad(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_old_vendedor_historial() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_vendedor_historial() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cleanup_stale_vendedor_ubicaciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_stale_vendedor_ubicaciones() TO service_role;
REVOKE EXECUTE ON FUNCTION public.cobro_tiene_rep_vigente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cobro_tiene_rep_vigente(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.confirm_timbre_reserve(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_timbre_reserve(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.count_active_users(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.count_active_users(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.deduct_timbre(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_timbre(uuid,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.desactivar_cupones_partner_fuera_limite(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.desactivar_cupones_partner_fuera_limite(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_almacen_mermas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_almacen_mermas(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.ensure_empresa_admin_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_empresa_admin_role(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_disponible_almacen(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_disponible_almacen(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_doc_mueve_stock(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_doc_mueve_stock(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_factor_neto_compra(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_factor_neto_compra(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_log_solicitud_traspaso(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_log_solicitud_traspaso(uuid,uuid,text,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_netear_linea_promo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_netear_linea_promo(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_pedido_entregado_completo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_pedido_entregado_completo(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_puede_cancelar_devolucion(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_puede_cancelar_devolucion(uuid,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_puede_descargas(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_puede_descargas(uuid,uuid,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_venta_header(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recalc_venta_header(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_recalc_venta_saldo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_recalc_venta_saldo(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_reevaluar_promos_venta(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reevaluar_promos_venta(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_refresh_logistica_pedido_resumen(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_refresh_logistica_pedido_resumen(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_sync_apartado_linea(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_apartado_linea(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_sync_status_pedido(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_status_pedido(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_sync_venta_inventario(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_sync_venta_inventario(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_total_efectivo_cerrado(uuid,numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_total_efectivo_cerrado(uuid,numeric) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_venta_cobrable(public.ventas) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_venta_cobrable(public.ventas) TO service_role;
REVOKE EXECUTE ON FUNCTION public.fn_venta_tiene_promocion(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_venta_tiene_promocion(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.generar_bonos_partner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generar_bonos_partner(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.generate_empresa_licencia() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_empresa_licencia() TO service_role;
REVOKE EXECUTE ON FUNCTION public.generate_folio(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_folio(uuid,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_partner_active_empresas(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_partner_active_empresas(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_empresa_admin(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_empresa_admin(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.is_sandbox_empresa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sandbox_empresa(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.limpiar_consumo_datos_antiguo() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.limpiar_consumo_datos_antiguo() TO service_role;
REVOKE EXECUTE ON FUNCTION public.log_venta_historial(uuid,uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.log_venta_historial(uuid,uuid,text,jsonb) TO service_role;
REVOKE EXECUTE ON FUNCTION public.puede_configurar_facturacion(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_configurar_facturacion(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.puede_facturar(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_facturar(uuid,uuid,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.purge_internal_notifications() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_internal_notifications() TO service_role;
REVOKE EXECUTE ON FUNCTION public.purge_old_gps_history() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_gps_history() TO service_role;
REVOKE EXECUTE ON FUNCTION public.recalc_producto_costo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_producto_costo(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.recalc_venta_totales(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalc_venta_totales(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.recalcular_nivel_partner(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recalcular_nivel_partner(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.recibir_linea_compra(uuid,numeric,uuid,uuid,uuid,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.recibir_linea_compra(uuid,numeric,uuid,uuid,uuid,text,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reconciliar_saldos_cliente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_saldos_cliente(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.reconciliar_saldos_empresa(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconciliar_saldos_empresa(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.release_timbre(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_timbre(uuid,text) TO service_role;
REVOKE EXECUTE ON FUNCTION public.repair_missing_entrega_carga() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.repair_missing_entrega_carga() TO service_role;
REVOKE EXECUTE ON FUNCTION public.reserve_timbre(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_timbre(uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.resolver_comision_pct_linea(uuid,uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolver_comision_pct_linea(uuid,uuid,uuid,uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.stock_almacen_at_eod(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stock_almacen_at_eod(uuid,date) TO service_role;
REVOKE EXECUTE ON FUNCTION public.tiene_cobertura_vigente(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tiene_cobertura_vigente(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.wa_clientes_saldos(uuid,text,boolean,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_clientes_saldos(uuid,text,boolean,integer) TO service_role;

-- ─── 4. Tabla de respaldo expuesta ──────────────────────────────────────────────────────
ALTER TABLE public.cliente_orden_ruta_dia_respaldo ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cliente_orden_ruta_dia_respaldo FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.cliente_orden_ruta_dia_respaldo TO service_role;

COMMIT;
