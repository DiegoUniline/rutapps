-- Fase 2 «NO PERDER VENTAS» (auditoría 2026-11-23-auditoria-9de10.md, áreas 2 y 4).
-- Solo AGREGA: 2 tablas nuevas, 5 funciones nuevas, 1 bandera apagada. No cambia ni borra
-- nada existente. Idempotente (se puede correr dos veces).
--
--  1. public.carga_vendido_ventas: bitácora (ledger) de lo que cada venta sumó a
--     carga_lineas.cantidad_vendida. Hace idempotente el incremento por delta: la misma
--     venta + producto solo suma una vez aunque la cola lo reenvíe.
--  2. public.sync_descartes: registro en el servidor de cada operación pendiente que un
--     usuario con permiso descartó del teléfono (quién, cuándo, qué, motivo).
--  3. public._ruta_carga_sumar_vendido (interna): suma por delta lo vendido a la carga.
--  4. public.fn_ruta_carga_sumar_vendido(p_venta_id, p_carga_id, p_lineas): RPC que usa la
--     cola del teléfono en lugar de escribir carga_lineas con valores absolutos.
--  5. public._ruta_assert_ids / public._ruta_insert_json (internas).
--  6. public.fn_ruta_registrar_venta(p_venta jsonb): venta de ruta COMPLETA en una sola
--     transacción e idempotente por id (encabezado, renglones, lotes, promociones, cobros
--     con aplicaciones y carga por delta). Detrás de la bandera `ruta_venta_rpc` (apagada).
--
-- Reutiliza sin duplicar: inventario (fn_sync_venta_inventario vía triggers DEFERRED de
-- venta_lineas / venta_linea_lotes), totales (trg_venta_lineas_recalc_header), saldo y
-- validación de cobros (trg_recalc_venta_saldo, trg_validate_cobro_*), folio
-- (trg_auto_folio_venta) y promociones (trg_promocion_aplicada_*). Es el mismo camino que
-- hoy sigue la cola (inserts a esas tablas), pero en UNA transacción.
--
-- Por qué no llama a aplicar_cobro: no recibe el id del cobro (genera uno nuevo), así que un
-- reenvío crearía otro cobro y la copia local del teléfono quedaría con otro id. La venta
-- de ruta ya inserta cobros/aplicaciones directo (cola) y las reglas viven en los triggers.

-- ─── 1. Bitácora de lo vendido por venta en la carga ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carga_vendido_ventas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES public.empresas(id),
  carga_id       uuid NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  carga_linea_id uuid NOT NULL REFERENCES public.carga_lineas(id) ON DELETE CASCADE,
  venta_id       uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  producto_id    uuid NOT NULL,
  cantidad       numeric(14,4) NOT NULL CHECK (cantidad > 0),
  created_at     timestamptz NOT NULL DEFAULT now(),
  created_by     uuid,
  CONSTRAINT carga_vendido_ventas_venta_producto_key UNIQUE (venta_id, producto_id)
);
CREATE INDEX IF NOT EXISTS idx_carga_vendido_ventas_emp_carga
  ON public.carga_vendido_ventas (empresa_id, carga_id);
CREATE INDEX IF NOT EXISTS idx_carga_vendido_ventas_carga_linea
  ON public.carga_vendido_ventas (carga_linea_id);

ALTER TABLE public.carga_vendido_ventas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation select" ON public.carga_vendido_ventas;
CREATE POLICY "Tenant isolation select" ON public.carga_vendido_ventas
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_my_empresa_id())
         OR (SELECT public.is_super_admin((SELECT auth.uid()))));
-- Sin políticas de escritura: solo se escribe desde las funciones SECURITY DEFINER.
REVOKE ALL ON public.carga_vendido_ventas FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.carga_vendido_ventas FROM authenticated;
GRANT SELECT ON public.carga_vendido_ventas TO authenticated;
GRANT ALL ON public.carga_vendido_ventas TO service_role;
COMMENT ON TABLE public.carga_vendido_ventas IS
  'Fase 2: cuánto sumó cada venta (por producto) a carga_lineas.cantidad_vendida. Única por (venta, producto): hace idempotente el incremento por delta.';

-- ─── 2. Descartes de la cola offline ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sync_descartes (
  id            uuid PRIMARY KEY,
  empresa_id    uuid NOT NULL REFERENCES public.empresas(id),
  user_id       uuid NOT NULL DEFAULT auth.uid(),
  tabla         text NOT NULL,
  operacion     text NOT NULL,
  clave         text,
  datos         jsonb,
  motivo        text NOT NULL CHECK (length(btrim(motivo)) >= 3),
  ultimo_error  text,
  reintentos    integer,
  encolado_at   timestamptz,
  descartado_at timestamptz NOT NULL,
  dispositivo   text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sync_descartes_emp_created
  ON public.sync_descartes (empresa_id, created_at DESC);

ALTER TABLE public.sync_descartes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Tenant isolation select" ON public.sync_descartes;
CREATE POLICY "Tenant isolation select" ON public.sync_descartes
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT public.get_my_empresa_id())
         OR (SELECT public.is_super_admin((SELECT auth.uid()))));
DROP POLICY IF EXISTS "Registrar descarte propio" ON public.sync_descartes;
CREATE POLICY "Registrar descarte propio" ON public.sync_descartes
  FOR INSERT TO authenticated
  WITH CHECK (empresa_id = (SELECT public.get_my_empresa_id())
              AND user_id = (SELECT auth.uid()));
-- Bitácora: no se edita ni se borra desde la app.
REVOKE ALL ON public.sync_descartes FROM PUBLIC, anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.sync_descartes FROM authenticated;
GRANT SELECT, INSERT ON public.sync_descartes TO authenticated;
GRANT ALL ON public.sync_descartes TO service_role;
COMMENT ON TABLE public.sync_descartes IS
  'Fase 2: operaciones pendientes de sincronizar que un usuario con permiso descartó en su teléfono (solo se agrega).';

-- ─── 3. Interna: valida que unos ids existan y sean de la empresa ─────────────────────
-- No existe → 23503 (la cola lo trata como «el padre aún no sube» y espera).
-- Existe en otra empresa → 42501.
CREATE OR REPLACE FUNCTION public._ruta_assert_ids(p_tabla text, p_ids uuid[], p_empresa_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_ids   uuid[];
  v_total integer;
  v_mias  integer;
BEGIN
  IF p_tabla NOT IN ('clientes', 'profiles', 'almacenes', 'tarifas', 'productos', 'unidades',
                     'lista_precios', 'producto_presentaciones', 'lotes', 'promociones',
                     'ventas', 'cargas') THEN
    RAISE EXCEPTION 'Tabla no permitida: %', p_tabla USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT x) INTO v_ids FROM unnest(p_ids) x WHERE x IS NOT NULL;
  IF v_ids IS NULL THEN
    RETURN;
  END IF;
  EXECUTE format('SELECT count(*), count(*) FILTER (WHERE empresa_id = $2) FROM public.%I WHERE id = ANY($1)', p_tabla)
    INTO v_total, v_mias USING v_ids, p_empresa_id;
  IF v_total < cardinality(v_ids) THEN
    RAISE EXCEPTION 'Falta en el servidor un registro de % (puede que aún no se sincronice)', p_tabla
      USING ERRCODE = '23503';
  END IF;
  IF v_mias < cardinality(v_ids) THEN
    RAISE EXCEPTION 'Un registro de % no pertenece a la empresa', p_tabla USING ERRCODE = '42501';
  END IF;
END
$fn$;
REVOKE ALL ON FUNCTION public._ruta_assert_ids(text, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ruta_assert_ids(text, uuid[], uuid) TO service_role;

-- ─── 4. Interna: inserta UNA fila desde jsonb solo con las columnas presentes ─────────
-- Igual que PostgREST: las llaves ausentes toman el DEFAULT de la columna.
CREATE OR REPLACE FUNCTION public._ruta_insert_json(p_tabla regclass, p_fila jsonb, p_excluir text[] DEFAULT '{}'::text[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_cols text;
BEGIN
  IF p_tabla NOT IN ('public.ventas'::regclass, 'public.venta_lineas'::regclass,
                     'public.venta_linea_lotes'::regclass, 'public.promocion_aplicada'::regclass) THEN
    RAISE EXCEPTION 'Tabla no permitida: %', p_tabla USING ERRCODE = '22023';
  END IF;
  IF p_fila IS NULL OR jsonb_typeof(p_fila) <> 'object' THEN
    RAISE EXCEPTION 'Fila inválida para %', p_tabla USING ERRCODE = '22023';
  END IF;
  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum) INTO v_cols
  FROM pg_attribute a
  WHERE a.attrelid = p_tabla AND a.attnum > 0 AND NOT a.attisdropped
    AND a.attgenerated = '' AND a.attidentity <> 'a'
    AND p_fila ? a.attname
    AND NOT (a.attname = ANY (p_excluir));
  IF v_cols IS NULL THEN
    RAISE EXCEPTION 'Fila sin columnas para %', p_tabla USING ERRCODE = '22023';
  END IF;
  EXECUTE format('INSERT INTO %s (%s) SELECT %s FROM jsonb_populate_record(NULL::%s, $1)',
                 p_tabla, v_cols, v_cols, p_tabla)
    USING p_fila;
END
$fn$;
REVOKE ALL ON FUNCTION public._ruta_insert_json(regclass, jsonb, text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ruta_insert_json(regclass, jsonb, text[]) TO service_role;

-- ─── 5. Interna: suma por delta lo vendido a la carga (idempotente por venta+producto) ─
CREATE OR REPLACE FUNCTION public._ruta_carga_sumar_vendido(p_empresa_id uuid, p_venta_id uuid, p_carga_id uuid, p_lineas jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  r          record;
  v_linea_id uuid;
  v_nuevo    uuid;
  v_aplicadas integer := 0;
BEGIN
  IF p_carga_id IS NULL OR p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT (x->>'producto_id')::uuid AS producto_id,
           sum(COALESCE(NULLIF(x->>'cantidad', '')::numeric, 0)) AS cantidad
    FROM jsonb_array_elements(p_lineas) x
    WHERE NULLIF(x->>'producto_id', '') IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  LOOP
    CONTINUE WHEN r.cantidad IS NULL OR r.cantidad <= 0;
    -- Mismo criterio que el teléfono: el renglón de la carga para ese producto (si no hay, no se suma).
    SELECT cl.id INTO v_linea_id
    FROM public.carga_lineas cl
    WHERE cl.carga_id = p_carga_id AND cl.producto_id = r.producto_id
    ORDER BY cl.created_at, cl.id
    LIMIT 1
    FOR UPDATE;
    CONTINUE WHEN v_linea_id IS NULL;

    v_nuevo := NULL;
    INSERT INTO public.carga_vendido_ventas (empresa_id, carga_id, carga_linea_id, venta_id, producto_id, cantidad, created_by)
    VALUES (p_empresa_id, p_carga_id, v_linea_id, p_venta_id, r.producto_id, r.cantidad, auth.uid())
    ON CONFLICT (venta_id, producto_id) DO NOTHING
    RETURNING id INTO v_nuevo;

    IF v_nuevo IS NOT NULL THEN
      -- Por DELTA: no pisa recargas del admin ni devoluciones que el servidor ya sumó.
      UPDATE public.carga_lineas
      SET cantidad_vendida = COALESCE(cantidad_vendida, 0) + r.cantidad
      WHERE id = v_linea_id;
      v_aplicadas := v_aplicadas + 1;
    END IF;
  END LOOP;
  RETURN v_aplicadas;
END
$fn$;
REVOKE ALL ON FUNCTION public._ruta_carga_sumar_vendido(uuid, uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._ruta_carga_sumar_vendido(uuid, uuid, uuid, jsonb) TO service_role;

-- ─── 6. RPC: lo vendido a la carga, por delta (camino actual de la venta de ruta) ─────
CREATE OR REPLACE FUNCTION public.fn_ruta_carga_sumar_vendido(p_venta_id uuid, p_carga_id uuid, p_lineas jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_emp   uuid;
  v_vemp  uuid;
  v_n     integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_venta_id IS NULL OR p_carga_id IS NULL THEN
    RAISE EXCEPTION 'Faltan la venta o la carga' USING ERRCODE = '22023';
  END IF;
  SELECT c.empresa_id INTO v_emp FROM public.cargas c WHERE c.id = p_carga_id;
  IF v_emp IS NULL THEN
    RAISE EXCEPTION 'La carga aún no existe en el servidor' USING ERRCODE = '23503';
  END IF;
  PERFORM public.fn_assert_empresa(v_emp);
  SELECT v.empresa_id INTO v_vemp FROM public.ventas v WHERE v.id = p_venta_id;
  IF v_vemp IS NULL THEN
    -- La venta todavía no sube: la cola espera (defer) y reintenta.
    RAISE EXCEPTION 'La venta aún no existe en el servidor' USING ERRCODE = '23503';
  END IF;
  IF v_vemp IS DISTINCT FROM v_emp THEN
    RAISE EXCEPTION 'La venta no pertenece a la empresa de la carga' USING ERRCODE = '42501';
  END IF;
  PERFORM public._ruta_assert_ids('productos',
    ARRAY(SELECT NULLIF(x->>'producto_id', '')::uuid FROM jsonb_array_elements(COALESCE(p_lineas, '[]'::jsonb)) x), v_emp);
  PERFORM pg_advisory_xact_lock(hashtextextended('ruta_venta:' || p_venta_id::text, 0));
  v_n := public._ruta_carga_sumar_vendido(v_emp, p_venta_id, p_carga_id, p_lineas);
  RETURN jsonb_build_object('ok', true, 'renglones_sumados', v_n);
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_ruta_carga_sumar_vendido(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ruta_carga_sumar_vendido(uuid, uuid, jsonb) TO authenticated, service_role;

-- ─── 7. RPC: venta de ruta completa en UNA transacción, idempotente por id ────────────
-- p_venta = {
--   venta: {id, empresa_id, cliente_id, ...encabezado},
--   lineas: [venta_lineas], lineas_lotes: [venta_linea_lotes], promociones: [promocion_aplicada],
--   cobros: [{id, cliente_id, monto, metodo_pago, referencia, fecha, created_at,
--             aplicaciones: [{id, venta_id, monto_aplicado}]}],
--   carga: {carga_id, lineas: [{producto_id, cantidad}]} | null
-- }
-- Devuelve {ok, venta_id, folio, duplicada}.
CREATE OR REPLACE FUNCTION public.fn_ruta_registrar_venta(p_venta jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_uid     uuid := auth.uid();
  v_h       jsonb;
  v_id      uuid;
  v_emp     uuid;
  v_exist   record;
  v_lineas  jsonb;
  v_lotes   jsonb;
  v_promos  jsonb;
  v_cobros  jsonb;
  v_carga   jsonb;
  v_ids_lin uuid[];
  l         jsonb;
  c         jsonb;
  a         jsonb;
  v_cobro   uuid;
  v_monto   numeric;
  v_sum     numeric;
  v_folio   text;
  v_status  text;
  v_rech    jsonb := '[]'::jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_venta IS NULL OR jsonb_typeof(p_venta) <> 'object' OR jsonb_typeof(p_venta->'venta') IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION 'Faltan los datos de la venta' USING ERRCODE = '22023';
  END IF;
  v_h   := p_venta->'venta';
  v_id  := NULLIF(v_h->>'id', '')::uuid;
  v_emp := NULLIF(v_h->>'empresa_id', '')::uuid;
  IF v_id IS NULL OR v_emp IS NULL THEN
    RAISE EXCEPTION 'La venta necesita id y empresa' USING ERRCODE = '22023';
  END IF;

  -- Serializa reenvíos simultáneos de la MISMA venta (dos pestañas, doble toque).
  PERFORM pg_advisory_xact_lock(hashtextextended('ruta_venta:' || v_id::text, 0));

  -- Idempotencia: si ya existe, OK sin duplicar nada (la cola puede reenviar).
  SELECT v.empresa_id, v.folio INTO v_exist FROM public.ventas v WHERE v.id = v_id;
  IF FOUND THEN
    PERFORM public.fn_assert_empresa(v_exist.empresa_id);
    RETURN jsonb_build_object('ok', true, 'venta_id', v_id, 'folio', v_exist.folio, 'duplicada', true);
  END IF;

  PERFORM public.fn_assert_empresa(v_emp);
  IF NOT (public.is_active_app_user(v_uid) OR public.is_super_admin(v_uid)) THEN
    RAISE EXCEPTION 'Usuario inactivo' USING ERRCODE = '42501';
  END IF;

  v_lineas := COALESCE(p_venta->'lineas', '[]'::jsonb);
  v_lotes  := COALESCE(p_venta->'lineas_lotes', '[]'::jsonb);
  v_promos := COALESCE(p_venta->'promociones', '[]'::jsonb);
  v_cobros := COALESCE(p_venta->'cobros', '[]'::jsonb);
  v_carga  := p_venta->'carga';
  IF jsonb_typeof(v_lineas) <> 'array' OR jsonb_array_length(v_lineas) = 0 THEN
    RAISE EXCEPTION 'La venta no tiene productos' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v_lotes) <> 'array' OR jsonb_typeof(v_promos) <> 'array' OR jsonb_typeof(v_cobros) <> 'array' THEN
    RAISE EXCEPTION 'Formato inválido de la venta' USING ERRCODE = '22023';
  END IF;
  v_status := COALESCE(NULLIF(v_h->>'status', ''), 'confirmado');
  IF v_status NOT IN ('borrador', 'confirmado') THEN
    RAISE EXCEPTION 'Estado inicial inválido: %', v_status USING ERRCODE = '22023';
  END IF;
  FOR l IN SELECT * FROM jsonb_array_elements(v_lineas) LOOP
    IF NULLIF(l->>'id', '') IS NULL THEN
      RAISE EXCEPTION 'Cada renglón necesita id' USING ERRCODE = '22023';
    END IF;
    -- Igual que el camino actual (la tabla no tiene CHECK): se rechaza solo vacía o negativa.
    IF NULLIF(l->>'cantidad', '') IS NULL OR (l->>'cantidad')::numeric < 0 THEN
      RAISE EXCEPTION 'La cantidad de cada renglón no puede ir vacía ni ser negativa' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  SELECT array_agg((x->>'id')::uuid) INTO v_ids_lin FROM jsonb_array_elements(v_lineas) x;

  IF NULLIF(v_h->>'cliente_id', '') IS NULL THEN
    RAISE EXCEPTION 'La venta necesita cliente' USING ERRCODE = '22023';
  END IF;

  -- Todo lo referenciado debe ser de la misma empresa (la función salta RLS).
  PERFORM public._ruta_assert_ids('clientes',
    ARRAY[NULLIF(v_h->>'cliente_id', '')::uuid]
    || ARRAY(SELECT NULLIF(x->>'cliente_id', '')::uuid FROM jsonb_array_elements(v_cobros) x), v_emp);
  PERFORM public._ruta_assert_ids('profiles', ARRAY[NULLIF(v_h->>'vendedor_id', '')::uuid], v_emp);
  PERFORM public._ruta_assert_ids('tarifas', ARRAY[NULLIF(v_h->>'tarifa_id', '')::uuid], v_emp);
  PERFORM public._ruta_assert_ids('almacenes',
    ARRAY[NULLIF(v_h->>'almacen_id', '')::uuid]
    || ARRAY(SELECT NULLIF(x->>'almacen_id', '')::uuid FROM jsonb_array_elements(v_lineas) x)
    || ARRAY(SELECT NULLIF(x->>'almacen_id', '')::uuid FROM jsonb_array_elements(v_lotes) x), v_emp);
  PERFORM public._ruta_assert_ids('productos',
    ARRAY(SELECT NULLIF(x->>'producto_id', '')::uuid FROM jsonb_array_elements(v_lineas) x)
    || ARRAY(SELECT NULLIF(x->>'producto_id', '')::uuid FROM jsonb_array_elements(v_lotes) x)
    || ARRAY(SELECT NULLIF(x->>'producto_id', '')::uuid FROM jsonb_array_elements(COALESCE(v_carga->'lineas', '[]'::jsonb)) x), v_emp);
  PERFORM public._ruta_assert_ids('unidades',
    ARRAY(SELECT NULLIF(x->>'unidad_id', '')::uuid FROM jsonb_array_elements(v_lineas) x), v_emp);
  PERFORM public._ruta_assert_ids('lista_precios',
    ARRAY(SELECT NULLIF(x->>'lista_precio_id', '')::uuid FROM jsonb_array_elements(v_lineas) x), v_emp);
  PERFORM public._ruta_assert_ids('producto_presentaciones',
    ARRAY(SELECT NULLIF(x->>'presentacion_id', '')::uuid FROM jsonb_array_elements(v_lineas) x), v_emp);
  PERFORM public._ruta_assert_ids('lotes',
    ARRAY(SELECT NULLIF(x->>'lote_id', '')::uuid FROM jsonb_array_elements(v_lineas) x)
    || ARRAY(SELECT NULLIF(x->>'lote_id', '')::uuid FROM jsonb_array_elements(v_lotes) x), v_emp);
  PERFORM public._ruta_assert_ids('promociones',
    ARRAY(SELECT NULLIF(x->>'promocion_id', '')::uuid FROM jsonb_array_elements(v_lineas) x)
    || ARRAY(SELECT NULLIF(x->>'promocion_id', '')::uuid FROM jsonb_array_elements(v_promos) x), v_emp);
  PERFORM public._ruta_assert_ids('ventas',
    ARRAY(SELECT NULLIF(ap->>'venta_id', '')::uuid
          FROM jsonb_array_elements(v_cobros) x, jsonb_array_elements(COALESCE(x->'aplicaciones', '[]'::jsonb)) ap
          WHERE NULLIF(ap->>'venta_id', '')::uuid IS DISTINCT FROM v_id), v_emp);
  IF v_carga IS NOT NULL AND jsonb_typeof(v_carga) = 'object' THEN
    PERFORM public._ruta_assert_ids('cargas', ARRAY[NULLIF(v_carga->>'carga_id', '')::uuid], v_emp);
  END IF;

  -- 1) Encabezado. El folio lo pone el trigger; campos de cierre/saldo inicial no vienen del teléfono.
  PERFORM public._ruta_insert_json('public.ventas',
    v_h || jsonb_build_object('id', v_id, 'empresa_id', v_emp, 'status', v_status, 'folio', NULL, 'es_saldo_inicial', false),
    ARRAY['folio', 'cerrado_at', 'cerrado_por', 'cerrado_snapshot', 'total_efectivo', 'comision_volumen_pago_id',
          'turno_id', 'updated_at', 'pedido_origen_id']);

  -- 2) Renglones (cada uno forzado a ESTA venta y empresa).
  FOR l IN SELECT * FROM jsonb_array_elements(v_lineas) LOOP
    PERFORM public._ruta_insert_json('public.venta_lineas',
      l || jsonb_build_object('venta_id', v_id, 'empresa_id', v_emp),
      ARRAY['facturado', 'factura_cfdi_id', 'facturado_global', 'updated_at']);
  END LOOP;

  -- 3) Lotes por renglón (solo renglones de esta venta).
  FOR l IN SELECT * FROM jsonb_array_elements(v_lotes) LOOP
    IF NOT (NULLIF(l->>'venta_linea_id', '')::uuid = ANY (v_ids_lin)) THEN
      RAISE EXCEPTION 'Un lote apunta a un renglón que no es de esta venta' USING ERRCODE = '22023';
    END IF;
    PERFORM public._ruta_insert_json('public.venta_linea_lotes',
      l || jsonb_build_object('venta_id', v_id, 'empresa_id', v_emp),
      ARRAY['updated_at']);
  END LOOP;

  -- 4) Desglose de promociones (informativo).
  FOR l IN SELECT * FROM jsonb_array_elements(v_promos) LOOP
    IF NULLIF(l->>'venta_linea_id', '') IS NOT NULL AND NOT (NULLIF(l->>'venta_linea_id', '')::uuid = ANY (v_ids_lin)) THEN
      RAISE EXCEPTION 'Una promoción apunta a un renglón que no es de esta venta' USING ERRCODE = '22023';
    END IF;
    PERFORM public._ruta_insert_json('public.promocion_aplicada',
      l || jsonb_build_object('venta_id', v_id), ARRAY[]::text[]);
  END LOOP;

  -- Igual que hoy (cada envío era su propia transacción): totales, inventario por delta y
  -- promociones se calculan ANTES de aplicar los cobros, con los triggers de siempre.
  SET CONSTRAINTS ALL IMMEDIATE;

  -- 5) Cobros con sus aplicaciones (saldo y validaciones: triggers de cobro_aplicaciones).
  FOR c IN SELECT * FROM jsonb_array_elements(v_cobros) LOOP
    v_cobro := NULLIF(c->>'id', '')::uuid;
    v_monto := NULLIF(c->>'monto', '')::numeric;
    IF v_cobro IS NULL THEN
      RAISE EXCEPTION 'Cada cobro necesita id' USING ERRCODE = '22023';
    END IF;
    IF v_monto IS NULL OR v_monto <= 0 THEN
      RAISE EXCEPTION 'Monto del cobro debe ser mayor a 0' USING ERRCODE = '22023';
    END IF;
    SELECT COALESCE(sum(NULLIF(ap->>'monto_aplicado', '')::numeric), 0) INTO v_sum
    FROM jsonb_array_elements(COALESCE(c->'aplicaciones', '[]'::jsonb)) ap;
    IF v_sum > v_monto + 0.01 THEN
      RAISE EXCEPTION 'Suma de aplicaciones (%) excede monto del cobro (%)', v_sum, v_monto USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.cobros (id, empresa_id, cliente_id, user_id, monto, metodo_pago, referencia, fecha, created_at)
    VALUES (
      v_cobro, v_emp,
      COALESCE(NULLIF(c->>'cliente_id', '')::uuid, NULLIF(v_h->>'cliente_id', '')::uuid),
      v_uid,  -- quién cobra = la sesión, nunca lo que diga el teléfono
      v_monto,
      COALESCE(NULLIF(c->>'metodo_pago', ''), 'efectivo'),
      NULLIF(c->>'referencia', ''),
      COALESCE(NULLIF(c->>'fecha', '')::date, NULLIF(v_h->>'fecha', '')::date, CURRENT_DATE),
      COALESCE(NULLIF(c->>'created_at', '')::timestamptz, now())
    );
    FOR a IN SELECT * FROM jsonb_array_elements(COALESCE(c->'aplicaciones', '[]'::jsonb)) LOOP
      CONTINUE WHEN COALESCE(NULLIF(a->>'monto_aplicado', '')::numeric, 0) <= 0;
      IF NULLIF(a->>'venta_id', '')::uuid = v_id THEN
        -- Pago de ESTA venta: si no cuadra, falla todo (no se guarda una venta a medias).
        INSERT INTO public.cobro_aplicaciones (id, cobro_id, venta_id, monto_aplicado, created_at)
        VALUES (COALESCE(NULLIF(a->>'id', '')::uuid, gen_random_uuid()), v_cobro, v_id,
                (a->>'monto_aplicado')::numeric, COALESCE(NULLIF(a->>'created_at', '')::timestamptz, now()));
      ELSE
        -- Abono a OTRA nota: si su saldo cambió en el servidor mientras no había señal (otro
        -- cobro, cancelación), ese abono no se aplica pero la venta SÍ se guarda (igual que
        -- antes, cuando solo fallaba ese envío). Se informa en la respuesta.
        BEGIN
          INSERT INTO public.cobro_aplicaciones (id, cobro_id, venta_id, monto_aplicado, created_at)
          VALUES (COALESCE(NULLIF(a->>'id', '')::uuid, gen_random_uuid()), v_cobro, NULLIF(a->>'venta_id', '')::uuid,
                  (a->>'monto_aplicado')::numeric, COALESCE(NULLIF(a->>'created_at', '')::timestamptz, now()));
        EXCEPTION WHEN OTHERS THEN
          v_rech := v_rech || jsonb_build_array(jsonb_build_object(
            'venta_id', a->>'venta_id', 'monto_aplicado', a->>'monto_aplicado', 'error', SQLERRM));
        END;
      END IF;
    END LOOP;
  END LOOP;

  -- 6) Lo vendido a la carga del camión, por delta (no pisa recargas ni devoluciones).
  IF v_carga IS NOT NULL AND jsonb_typeof(v_carga) = 'object' AND NULLIF(v_carga->>'carga_id', '') IS NOT NULL THEN
    PERFORM public._ruta_carga_sumar_vendido(v_emp, v_id, (v_carga->>'carga_id')::uuid, v_carga->'lineas');
  END IF;

  SELECT v.folio INTO v_folio FROM public.ventas v WHERE v.id = v_id;
  RETURN jsonb_build_object('ok', true, 'venta_id', v_id, 'folio', v_folio, 'duplicada', false,
                            'aplicaciones_rechazadas', v_rech);
END
$fn$;
REVOKE ALL ON FUNCTION public.fn_ruta_registrar_venta(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_ruta_registrar_venta(jsonb) TO authenticated, service_role;
COMMENT ON FUNCTION public.fn_ruta_registrar_venta(jsonb) IS
  'Fase 2: venta de ruta completa (encabezado, renglones, lotes, promociones, cobros, carga por delta) en una transacción; idempotente por id de venta. Bandera ruta_venta_rpc.';

-- ─── 8. Bandera (apagada: alcance «nadie») ───────────────────────────────────────────
INSERT INTO public.feature_flags (clave, nombre, descripcion, notas_prueba, alcance, licencias)
VALUES (
  'ruta_venta_rpc',
  'Venta de ruta en una sola operación',
  'La venta de ruta se sube al servidor como UNA operación (fn_ruta_registrar_venta): encabezado, renglones, lotes, promociones, cobros y carga en una transacción, sin duplicar al reenviar.',
  'Probar con una licencia: venta de contado, a crédito, con lotes, con promoción y abono a otras notas; sin señal y al reconectar. Ver docs/sql/2026-11-23_verificar_fase2.sql.',
  'nadie',
  '{}'::text[]
)
ON CONFLICT (clave) DO NOTHING;
