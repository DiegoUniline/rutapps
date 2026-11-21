-- F1 + F2 devoluciones (D-049). Solo agrega: columnas nuevas nullable/con default, funciones
-- nuevas o reemplazadas, un índice. No borra columnas, no cambia FKs existentes, no quita
-- políticas. Las devoluciones viejas (renglones sin `destino`) conservan su comportamiento.
--
--  1. Destino por renglón: «vendible» (camión del vendedor, o el almacén elegido en escritorio)
--     o «merma» (merma en camión D-036; en escritorio, almacén Mermas central).
--  2. Reposición: lo que se le entrega al cliente sale del camión en la misma transacción
--     (H13), salvo que vaya como renglón «CAMBIO» dentro de la venta.
--  3. Nota de crédito aplicada a la venta: cobro con saldo a favor ligado a la devolución.
--     «Descuento en venta» ya no se acepta en devoluciones nuevas.
--  4. Devolución de dinero (D-032): con turno de caja abierto → retiro de caja; sin turno →
--     cuenta en la liquidación del vendedor (fn_liquidacion_esperado) o, si se pide, gasto.
--  5. carga_lineas.cantidad_devuelta ya no sube con devoluciones de clientes (H15).
--  6. Cancelar la venta ya no cancela sus devoluciones ni el gasto de su reembolso (D-049
--     sobre D-033): _cancelar_devoluciones_venta queda sin efecto. cancelar_venta no cambia:
--     sigue descontando del pago solo los gastos de reembolso ligados a ESA venta (renglones
--     anteriores a F1; los de F1 se ligan a la devolución, no a la venta).
--  8. El crédito (monto_credito) de un renglón con destino lo calcula la BD:
--     round(precio_unitario × cantidad, 2), precio de la lista del cliente CON impuestos.
--  7. F2: cancelar_devolucion revierte inventario, nota, cobro aplicado, caja y gasto.
--     Editar = registrar_devolucion con `reemplaza_id` (cancela la anterior y registra la
--     nueva en la misma transacción).

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Columnas nuevas
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.devolucion_lineas
  ADD COLUMN IF NOT EXISTS destino text,
  ADD COLUMN IF NOT EXISTS precio_unitario numeric(14,2),
  ADD COLUMN IF NOT EXISTS aplica_venta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reposicion_almacen_id uuid REFERENCES public.almacenes(id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'devolucion_lineas_destino_chk') THEN
    ALTER TABLE public.devolucion_lineas
      ADD CONSTRAINT devolucion_lineas_destino_chk CHECK (destino IS NULL OR destino IN ('vendible', 'merma'));
  END IF;
END $$;

COMMENT ON COLUMN public.devolucion_lineas.destino IS
  'D-049: vendible (camión del vendedor o almacén elegido) | merma (merma en camión D-036; en escritorio, Mermas). NULL = renglón anterior a F1 (ruteo por motivo).';
COMMENT ON COLUMN public.devolucion_lineas.precio_unitario IS
  'D-049: precio unitario CON impuestos de la lista de precios del cliente con que se valoró el renglón (congelado).';
COMMENT ON COLUMN public.devolucion_lineas.aplica_venta IS
  'D-049: la nota de crédito de este renglón se aplicó a la venta de la devolución (cobros.devolucion_id).';
COMMENT ON COLUMN public.devolucion_lineas.reposicion_almacen_id IS
  'D-049/H13: almacén del que salió la reposición entregada al cliente. NULL = no salió por la devolución (p. ej. va como CAMBIO en la venta).';

ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS turno_id uuid REFERENCES public.caja_turnos(id),
  ADD COLUMN IF NOT EXISTS caja_movimiento_id uuid REFERENCES public.caja_movimientos(id);
COMMENT ON COLUMN public.devoluciones.turno_id IS
  'D-032/D-049: turno de caja del que salió el dinero devuelto (retiro). Con turno no cuenta en la liquidación del vendedor.';

ALTER TABLE public.cobros
  ADD COLUMN IF NOT EXISTS devolucion_id uuid REFERENCES public.devoluciones(id);
COMMENT ON COLUMN public.cobros.devolucion_id IS
  'D-049: pago con saldo a favor generado por la nota de crédito de esta devolución aplicada a la venta.';
CREATE INDEX IF NOT EXISTS idx_cobros_devolucion ON public.cobros (devolucion_id) WHERE devolucion_id IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Almacenes de la devolución
-- ─────────────────────────────────────────────────────────────────────────────
-- Camión de la devolución: el almacén del vendedor; si no hay vendedor, el de quien registra.
CREATE OR REPLACE FUNCTION public._devolucion_camion(p_devolucion_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(
    (SELECT p.almacen_id FROM public.profiles p WHERE p.id = d.vendedor_id),
    (SELECT p.almacen_id FROM public.profiles p
      WHERE p.user_id = d.user_id AND p.empresa_id = d.empresa_id AND p.almacen_id IS NOT NULL
      ORDER BY p.created_at LIMIT 1))
    FROM public.devoluciones d WHERE d.id = p_devolucion_id;
$function$;
REVOKE ALL ON FUNCTION public._devolucion_camion(uuid) FROM PUBLIC, anon, authenticated;

-- Almacén donde entra un renglón con destino:
--  · vendible: el almacén elegido (escritorio) o el camión.
--  · merma: en escritorio (almacén elegido) → Mermas central; en ruta → merma del camión (D-036).
CREATE OR REPLACE FUNCTION public._devolucion_almacen_destino(p_devolucion_id uuid, p_destino text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dev    record;
  v_camion uuid;
BEGIN
  SELECT id, empresa_id, almacen_destino_id INTO v_dev FROM public.devoluciones WHERE id = p_devolucion_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF p_destino = 'merma' AND v_dev.almacen_destino_id IS NOT NULL THEN
    RETURN public.ensure_almacen_mermas(v_dev.empresa_id);
  END IF;
  IF p_destino = 'vendible' AND v_dev.almacen_destino_id IS NOT NULL THEN
    RETURN v_dev.almacen_destino_id;
  END IF;
  v_camion := public._devolucion_camion(p_devolucion_id);
  IF v_camion IS NULL THEN
    RAISE EXCEPTION 'No se encontró el camión del vendedor para la devolución; asígnale un almacén o elige el almacén destino.'
      USING ERRCODE = '22023';
  END IF;
  IF p_destino = 'merma' THEN
    RETURN public._almacen_merma_camion(v_camion);
  END IF;
  RETURN v_camion;
END;
$function$;
REVOKE ALL ON FUNCTION public._devolucion_almacen_destino(uuid, text) FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Inventario del renglón (trigger AFTER INSERT). Renglones con destino usan la regla
--    nueva; los anteriores (destino NULL) siguen exactamente igual que antes.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.apply_devolucion_linea_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dev record;
  v_almacen_id uuid;
  v_merma_almacen uuid;
  v_existing int;
  v_legacy int;
  v_rep_prod uuid;
BEGIN
  SELECT id, empresa_id, user_id, vendedor_id, almacen_destino_id INTO v_dev
  FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;

  -- ── F1 (D-049): destino elegido por renglón ──
  IF NEW.destino IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM public.movimientos_inventario
                    WHERE referencia_tipo = 'devolucion_aplicada' AND referencia_id = v_dev.id
                      AND notas LIKE '%[linea:' || NEW.id::text || ']%') THEN
      v_almacen_id := public._devolucion_almacen_destino(v_dev.id, NEW.destino);
      PERFORM public._mover_stock_entre_almacenes(v_dev.empresa_id, NEW.producto_id, NEW.cantidad,
        NULL, v_almacen_id, 'devolucion_aplicada', v_dev.id, v_dev.user_id, CURRENT_DATE,
        CASE WHEN NEW.destino = 'merma' THEN 'Devolución de cliente a merma' ELSE 'Devolución de cliente vendible' END
          || ' [linea:' || NEW.id::text || ']');
    END IF;

    -- Reposición entregada al cliente (H13): sale del almacén indicado.
    IF NEW.reposicion_almacen_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.movimientos_inventario
                        WHERE referencia_tipo = 'devolucion_reposicion' AND referencia_id = v_dev.id
                          AND notas LIKE '%[reposicion:' || NEW.id::text || ']%') THEN
      v_rep_prod := COALESCE(NEW.reemplazo_producto_id, NEW.producto_id);
      PERFORM public._mover_stock_entre_almacenes(v_dev.empresa_id, v_rep_prod, NEW.cantidad,
        NEW.reposicion_almacen_id, NULL, 'devolucion_reposicion', v_dev.id, v_dev.user_id, CURRENT_DATE,
        'Reposición entregada al cliente [reposicion:' || NEW.id::text || ']');
      PERFORM public._merma_ajustar_lotes(v_dev.empresa_id, NEW.reposicion_almacen_id, v_rep_prod, NEW.cantidad, NULL);
    END IF;
    RETURN NEW;
  END IF;

  -- ── Renglones anteriores a F1 (sin destino): comportamiento previo, sin cambios ──
  -- Almacén destino automático: el del usuario que registró (fallback al vendedor).
  SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.user_id;
  IF v_almacen_id IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
    SELECT almacen_id INTO v_almacen_id FROM public.profiles WHERE id = v_dev.vendedor_id;
  END IF;

  -- Ruteo automático por motivo (producto NO vendible → Almacén Mermas).
  IF NEW.motivo::text IN ('danado', 'vencido', 'caducado') THEN
    SELECT id INTO v_merma_almacen
    FROM public.almacenes
    WHERE empresa_id = v_dev.empresa_id AND es_merma = true AND merma_de_almacen_id IS NULL
    ORDER BY created_at LIMIT 1;
    IF v_merma_almacen IS NOT NULL THEN
      v_almacen_id := v_merma_almacen;
    END IF;
  END IF;

  -- NUEVO (escritorio): si la devolución trae almacén destino explícito, GANA
  -- sobre el ruteo automático. Retrocompatible: móvil no lo setea → sin cambios.
  IF v_dev.almacen_destino_id IS NOT NULL THEN
    v_almacen_id := v_dev.almacen_destino_id;
    IF v_almacen_id <> COALESCE(v_merma_almacen, '00000000-0000-0000-0000-000000000000'::uuid) THEN
      v_merma_almacen := NULL;
    END IF;
  END IF;

  IF v_almacen_id IS NULL THEN
    RAISE LOG 'apply_devolucion_linea_inventory: no almacen for devolucion %', v_dev.id;
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_existing
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion_aplicada' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id
    AND notas LIKE '%[linea:' || NEW.id::text || ']%';
  IF v_existing > 0 THEN RETURN NEW; END IF;

  SELECT COUNT(*) INTO v_legacy
  FROM public.movimientos_inventario
  WHERE referencia_tipo = 'devolucion' AND referencia_id = v_dev.id AND producto_id = NEW.producto_id AND tipo = 'entrada';
  IF v_legacy > 0 THEN
    INSERT INTO public.movimientos_inventario (
      empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
      referencia_tipo, referencia_id, user_id, notas, fecha
    ) VALUES (
      v_dev.empresa_id, 'entrada', NEW.producto_id, 0, v_almacen_id,
      'devolucion_aplicada', v_dev.id, v_dev.user_id, 'Ancla (reingreso previo por app móvil)', CURRENT_DATE
    );
    RETURN NEW;
  END IF;

  -- Reingreso real al almacén elegido (vendible o mermas)
  INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
  VALUES (v_dev.empresa_id, v_almacen_id, NEW.producto_id, NEW.cantidad)
  ON CONFLICT (almacen_id, producto_id)
    DO UPDATE SET cantidad = stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

  INSERT INTO public.movimientos_inventario (
    empresa_id, tipo, producto_id, cantidad, almacen_destino_id,
    referencia_tipo, referencia_id, user_id, notas, fecha
  ) VALUES (
    v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen_id,
    'devolucion_aplicada', v_dev.id, v_dev.user_id,
    CASE WHEN v_merma_almacen IS NOT NULL THEN 'Devolución a MERMAS (trigger BD)'
         ELSE 'Devolución (trigger BD)' END || ' [linea:' || NEW.id::text || ']',
    CURRENT_DATE
  );

  RETURN NEW;
END;
$function$;

-- Lotes (H23): el lote entra donde entró el producto. La merma no lleva lote (igual que la
-- merma en camión de D-036). Renglones sin destino: comportamiento previo.
CREATE OR REPLACE FUNCTION public.aplicar_lote_devolucion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_dev RECORD; v_almacen uuid; v_merma uuid; v_maneja boolean; v_lote uuid;
BEGIN
  SELECT COALESCE(maneja_lote, false) INTO v_maneja FROM public.productos WHERE id = NEW.producto_id;
  IF NOT v_maneja THEN RETURN NEW; END IF;
  SELECT id, empresa_id, user_id, vendedor_id INTO v_dev FROM public.devoluciones WHERE id = NEW.devolucion_id;
  IF v_dev.id IS NULL THEN RETURN NEW; END IF;
  IF NEW.destino IS NOT NULL THEN
    IF NEW.destino = 'merma' THEN RETURN NEW; END IF;
    v_almacen := public._devolucion_almacen_destino(v_dev.id, NEW.destino);
  ELSE
    SELECT almacen_id INTO v_almacen FROM public.profiles WHERE id = v_dev.user_id;
    IF v_almacen IS NULL AND v_dev.vendedor_id IS NOT NULL THEN
      SELECT almacen_id INTO v_almacen FROM public.profiles WHERE id = v_dev.vendedor_id;
    END IF;
    IF NEW.motivo::text IN ('danado', 'vencido', 'caducado') THEN
      SELECT id INTO v_merma FROM public.almacenes WHERE empresa_id = v_dev.empresa_id AND es_merma = true AND merma_de_almacen_id IS NULL ORDER BY created_at LIMIT 1;
      IF v_merma IS NOT NULL THEN RETURN NEW; END IF;
    END IF;
  END IF;
  IF v_almacen IS NULL THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.movimientos_inventario
             WHERE referencia_id = v_dev.id AND referencia_tipo = 'devolucion_lote' AND producto_id = NEW.producto_id
               AND (NEW.destino IS NULL OR notas LIKE '%[linea:' || NEW.id::text || ']%')) THEN RETURN NEW; END IF;
  SELECT id INTO v_lote FROM public.lotes
  WHERE producto_id = NEW.producto_id AND empresa_id = v_dev.empresa_id AND COALESCE(activo, true) = true
  ORDER BY fecha_caducidad ASC NULLS LAST, created_at ASC LIMIT 1;
  IF v_lote IS NULL THEN RETURN NEW; END IF;
  INSERT INTO public.movimientos_inventario
    (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
  VALUES (v_dev.empresa_id, 'entrada', NEW.producto_id, NEW.cantidad, v_almacen, v_lote,
          'devolucion_lote', v_dev.id, v_dev.user_id, CURRENT_DATE,
          'Devolución lote (FEFO-in)' || CASE WHEN NEW.destino IS NOT NULL THEN ' [linea:' || NEW.id::text || ']' ELSE '' END);
  RETURN NEW;
END; $function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Permiso para cancelar una devolución: super admin, dueño, usuario sin rol, rol con
--    «ventas.devoluciones · eliminar», o quien la registró si su rol móvil no le quita
--    «ruta.devoluciones».
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_puede_cancelar_devolucion(p_uid uuid, p_empresa_id uuid, p_registro_user_id uuid)
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
                    WHERE ur.user_id = p_uid AND rp.modulo = 'ventas.devoluciones'
                      AND rp.accion = 'eliminar' AND rp.permitido)
        OR (p_registro_user_id = p_uid
            AND NOT EXISTS (SELECT 1 FROM public.user_roles ur
                              JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                             WHERE ur.user_id = p_uid AND rp.modulo = 'ruta.devoluciones'
                               AND rp.accion = 'ver' AND NOT rp.permitido))
      )
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.fn_puede_cancelar_devolucion(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_puede_cancelar_devolucion(uuid, uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) F2: cancelar una devolución (D-026). Revierte exacto y deja rastro.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancelar_devolucion(p_devolucion_id uuid, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_dev     public.devoluciones%ROWTYPE;
  v_motivo  text := NULLIF(btrim(COALESCE(p_motivo, '')), '');
  v_nota    numeric := 0;
  v_aplic   numeric := 0;
  v_disp    numeric;
  v_falta   numeric;
  v_take    numeric;
  v_central uuid;
  v_turno   uuid;
  v_monto_caja numeric;
  v_cobros  int := 0;
  v_gastos  int := 0;
  r         record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_dev FROM public.devoluciones WHERE id = p_devolucion_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Devolución no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_dev.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta devolución' USING ERRCODE = '42501';
  END IF;
  IF v_dev.cancelado_at IS NOT NULL THEN
    RAISE EXCEPTION 'La devolución ya está cancelada.' USING ERRCODE = '22023';
  END IF;
  IF v_motivo IS NULL THEN
    RAISE EXCEPTION 'Escribe el motivo de la cancelación.' USING ERRCODE = '22023';
  END IF;
  IF NOT public.fn_puede_cancelar_devolucion(v_uid, v_dev.empresa_id, v_dev.user_id) THEN
    RAISE EXCEPTION 'No tienes permiso para cancelar devoluciones.' USING ERRCODE = '42501';
  END IF;

  -- Nota de crédito que quedó como saldo a favor: no se puede quitar si el cliente ya la usó.
  SELECT COALESCE(SUM(dl.monto_credito), 0) INTO v_nota
    FROM public.devolucion_lineas dl
   WHERE dl.devolucion_id = v_dev.id AND dl.accion::text = 'nota_credito';
  SELECT COALESCE(SUM(c.monto), 0) INTO v_aplic
    FROM public.cobros c
   WHERE c.devolucion_id = v_dev.id AND COALESCE(c.status, 'activo') <> 'cancelado';
  IF v_dev.cliente_id IS NOT NULL AND v_nota - v_aplic > 0.009 THEN
    v_disp := public.saldo_a_favor_cliente(v_dev.cliente_id);
    IF COALESCE(v_disp, 0) + 0.01 < round(v_nota - v_aplic, 2) THEN
      RAISE EXCEPTION 'La nota de crédito de esta devolución ya se usó como pago (saldo a favor disponible %, nota %). Cancela primero ese pago.',
        round(COALESCE(v_disp, 0), 2), round(v_nota - v_aplic, 2) USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Inventario sin lote: se deshace el neto de lo que movió la devolución, por almacén.
  FOR r IN
    SELECT x.producto_id, x.almacen_id, SUM(x.delta) AS neto
      FROM (
        SELECT m.producto_id, m.almacen_destino_id AS almacen_id, COALESCE(m.cantidad, 0) AS delta
          FROM public.movimientos_inventario m
         WHERE m.referencia_id = v_dev.id AND m.lote_id IS NULL AND m.tipo::text = 'entrada'
           AND m.almacen_destino_id IS NOT NULL
           AND m.referencia_tipo IN ('devolucion_aplicada', 'devolucion', 'devolucion_reposicion', 'devolucion_cancelada')
        UNION ALL
        SELECT m.producto_id, m.almacen_origen_id, -COALESCE(m.cantidad, 0)
          FROM public.movimientos_inventario m
         WHERE m.referencia_id = v_dev.id AND m.lote_id IS NULL AND m.tipo::text = 'salida'
           AND m.almacen_origen_id IS NOT NULL
           AND m.referencia_tipo IN ('devolucion_aplicada', 'devolucion', 'devolucion_reposicion', 'devolucion_cancelada')
      ) x
     GROUP BY x.producto_id, x.almacen_id
    HAVING abs(SUM(x.delta)) > 0.000001
  LOOP
    IF r.neto > 0 THEN
      v_falta := r.neto;
      -- Merma en camión ya descargada a Mermas (D-036): se toma de donde quedó.
      IF EXISTS (SELECT 1 FROM public.almacenes a WHERE a.id = r.almacen_id AND a.merma_de_almacen_id IS NOT NULL) THEN
        SELECT GREATEST(COALESCE(SUM(s.cantidad), 0), 0) INTO v_take
          FROM public.stock_almacen s WHERE s.almacen_id = r.almacen_id AND s.producto_id = r.producto_id;
        v_take := LEAST(v_take, v_falta);
        IF v_take > 0 THEN
          PERFORM public._mover_stock_entre_almacenes(v_dev.empresa_id, r.producto_id, v_take, r.almacen_id, NULL,
            'devolucion_cancelada', v_dev.id, v_uid, CURRENT_DATE, 'Cancelación de devolución: ' || v_motivo);
          v_falta := v_falta - v_take;
        END IF;
        IF v_falta > 0.000001 THEN
          v_central := public.ensure_almacen_mermas(v_dev.empresa_id);
          PERFORM public._mover_stock_entre_almacenes(v_dev.empresa_id, r.producto_id, v_falta, v_central, NULL,
            'devolucion_cancelada', v_dev.id, v_uid, CURRENT_DATE, 'Cancelación de devolución (merma ya descargada): ' || v_motivo);
        END IF;
      ELSE
        PERFORM public._mover_stock_entre_almacenes(v_dev.empresa_id, r.producto_id, v_falta, r.almacen_id, NULL,
          'devolucion_cancelada', v_dev.id, v_uid, CURRENT_DATE, 'Cancelación de devolución: ' || v_motivo);
      END IF;
    ELSE
      -- Reposición que salió del camión: regresa.
      PERFORM public._mover_stock_entre_almacenes(v_dev.empresa_id, r.producto_id, -r.neto, NULL, r.almacen_id,
        'devolucion_cancelada', v_dev.id, v_uid, CURRENT_DATE, 'Cancelación de devolución (regresa reposición): ' || v_motivo);
    END IF;
  END LOOP;

  -- Lotes de la reposición (se descontaron FEFO del camión): regresan.
  FOR r IN
    SELECT dl.reposicion_almacen_id AS almacen_id, COALESCE(dl.reemplazo_producto_id, dl.producto_id) AS producto_id, dl.cantidad
      FROM public.devolucion_lineas dl
     WHERE dl.devolucion_id = v_dev.id AND dl.reposicion_almacen_id IS NOT NULL
  LOOP
    PERFORM public._merma_ajustar_lotes(v_dev.empresa_id, r.almacen_id, r.producto_id, -r.cantidad, NULL);
  END LOOP;

  -- Lotes que entraron con la devolución.
  FOR r IN
    SELECT m.producto_id, m.lote_id, m.almacen_destino_id AS almacen_id, SUM(COALESCE(m.cantidad, 0)) AS cant
      FROM public.movimientos_inventario m
     WHERE m.referencia_id = v_dev.id AND m.referencia_tipo = 'devolucion_lote' AND m.tipo::text = 'entrada'
       AND m.lote_id IS NOT NULL AND m.almacen_destino_id IS NOT NULL
     GROUP BY 1, 2, 3
  LOOP
    v_take := r.cant - COALESCE((SELECT SUM(COALESCE(m.cantidad, 0)) FROM public.movimientos_inventario m
                                   WHERE m.referencia_id = v_dev.id AND m.referencia_tipo = 'devolucion_cancelada_lote'
                                     AND m.lote_id = r.lote_id AND m.almacen_origen_id = r.almacen_id
                                     AND m.producto_id = r.producto_id), 0);
    IF v_take > 0.000001 THEN
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES (v_dev.empresa_id, 'salida', r.producto_id, v_take, r.almacen_id, r.lote_id,
              'devolucion_cancelada_lote', v_dev.id, v_uid, CURRENT_DATE, 'Cancelación de devolución (lote): ' || v_motivo);
    END IF;
  END LOOP;

  -- Nota aplicada a la venta: se cancela ese pago (la venta vuelve a deber).
  UPDATE public.cobros SET status = 'cancelado'
   WHERE devolucion_id = v_dev.id AND COALESCE(status, 'activo') <> 'cancelado';
  GET DIAGNOSTICS v_cobros = ROW_COUNT;

  -- Dinero devuelto por caja: regresa a la caja (depósito) si hay un turno abierto.
  IF v_dev.caja_movimiento_id IS NOT NULL THEN
    SELECT cm.monto INTO v_monto_caja FROM public.caja_movimientos cm WHERE cm.id = v_dev.caja_movimiento_id;
    SELECT t.id INTO v_turno FROM public.caja_turnos t
     WHERE t.id = v_dev.turno_id AND t.status = 'abierto';
    IF v_turno IS NULL THEN
      SELECT t.id INTO v_turno FROM public.caja_turnos t
       WHERE t.empresa_id = v_dev.empresa_id AND t.cajero_id = v_uid AND t.status = 'abierto'
       ORDER BY t.abierto_at DESC LIMIT 1;
    END IF;
    IF v_turno IS NOT NULL AND COALESCE(v_monto_caja, 0) > 0 THEN
      INSERT INTO public.caja_movimientos (empresa_id, turno_id, tipo, monto, motivo, user_id)
      VALUES (v_dev.empresa_id, v_turno, 'deposito', v_monto_caja, 'Cancelación de devolución de dinero', v_uid);
    END IF;
  END IF;

  -- Devoluciones anteriores a F1 que sumaron a la carga (cantidad_devuelta): se restan.
  IF v_dev.carga_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.devolucion_lineas dl WHERE dl.devolucion_id = v_dev.id AND dl.destino IS NOT NULL) THEN
    UPDATE public.carga_lineas cl
       SET cantidad_devuelta = GREATEST(COALESCE(cl.cantidad_devuelta, 0) - s.cant, 0)
      FROM (SELECT dl.producto_id, SUM(dl.cantidad) AS cant FROM public.devolucion_lineas dl
             WHERE dl.devolucion_id = v_dev.id GROUP BY 1) s
     WHERE cl.carga_id = v_dev.carga_id AND cl.producto_id = s.producto_id;
  END IF;

  -- Gasto con que se reembolsó: se cancela con la devolución.
  UPDATE public.gastos
     SET cancelado_at = now(), cancelado_por = v_uid, cancelado_motivo = 'Devolución cancelada: ' || v_motivo
   WHERE devolucion_id = v_dev.id AND cancelado_at IS NULL;
  GET DIAGNOSTICS v_gastos = ROW_COUNT;

  UPDATE public.devoluciones
     SET cancelado_at = now(), cancelado_por = v_uid, cancelado_motivo = v_motivo
   WHERE id = v_dev.id;

  RETURN jsonb_build_object('devolucion_id', v_dev.id, 'cobros_cancelados', v_cobros,
                            'gastos_cancelados', v_gastos, 'caja_deposito', v_turno IS NOT NULL AND COALESCE(v_monto_caja, 0) > 0);
END;
$function$;
REVOKE ALL ON FUNCTION public.cancelar_devolucion(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_devolucion(uuid, text) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) Una sola vía para registrar (móvil en línea y sin conexión, escritorio).
--    SECURITY INVOKER: la RLS del usuario aplica a todo lo que inserta; las
--    referencias (cliente, venta, almacén, vendedor, productos) se validan contra
--    la empresa porque una FK no revisa RLS.
--    p_devolucion: id, empresa_id, vendedor_id, cliente_id, carga_id, venta_id,
--      almacen_destino_id, reembolso_metodo, tipo, fecha, notas, registrar_gasto,
--      reemplaza_id (editar), motivo_edicion.
--    p_lineas[]: producto_id, cantidad, motivo, notas, accion, monto_credito,
--      reemplazo_producto_id, destino, precio_unitario, aplica_venta, reposicion_en_venta.
-- ─────────────────────────────────────────────────────────────────────────────
-- Monto (crédito o dinero) de un renglón. Con destino (F1) y precio: la BD lo calcula
-- (precio de lista del cliente CON impuestos × cantidad, como el total de un renglón de venta).
-- Reposición = sin dinero. Sin destino (cliente anterior a F1): el monto que mandó.
CREATE OR REPLACE FUNCTION public._devolucion_linea_monto(x jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN NULLIF(x->>'destino', '') IS NOT NULL AND COALESCE(NULLIF(x->>'accion', ''), 'reposicion') = 'reposicion' THEN 0
    WHEN NULLIF(x->>'destino', '') IS NOT NULL AND NULLIF(x->>'precio_unitario', '') IS NOT NULL
      THEN round(round((x->>'precio_unitario')::numeric, 2) * (x->>'cantidad')::numeric, 2)
    ELSE round(COALESCE(NULLIF(x->>'monto_credito', '')::numeric, 0), 2)
  END;
$function$;
REVOKE ALL ON FUNCTION public._devolucion_linea_monto(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._devolucion_linea_monto(jsonb) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.registrar_devolucion(p_devolucion jsonb, p_lineas jsonb)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid    uuid := auth.uid();
  v_id     uuid;
  v_emp    uuid;
  v_tipo   text;
  v_carga  uuid;
  v_cli    uuid;
  v_venta  uuid;
  v_alm    uuid;
  v_vend   uuid;
  v_reemp  uuid;
  v_fecha  date;
  v_camion uuid;
  l        jsonb;
  v_cant   numeric;
  v_acc    text;
  v_dest   text;
  v_nuevo  boolean := false;
  v_rep    boolean := false;
  v_aplicar numeric := 0;
  v_dinero  numeric := 0;
  v_metodo  text;
  v_vrow    record;
  v_monto   numeric;
  v_cobro   uuid;
  v_turno   uuid;
  v_mov     uuid;
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
    IF COALESCE(NULLIF(l->>'monto_credito', '')::numeric, 0) < 0 OR COALESCE(NULLIF(l->>'precio_unitario', '')::numeric, 0) < 0 THEN
      RAISE EXCEPTION 'El monto de la devolución no puede ser negativo' USING ERRCODE = '22023';
    END IF;
    v_dest := NULLIF(l->>'destino', '');
    v_acc  := COALESCE(NULLIF(l->>'accion', ''), 'reposicion');
    IF v_dest IS NOT NULL THEN
      v_nuevo := true;
      IF v_dest NOT IN ('vendible', 'merma') THEN
        RAISE EXCEPTION 'Destino inválido: vendible o merma' USING ERRCODE = '22023';
      END IF;
      IF v_acc NOT IN ('reposicion', 'nota_credito', 'devolucion_dinero') THEN
        RAISE EXCEPTION 'Acción inválida: reposición, nota de crédito o devolución de dinero («Descuento en venta» ya no existe: usa la nota aplicada a la venta)'
          USING ERRCODE = '22023';
      END IF;
    ELSIF v_nuevo THEN
      RAISE EXCEPTION 'Elige el destino (vendible o merma) de cada producto' USING ERRCODE = '22023';
    END IF;
    IF COALESCE((l->>'aplica_venta')::boolean, false) AND v_acc <> 'nota_credito' THEN
      RAISE EXCEPTION 'Solo una nota de crédito se puede aplicar a la venta' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  -- Destino obligatorio en todos o en ninguno (ninguno = cliente anterior a F1).
  IF v_nuevo AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x WHERE NULLIF(x->>'destino', '') IS NULL) THEN
    RAISE EXCEPTION 'Elige el destino (vendible o merma) de cada producto' USING ERRCODE = '22023';
  END IF;

  v_id := COALESCE(NULLIF(p_devolucion->>'id', '')::uuid, gen_random_uuid());
  IF EXISTS (SELECT 1 FROM public.devoluciones WHERE id = v_id) THEN
    RETURN v_id;  -- ya registrada (doble toque / reintento de la cola)
  END IF;

  v_emp := COALESCE(NULLIF(p_devolucion->>'empresa_id', '')::uuid, public.get_my_empresa_id());
  IF v_emp IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta empresa' USING ERRCODE = '42501';
  END IF;
  v_cli   := NULLIF(p_devolucion->>'cliente_id', '')::uuid;
  v_venta := NULLIF(p_devolucion->>'venta_id', '')::uuid;
  v_alm   := NULLIF(p_devolucion->>'almacen_destino_id', '')::uuid;
  v_vend  := NULLIF(p_devolucion->>'vendedor_id', '')::uuid;
  v_carga := NULLIF(p_devolucion->>'carga_id', '')::uuid;
  v_reemp := NULLIF(p_devolucion->>'reemplaza_id', '')::uuid;
  v_fecha := COALESCE(NULLIF(p_devolucion->>'fecha', '')::date, CURRENT_DATE);

  IF v_cli IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.clientes WHERE id = v_cli AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'Cliente no encontrado en la empresa' USING ERRCODE = '42501';
  END IF;
  IF v_alm IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.almacenes WHERE id = v_alm AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'Almacén no encontrado en la empresa' USING ERRCODE = '42501';
  END IF;
  IF v_vend IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_vend AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'Vendedor no encontrado en la empresa' USING ERRCODE = '42501';
  END IF;
  -- La venta puede no existir todavía (cola sin conexión): la FK la espera (23503 → reintento).
  IF v_venta IS NOT NULL AND EXISTS (SELECT 1 FROM public.ventas WHERE id = v_venta AND empresa_id IS DISTINCT FROM v_emp) THEN
    RAISE EXCEPTION 'Venta no encontrada en la empresa' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x
              WHERE NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id = (x->>'producto_id')::uuid AND p.empresa_id = v_emp))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x
              WHERE NULLIF(x->>'reemplazo_producto_id', '') IS NOT NULL
                AND NOT EXISTS (SELECT 1 FROM public.productos p WHERE p.id = (x->>'reemplazo_producto_id')::uuid AND p.empresa_id = v_emp)) THEN
    RAISE EXCEPTION 'Producto no encontrado en la empresa' USING ERRCODE = '42501';
  END IF;

  -- Editar = cancelar la anterior y registrar esta, en la misma transacción.
  IF v_reemp IS NOT NULL THEN
    PERFORM public.cancelar_devolucion(v_reemp,
      COALESCE(NULLIF(btrim(p_devolucion->>'motivo_edicion'), ''), 'Editada') || ' (reemplazada por la devolución ' || v_id || ')');
  END IF;

  v_tipo := CASE WHEN p_devolucion->>'tipo' IN ('almacen', 'tienda') THEN p_devolucion->>'tipo'
                 WHEN v_cli IS NOT NULL THEN 'tienda'
                 ELSE 'almacen' END;

  SELECT COALESCE(SUM(public._devolucion_linea_monto(x)), 0) INTO v_dinero
    FROM jsonb_array_elements(p_lineas) x WHERE x->>'accion' = 'devolucion_dinero';
  v_metodo := COALESCE(NULLIF(p_devolucion->>'reembolso_metodo', ''), CASE WHEN v_dinero > 0 THEN 'efectivo' END);

  INSERT INTO public.devoluciones
    (id, empresa_id, vendedor_id, cliente_id, carga_id, venta_id, almacen_destino_id,
     reembolso_efectivo, reembolso_metodo, tipo, fecha, notas, user_id)
  VALUES
    (v_id, v_emp, v_vend, v_cli, v_carga, v_venta, v_alm,
     COALESCE((p_devolucion->>'reembolso_efectivo')::boolean, v_dinero > 0),
     v_metodo,
     v_tipo::public.tipo_devolucion,
     v_fecha,
     NULLIF(p_devolucion->>'notas', ''),
     v_uid);

  -- Reposición que sale por la devolución (no como CAMBIO en la venta): del almacén elegido o del camión.
  IF v_nuevo AND EXISTS (SELECT 1 FROM jsonb_array_elements(p_lineas) x
                          WHERE COALESCE(NULLIF(x->>'accion', ''), 'reposicion') = 'reposicion'
                            AND NOT COALESCE((x->>'reposicion_en_venta')::boolean, false)) THEN
    v_rep := true;
    v_camion := COALESCE(v_alm,
      (SELECT p.almacen_id FROM public.profiles p WHERE p.id = v_vend),
      (SELECT p.almacen_id FROM public.profiles p
        WHERE p.user_id = v_uid AND p.empresa_id = v_emp AND p.almacen_id IS NOT NULL
        ORDER BY p.created_at LIMIT 1));
    IF v_camion IS NULL THEN
      RAISE EXCEPTION 'No se encontró el camión del que sale la reposición' USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.devolucion_lineas
    (devolucion_id, producto_id, cantidad, motivo, notas, accion, monto_credito, reemplazo_producto_id,
     destino, precio_unitario, aplica_venta, reposicion_almacen_id)
  SELECT v_id,
         (x->>'producto_id')::uuid,
         (x->>'cantidad')::numeric,
         COALESCE(NULLIF(x->>'motivo', ''), 'no_vendido')::public.motivo_devolucion,
         NULLIF(x->>'notas', ''),
         -- Sin elección de dinero = 'reposicion' (default de la columna).
         COALESCE(NULLIF(x->>'accion', ''), 'reposicion')::public.accion_devolucion,
         public._devolucion_linea_monto(x),
         NULLIF(x->>'reemplazo_producto_id', '')::uuid,
         NULLIF(x->>'destino', ''),
         round(NULLIF(x->>'precio_unitario', '')::numeric, 2),
         COALESCE((x->>'aplica_venta')::boolean, false),
         CASE WHEN v_rep AND COALESCE(NULLIF(x->>'accion', ''), 'reposicion') = 'reposicion'
                   AND NOT COALESCE((x->>'reposicion_en_venta')::boolean, false)
              THEN v_camion END
    FROM jsonb_array_elements(p_lineas) x;

  -- H15: solo la devolución del camión a bodega (sin cliente, anterior a F1) toca la carga.
  IF v_carga IS NOT NULL AND v_cli IS NULL AND NOT v_nuevo THEN
    UPDATE public.carga_lineas cl
       SET cantidad_devuelta = COALESCE(cl.cantidad_devuelta, 0) + s.cant
      FROM (SELECT (x->>'producto_id')::uuid AS producto_id, SUM((x->>'cantidad')::numeric) AS cant
              FROM jsonb_array_elements(p_lineas) x GROUP BY 1) s
     WHERE cl.carga_id = v_carga AND cl.producto_id = s.producto_id;
  END IF;

  -- Nota de crédito aplicada a la venta: pago con saldo a favor sobre la venta, hasta su saldo.
  SELECT COALESCE(SUM(dl.monto_credito), 0) INTO v_aplicar
    FROM public.devolucion_lineas dl
   WHERE dl.devolucion_id = v_id AND dl.aplica_venta AND dl.accion::text = 'nota_credito';
  IF v_aplicar > 0.009 THEN
    IF v_venta IS NULL OR v_cli IS NULL THEN
      RAISE EXCEPTION 'Para aplicar la nota a la venta se necesitan la venta y el cliente' USING ERRCODE = '22023';
    END IF;
    SELECT id, cliente_id, folio, saldo_pendiente, status::text AS status INTO v_vrow
      FROM public.ventas WHERE id = v_venta FOR UPDATE;
    IF v_vrow.cliente_id IS DISTINCT FROM v_cli THEN
      RAISE EXCEPTION 'La venta es de otro cliente' USING ERRCODE = '22023';
    END IF;
    v_monto := LEAST(v_aplicar, GREATEST(COALESCE(v_vrow.saldo_pendiente, 0), 0));
    IF v_monto > 0.009 AND v_vrow.status NOT IN ('cancelado', 'borrador') THEN
      v_cobro := public.aplicar_cobro(v_emp, v_cli, round(v_monto, 2), 'saldo_favor',
        trim('Nota de crédito ' || COALESCE(v_vrow.folio, '')), v_fecha,
        jsonb_build_array(jsonb_build_object('venta_id', v_venta, 'monto_aplicado', round(v_monto, 2))),
        NULL, NULL, 'Nota de crédito por devolución aplicada a la venta', v_uid);
      UPDATE public.cobros SET devolucion_id = v_id WHERE id = v_cobro;
    END IF;
    -- Lo que no cupo en la venta queda como saldo a favor (la nota sigue vigente).
  END IF;

  -- Devolución de dinero (D-032): turno de caja abierto → retiro de caja.
  IF v_dinero > 0.009 AND COALESCE(v_metodo, 'efectivo') = 'efectivo' THEN
    SELECT t.id INTO v_turno FROM public.caja_turnos t
     WHERE t.empresa_id = v_emp AND t.cajero_id = v_uid AND t.status = 'abierto'
     ORDER BY t.abierto_at DESC LIMIT 1;
    IF v_turno IS NOT NULL THEN
      INSERT INTO public.caja_movimientos (empresa_id, turno_id, tipo, monto, motivo, user_id)
      VALUES (v_emp, v_turno, 'retiro', round(v_dinero, 2), 'Devolución de dinero al cliente', v_uid)
      RETURNING id INTO v_mov;
      UPDATE public.devoluciones SET turno_id = v_turno, caja_movimiento_id = v_mov WHERE id = v_id;
    END IF;
  END IF;
  -- Sin caja y pedido explícito: egreso en Gastos ligado a la devolución (no a la venta).
  IF v_dinero > 0.009 AND v_mov IS NULL AND COALESCE((p_devolucion->>'registrar_gasto')::boolean, false) THEN
    INSERT INTO public.gastos (empresa_id, vendedor_id, user_id, fecha, concepto, monto, metodo_pago, devolucion_id, notas)
    VALUES (v_emp, v_vend, v_uid, v_fecha, 'Reembolso de devolución', round(v_dinero, 2),
            COALESCE(v_metodo, 'efectivo'), v_id, NULLIF(p_devolucion->>'notas', ''));
  END IF;

  RETURN v_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.registrar_devolucion(jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_devolucion(jsonb, jsonb) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) D-049: cancelar la venta NO cancela sus devoluciones ni el gasto de su reembolso
--    (documento propio, se cancela con cancelar_devolucion). _cancelar_devoluciones_venta
--    queda sin efecto; cancelar_venta no se modifica.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._cancelar_devoluciones_venta(p_venta_id uuid, p_uid uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- D-049: sin efecto. Se conserva la firma por compatibilidad.
  RETURN 0;
END;
$function$;

DO $do$
DECLARE
  v_def text;
  v_new text;
BEGIN
  -- Inventario de la venta: lo devuelto con destino (F1) es independiente de la venta.
  -- Solo los renglones anteriores a F1 conservan la regla «no regresar lo ya devuelto».
  SELECT pg_get_functiondef('public.fn_sync_venta_inventario(uuid)'::regprocedure) INTO v_def;
  IF position('dl.destino IS NULL' in v_def) = 0 THEN
    v_new := replace(v_def, 'WHERE d.venta_id = p_venta_id', 'WHERE d.venta_id = p_venta_id AND dl.destino IS NULL');
    IF v_new = v_def THEN RAISE EXCEPTION 'F1: patrón no encontrado en fn_sync_venta_inventario'; END IF;
    EXECUTE v_new;
  END IF;

  -- Liquidación (coordinado con F3): el dinero devuelto que salió de una caja (D-032) ya no
  -- se descuenta del efectivo que entrega el vendedor. Único cambio a la fórmula de F0.
  SELECT pg_get_functiondef('public.fn_liquidacion_esperado(uuid,uuid,date,date,uuid)'::regprocedure) INTO v_def;
  IF position('d.turno_id IS NULL' in v_def) = 0 THEN
    v_new := replace(v_def, 'AND dl.accion = ''devolucion_dinero''', 'AND dl.accion = ''devolucion_dinero'' AND d.turno_id IS NULL');
    IF v_new = v_def THEN RAISE EXCEPTION 'F1: patrón no encontrado en fn_liquidacion_esperado'; END IF;
    EXECUTE v_new;
  END IF;
END
$do$;
