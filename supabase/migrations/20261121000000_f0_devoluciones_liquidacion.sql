-- F0 devoluciones y liquidación (auditoría 2026-11-20, hallazgos H1, H6, H8, H9 y cantidades).
-- Solo agrega: funciones nuevas, triggers nuevos, un CHECK y un índice. No cambia FKs,
-- no quita políticas ni columnas. Comportamiento de inventario sin cambios (F1 pendiente).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Cantidades: un renglón de devolución siempre devuelve algo (> 0).
--    Verificado antes: 0 filas con cantidad <= 0 en la base de prueba.
-- ─────────────────────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conrelid = 'public.devolucion_lineas'::regclass
                    AND conname = 'devolucion_lineas_cantidad_positiva') THEN
    IF EXISTS (SELECT 1 FROM public.devolucion_lineas WHERE cantidad <= 0) THEN
      -- Datos viejos inválidos: se protege lo nuevo sin tocar lo existente.
      ALTER TABLE public.devolucion_lineas
        ADD CONSTRAINT devolucion_lineas_cantidad_positiva CHECK (cantidad > 0) NOT VALID;
    ELSE
      ALTER TABLE public.devolucion_lineas
        ADD CONSTRAINT devolucion_lineas_cantidad_positiva CHECK (cantidad > 0);
    END IF;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) H1: registrar una devolución en UNA transacción (encabezado + renglones +
--    cantidad devuelta de la carga). Antes el front insertaba el encabezado y luego
--    los renglones: si fallaban (accion NULL), quedaba el encabezado huérfano.
--    SECURITY INVOKER: aplica RLS del usuario; el inventario lo siguen moviendo
--    los triggers de devolucion_lineas (sin cambio).
--    Idempotente por id: reenviar la misma devolución no la duplica.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.registrar_devolucion(p_devolucion jsonb, p_lineas jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_emp  uuid;
  v_tipo text;
  v_carga uuid;
  l      jsonb;
  v_cant numeric;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_devolucion IS NULL OR jsonb_typeof(p_devolucion) <> 'object' THEN
    RAISE EXCEPTION 'Faltan los datos de la devolución' USING ERRCODE = '22023';
  END IF;
  IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array' OR jsonb_array_length(p_lineas) = 0 THEN
    RAISE EXCEPTION 'Agrega al menos un producto a la devolución' USING ERRCODE = '22023';
  END IF;

  FOR l IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    v_cant := NULLIF(l->>'cantidad', '')::numeric;
    IF v_cant IS NULL OR v_cant <= 0 THEN
      RAISE EXCEPTION 'La cantidad a devolver debe ser mayor a cero' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(l->>'producto_id', '') IS NULL THEN
      RAISE EXCEPTION 'Cada renglón de la devolución necesita un producto' USING ERRCODE = '22023';
    END IF;
  END LOOP;

  v_id  := COALESCE(NULLIF(p_devolucion->>'id', '')::uuid, gen_random_uuid());
  IF EXISTS (SELECT 1 FROM public.devoluciones WHERE id = v_id) THEN
    RETURN v_id;  -- ya registrada (doble toque / reintento)
  END IF;

  v_emp := COALESCE(NULLIF(p_devolucion->>'empresa_id', '')::uuid, public.get_my_empresa_id());
  v_tipo := CASE WHEN p_devolucion->>'tipo' IN ('almacen', 'tienda') THEN p_devolucion->>'tipo'
                 WHEN NULLIF(p_devolucion->>'cliente_id', '') IS NOT NULL THEN 'tienda'
                 ELSE 'almacen' END;
  v_carga := NULLIF(p_devolucion->>'carga_id', '')::uuid;

  INSERT INTO public.devoluciones
    (id, empresa_id, vendedor_id, cliente_id, carga_id, venta_id, almacen_destino_id,
     reembolso_efectivo, reembolso_metodo, tipo, fecha, notas, user_id)
  VALUES
    (v_id, v_emp,
     NULLIF(p_devolucion->>'vendedor_id', '')::uuid,
     NULLIF(p_devolucion->>'cliente_id', '')::uuid,
     v_carga,
     NULLIF(p_devolucion->>'venta_id', '')::uuid,
     NULLIF(p_devolucion->>'almacen_destino_id', '')::uuid,
     COALESCE((p_devolucion->>'reembolso_efectivo')::boolean, false),
     NULLIF(p_devolucion->>'reembolso_metodo', ''),
     v_tipo::public.tipo_devolucion,
     COALESCE(NULLIF(p_devolucion->>'fecha', '')::date, CURRENT_DATE),
     NULLIF(p_devolucion->>'notas', ''),
     v_uid);

  INSERT INTO public.devolucion_lineas
    (devolucion_id, producto_id, cantidad, motivo, notas, accion, monto_credito, reemplazo_producto_id)
  SELECT v_id,
         (x->>'producto_id')::uuid,
         (x->>'cantidad')::numeric,
         COALESCE(NULLIF(x->>'motivo', ''), 'no_vendido')::public.motivo_devolucion,
         NULLIF(x->>'notas', ''),
         -- Sin elección de dinero = 'reposicion' (default de la columna): no genera
         -- nota de crédito ni devolución de dinero.
         COALESCE(NULLIF(x->>'accion', ''), 'reposicion')::public.accion_devolucion,
         COALESCE(NULLIF(x->>'monto_credito', '')::numeric, 0),
         NULLIF(x->>'reemplazo_producto_id', '')::uuid
    FROM jsonb_array_elements(p_lineas) x;

  IF v_carga IS NOT NULL THEN
    UPDATE public.carga_lineas cl
       SET cantidad_devuelta = COALESCE(cl.cantidad_devuelta, 0) + s.cant
      FROM (SELECT (x->>'producto_id')::uuid AS producto_id, SUM((x->>'cantidad')::numeric) AS cant
              FROM jsonb_array_elements(p_lineas) x GROUP BY 1) s
     WHERE cl.carga_id = v_carga AND cl.producto_id = s.producto_id;
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_devolucion(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_devolucion(jsonb, jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) H6 + H8: una sola fórmula del efectivo esperado de la liquidación.
--    esperado = cobros en efectivo − gastos − dinero devuelto por devoluciones
--               − reembolsos de cancelación/corrección sin turno de caja (D-032)
--    · cobros: los registrados por el usuario del vendedor (quien cobró).
--    · devoluciones de dinero: renglones 'devolucion_dinero' de devoluciones no
--      canceladas del vendedor, salvo las ya reembolsadas con un gasto (no doble).
--    · reembolsos: cobro_excedentes tipo 'reembolso' de cancelación o corrección,
--      SIN turno (con turno ya salen como retiro de caja), de un cobro en efectivo,
--      registrados por ese usuario, con fecha (zona de la empresa) en el periodo.
--    SECURITY INVOKER: RLS limita a la empresa del usuario.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_cobro_excedentes_reembolso_usuario
  ON public.cobro_excedentes (empresa_id, user_id, created_at)
  WHERE tipo = 'reembolso' AND turno_id IS NULL;

CREATE OR REPLACE FUNCTION public.fn_liquidacion_esperado(
  p_empresa_id uuid, p_vendedor_id uuid, p_desde date, p_hasta date, p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid;
  v_tz    text;
  v_cob   numeric := 0;
  v_gas   numeric := 0;
  v_dev   numeric := 0;
  v_reemb numeric := 0;
BEGIN
  IF p_empresa_id IS NULL OR p_desde IS NULL OR p_hasta IS NULL THEN
    RAISE EXCEPTION 'Empresa y periodo son obligatorios' USING ERRCODE = '22023';
  END IF;

  IF p_vendedor_id IS NOT NULL THEN
    SELECT user_id INTO v_uid FROM public.profiles WHERE id = p_vendedor_id;
  END IF;
  v_uid := COALESCE(v_uid, p_user_id);

  SELECT COALESCE(NULLIF(e.zona_horaria, ''), 'America/Mexico_City') INTO v_tz
    FROM public.empresas e WHERE e.id = p_empresa_id;
  v_tz := COALESCE(v_tz, 'America/Mexico_City');

  IF v_uid IS NOT NULL THEN
    SELECT COALESCE(SUM(c.monto), 0) INTO v_cob
      FROM public.cobros c
     WHERE c.empresa_id = p_empresa_id AND c.user_id = v_uid
       AND c.fecha BETWEEN p_desde AND p_hasta
       AND c.status <> 'cancelado' AND c.metodo_pago = 'efectivo';

    SELECT COALESCE(SUM(ce.monto), 0) INTO v_reemb
      FROM public.cobro_excedentes ce
      JOIN public.cobros c ON c.id = ce.cobro_id
     WHERE ce.empresa_id = p_empresa_id AND ce.user_id = v_uid
       AND ce.tipo = 'reembolso' AND ce.turno_id IS NULL
       AND ce.origen IN ('cancelacion', 'correccion')
       AND c.metodo_pago = 'efectivo'
       AND (ce.created_at AT TIME ZONE v_tz)::date BETWEEN p_desde AND p_hasta;
  END IF;

  IF p_vendedor_id IS NOT NULL THEN
    SELECT COALESCE(SUM(g.monto), 0) INTO v_gas
      FROM public.gastos g
     WHERE g.empresa_id = p_empresa_id AND g.vendedor_id = p_vendedor_id
       AND g.fecha BETWEEN p_desde AND p_hasta AND g.cancelado_at IS NULL;

    SELECT COALESCE(SUM(dl.monto_credito), 0) INTO v_dev
      FROM public.devoluciones d
      JOIN public.devolucion_lineas dl ON dl.devolucion_id = d.id
     WHERE d.empresa_id = p_empresa_id AND d.vendedor_id = p_vendedor_id
       AND d.fecha BETWEEN p_desde AND p_hasta AND d.cancelado_at IS NULL
       AND dl.accion = 'devolucion_dinero'
       AND NOT EXISTS (SELECT 1 FROM public.gastos g
                        WHERE g.devolucion_id = d.id AND g.cancelado_at IS NULL);
  END IF;

  RETURN jsonb_build_object(
    'cobros_efectivo',     round(v_cob, 2),
    'gastos',              round(v_gas, 2),
    'devoluciones_dinero', round(v_dev, 2),
    'reembolsos',          round(v_reemb, 2),
    'esperado',            round(v_cob - v_gas - v_dev - v_reemb, 2));
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_liquidacion_esperado(uuid, uuid, date, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_liquidacion_esperado(uuid, uuid, date, date, uuid) TO authenticated, service_role;

-- Lista de liquidaciones: el mismo cálculo por cada descarga (cuadre en vivo).
CREATE OR REPLACE FUNCTION public.fn_liquidaciones_esperado(p_descarga_ids uuid[])
RETURNS TABLE (descarga_id uuid, cobros_efectivo numeric, gastos numeric,
               devoluciones_dinero numeric, reembolsos numeric, esperado numeric)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT d.id,
         (x->>'cobros_efectivo')::numeric,
         (x->>'gastos')::numeric,
         (x->>'devoluciones_dinero')::numeric,
         (x->>'reembolsos')::numeric,
         (x->>'esperado')::numeric
    FROM public.descarga_ruta d
    CROSS JOIN LATERAL public.fn_liquidacion_esperado(
      d.empresa_id, d.vendedor_id,
      COALESCE(d.fecha_inicio, d.fecha), COALESCE(d.fecha_fin, d.fecha), d.user_id) AS x
   WHERE d.id = ANY(p_descarga_ids);
$function$;

REVOKE ALL ON FUNCTION public.fn_liquidaciones_esperado(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_liquidaciones_esperado(uuid[]) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) H9: permisos de la liquidación (descarga_ruta). La RLS solo aísla por
--    empresa; las columnas sensibles se protegen con triggers.
--    Permiso = mismo criterio que la app: super admin, dueño, usuario sin rol,
--    o rol con logistica.descargas · <accion>.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_puede_descargas(p_uid uuid, p_empresa_id uuid, p_accion text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_uid IS NOT NULL AND p_empresa_id IS NOT NULL AND (
    public.is_super_admin(p_uid)
    OR EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id AND e.owner_user_id = p_uid)
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_uid AND p.empresa_id = p_empresa_id)
      AND (
        NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_uid)
        OR EXISTS (SELECT 1 FROM public.user_roles ur
                     JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                    WHERE ur.user_id = p_uid AND rp.modulo = 'logistica.descargas'
                      AND rp.accion = p_accion AND rp.permitido)
      )
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.fn_puede_descargas(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_puede_descargas(uuid, uuid, text) TO authenticated, service_role;

-- ¿La liquidación es del usuario? (la registró él o es su perfil de vendedor)
CREATE OR REPLACE FUNCTION public._descarga_es_propia(p_uid uuid, p_user_id uuid, p_vendedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT p_uid IS NOT NULL AND (
    COALESCE(p_user_id = p_uid, false)
    OR (p_vendedor_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_vendedor_id AND p.user_id = p_uid))
  );
$function$;

REVOKE ALL ON FUNCTION public._descarga_es_propia(uuid, uuid, uuid) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.tg_descarga_ruta_permisos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Procesos del servidor, SQL directo y eliminación de empresa (D-046) quedan exentos.
  IF COALESCE(auth.role(), '') = 'service_role' OR v_uid IS NULL
     OR COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF public.fn_puede_descargas(v_uid, NEW.empresa_id, 'editar') THEN RETURN NEW; END IF;
    IF NEW.status::text <> 'pendiente' OR NEW.aprobado_por IS NOT NULL
       OR NEW.fecha_aprobacion IS NOT NULL OR NEW.notas_supervisor IS NOT NULL THEN
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

DROP TRIGGER IF EXISTS trg_descarga_ruta_permisos ON public.descarga_ruta;
CREATE TRIGGER trg_descarga_ruta_permisos
  BEFORE INSERT OR UPDATE OR DELETE ON public.descarga_ruta
  FOR EACH ROW EXECUTE FUNCTION public.tg_descarga_ruta_permisos();

-- Renglones del conteo: sin permiso de supervisor solo se tocan los de una
-- liquidación pendiente propia (o creada con permiso «crear»).
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

DROP TRIGGER IF EXISTS trg_descarga_ruta_lineas_permisos ON public.descarga_ruta_lineas;
CREATE TRIGGER trg_descarga_ruta_lineas_permisos
  BEFORE INSERT OR UPDATE OR DELETE ON public.descarga_ruta_lineas
  FOR EACH ROW EXECUTE FUNCTION public.tg_descarga_ruta_lineas_permisos();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) H9 devoluciones (D-006): una devolución que ya movió inventario no se borra
--    (se cancelará formalmente en F2). Exentos: service_role y la eliminación de
--    empresa (app.borrando_empresa, D-046) — ya lo resuelve fn_bloquea_borrado_con_stock.
--    Sus renglones aplicados tampoco cambian cantidad, producto ni dinero.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.devoluciones;
CREATE TRIGGER trg_bloquea_borrado_con_stock
  BEFORE DELETE ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('id');

DROP TRIGGER IF EXISTS trg_bloquea_borrado_con_stock ON public.devolucion_lineas;
CREATE TRIGGER trg_bloquea_borrado_con_stock
  BEFORE DELETE ON public.devolucion_lineas
  FOR EACH ROW EXECUTE FUNCTION public.fn_bloquea_borrado_con_stock('devolucion_id', 'producto_id');

CREATE OR REPLACE FUNCTION public.tg_devolucion_linea_aplicada_inmutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(auth.role(), '') = 'service_role'
     OR COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN
    RETURN NEW;
  END IF;
  IF (NEW.devolucion_id, NEW.producto_id, NEW.cantidad, NEW.accion, NEW.monto_credito)
     IS DISTINCT FROM (OLD.devolucion_id, OLD.producto_id, OLD.cantidad, OLD.accion, OLD.monto_credito)
     AND public.fn_doc_mueve_stock(OLD.devolucion_id, OLD.producto_id) THEN
    RAISE EXCEPTION 'Esta devolución ya movió inventario: no se cambia, se cancela.' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_devolucion_linea_aplicada_inmutable ON public.devolucion_lineas;
CREATE TRIGGER trg_devolucion_linea_aplicada_inmutable
  BEFORE UPDATE ON public.devolucion_lineas
  FOR EACH ROW EXECUTE FUNCTION public.tg_devolucion_linea_aplicada_inmutable();
