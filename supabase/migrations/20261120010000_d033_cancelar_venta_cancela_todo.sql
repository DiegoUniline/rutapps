-- D-033: cancelar una venta cancela TODO lo que cuelga de ella.
--  · Sus devoluciones quedan canceladas (ya no dan nota de crédito / saldo a favor).
--  · El gasto con que se reembolsó una devolución en efectivo se cancela (deja de contar como gasto)
--    y ese dinero se registra como «devolución de dinero» del cliente.
--  · La pregunta de qué hacer con lo pagado se hace solo por lo que falta (pagado − ya reembolsado).
--  El inventario de la devolución no se toca: el producto sí regresó (ver fix 20261119233000).
-- Gastos y devoluciones no se borran: se marcan con cancelado_at (historial, D-006).

ALTER TABLE public.gastos
  ADD COLUMN IF NOT EXISTS cancelado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_motivo text;
ALTER TABLE public.devoluciones
  ADD COLUMN IF NOT EXISTS cancelado_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid,
  ADD COLUMN IF NOT EXISTS cancelado_motivo text;

ALTER TABLE public.cobro_excedentes DROP CONSTRAINT IF EXISTS cobro_excedentes_origen_check;
ALTER TABLE public.cobro_excedentes ADD CONSTRAINT cobro_excedentes_origen_check
  CHECK (origen IN ('correccion', 'cancelacion', 'devolucion', 'previo'));

-- Saldo a favor: las devoluciones canceladas no cuentan.
CREATE OR REPLACE FUNCTION public.saldo_a_favor_cliente(p_cliente_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_emp uuid; v_emitido numeric; v_usado numeric;
BEGIN
  SELECT empresa_id INTO v_emp FROM public.clientes WHERE id = p_cliente_id;
  IF v_emp IS NULL THEN RETURN 0; END IF;
  IF COALESCE(auth.role(),'') <> 'service_role' AND v_emp IS DISTINCT FROM public.get_my_empresa_id()
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Sin acceso a este cliente' USING ERRCODE = '42501';
  END IF;
  SELECT COALESCE(SUM(dl.monto_credito), 0) INTO v_emitido
    FROM public.devolucion_lineas dl JOIN public.devoluciones d ON d.id = dl.devolucion_id
   WHERE d.cliente_id = p_cliente_id AND dl.accion::text = 'nota_credito' AND d.cancelado_at IS NULL;
  v_emitido := v_emitido + COALESCE((SELECT SUM(saldo_favor_monto) FROM public.cobros
                                     WHERE cliente_id = p_cliente_id AND COALESCE(status,'activo') <> 'cancelado'), 0);
  SELECT COALESCE(SUM(monto), 0) INTO v_usado FROM public.cobros
   WHERE cliente_id = p_cliente_id AND metodo_pago = 'saldo_favor' AND COALESCE(status,'activo') <> 'cancelado';
  RETURN GREATEST(0, round(v_emitido - v_usado, 2));
END;
$function$;

CREATE OR REPLACE FUNCTION public.saldos_a_favor_empresa()
RETURNS TABLE (cliente_id uuid, emitido numeric, usado numeric, disponible numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH emp AS (SELECT public.get_my_empresa_id() AS id),
  nc AS (
    SELECT d.cliente_id, SUM(COALESCE(dl.monto_credito, 0)) AS m
      FROM public.devoluciones d JOIN public.devolucion_lineas dl ON dl.devolucion_id = d.id, emp
     WHERE d.empresa_id = emp.id AND dl.accion::text = 'nota_credito' AND d.cliente_id IS NOT NULL
       AND d.cancelado_at IS NULL
     GROUP BY d.cliente_id),
  exc AS (
    SELECT c.cliente_id, SUM(COALESCE(c.saldo_favor_monto, 0)) AS m
      FROM public.cobros c, emp
     WHERE c.empresa_id = emp.id AND COALESCE(c.status, 'activo') <> 'cancelado' AND c.saldo_favor_monto > 0
     GROUP BY c.cliente_id),
  uso AS (
    SELECT c.cliente_id, SUM(COALESCE(c.monto, 0)) AS m
      FROM public.cobros c, emp
     WHERE c.empresa_id = emp.id AND COALESCE(c.status, 'activo') <> 'cancelado' AND c.metodo_pago = 'saldo_favor'
     GROUP BY c.cliente_id),
  ids AS (SELECT cliente_id FROM nc UNION SELECT cliente_id FROM exc UNION SELECT cliente_id FROM uso)
  SELECT ids.cliente_id,
         round(COALESCE(nc.m, 0) + COALESCE(exc.m, 0), 2) AS emitido,
         round(COALESCE(uso.m, 0), 2) AS usado,
         GREATEST(0, round(COALESCE(nc.m, 0) + COALESCE(exc.m, 0) - COALESCE(uso.m, 0), 2)) AS disponible
    FROM ids
    LEFT JOIN nc ON nc.cliente_id = ids.cliente_id
    LEFT JOIN exc ON exc.cliente_id = ids.cliente_id
    LEFT JOIN uso ON uso.cliente_id = ids.cliente_id
   WHERE ids.cliente_id IS NOT NULL;
$function$;

-- Cancela devoluciones de la venta y sus gastos de reembolso. Devuelve lo ya reembolsado en efectivo.
CREATE OR REPLACE FUNCTION public._cancelar_devoluciones_venta(p_venta_id uuid, p_uid uuid)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_reemb numeric;
BEGIN
  SELECT COALESCE(SUM(g.monto), 0) INTO v_reemb
    FROM public.gastos g
   WHERE g.venta_id = p_venta_id AND g.devolucion_id IS NOT NULL AND g.cancelado_at IS NULL;

  UPDATE public.gastos
     SET cancelado_at = now(), cancelado_por = p_uid, cancelado_motivo = 'Venta cancelada'
   WHERE venta_id = p_venta_id AND devolucion_id IS NOT NULL AND cancelado_at IS NULL;
  UPDATE public.devoluciones
     SET cancelado_at = now(), cancelado_por = p_uid, cancelado_motivo = 'Venta cancelada'
   WHERE venta_id = p_venta_id AND cancelado_at IS NULL;

  RETURN round(v_reemb, 2);
END;
$function$;
REVOKE ALL ON FUNCTION public._cancelar_devoluciones_venta(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_venta(
  p_venta_id uuid,
  p_destino_pago text DEFAULT NULL,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid     uuid := auth.uid();
  v_venta   public.ventas%ROWTYPE;
  v_pagado  numeric;
  v_dev     numeric;   -- ya reembolsado en efectivo por devoluciones (gasto)
  v_resto   numeric;   -- lo que falta decidir
  v_dev_rest numeric;
  v_take    numeric;
  a         record;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Venta no encontrada' USING ERRCODE = 'P0002';
  END IF;
  IF v_venta.empresa_id IS DISTINCT FROM public.get_my_empresa_id() AND NOT public.is_super_admin(v_uid) THEN
    RAISE EXCEPTION 'Sin acceso a esta venta' USING ERRCODE = '42501';
  END IF;
  IF v_venta.status::text = 'cancelado' THEN
    RAISE EXCEPTION 'La venta ya está cancelada.' USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
    FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
   WHERE ca.venta_id = p_venta_id AND COALESCE(c.status, 'activo') <> 'cancelado';
  v_pagado := round(v_pagado, 2);

  SELECT COALESCE(SUM(g.monto), 0) INTO v_dev
    FROM public.gastos g
   WHERE g.venta_id = p_venta_id AND g.devolucion_id IS NOT NULL AND g.cancelado_at IS NULL;
  v_dev := LEAST(round(v_dev, 2), v_pagado);
  v_resto := round(v_pagado - v_dev, 2);

  IF v_resto > 0.009 THEN
    IF p_destino_pago IS NULL THEN
      RAISE EXCEPTION 'PAGADA|%|La venta % tiene pagos por %.', v_resto, v_venta.folio,
        CASE WHEN v_dev > 0.009 THEN v_resto || ' (ya se devolvieron ' || v_dev || ' en la devolución)' ELSE v_resto::text END
        USING ERRCODE = 'P0001';
    END IF;
    IF p_destino_pago NOT IN ('cancelar_pago', 'saldo_favor', 'reembolso') THEN
      RAISE EXCEPTION 'Destino del pago inválido: cancelar_pago, saldo_favor o reembolso' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_pagado > 0.009 THEN
    IF v_resto > 0.009 AND p_destino_pago = 'cancelar_pago' THEN
      IF EXISTS (
        SELECT 1 FROM public.cobro_aplicaciones ca
         WHERE ca.cobro_id IN (SELECT cobro_id FROM public.cobro_aplicaciones WHERE venta_id = p_venta_id)
           AND ca.venta_id <> p_venta_id)
      THEN
        RAISE EXCEPTION 'Un pago de esta venta también cubre otras ventas: elige dejarlo como saldo a favor o registrar la devolución.'
          USING ERRCODE = '22023';
      END IF;
      UPDATE public.cobros SET status = 'cancelado'
       WHERE id IN (SELECT cobro_id FROM public.cobro_aplicaciones WHERE venta_id = p_venta_id)
         AND COALESCE(status, 'activo') <> 'cancelado';
    ELSE
      -- Primero lo que ya se devolvió en la devolución (sin tocar caja: el dinero ya salió entonces);
      -- el resto según el destino elegido.
      v_dev_rest := v_dev;
      FOR a IN
        SELECT ca.id, ca.cobro_id, ca.monto_aplicado
          FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
         WHERE ca.venta_id = p_venta_id AND COALESCE(c.status, 'activo') <> 'cancelado' AND ca.monto_aplicado > 0
         FOR UPDATE OF ca
      LOOP
        DELETE FROM public.cobro_aplicaciones WHERE id = a.id;
        v_take := LEAST(a.monto_aplicado, v_dev_rest);
        IF v_take > 0.009 THEN
          UPDATE public.cobros SET reembolso_monto = reembolso_monto + v_take WHERE id = a.cobro_id;
          INSERT INTO public.cobro_excedentes (empresa_id, cliente_id, cobro_id, venta_id, tipo, origen, monto, user_id)
          SELECT c.empresa_id, c.cliente_id, c.id, p_venta_id, 'reembolso', 'devolucion', round(v_take, 2), v_uid
            FROM public.cobros c WHERE c.id = a.cobro_id;
          v_dev_rest := v_dev_rest - v_take;
        END IF;
        v_take := a.monto_aplicado - GREATEST(v_take, 0);
        IF v_take > 0.009 THEN
          IF p_destino_pago = 'saldo_favor' THEN
            UPDATE public.cobros SET saldo_favor_monto = saldo_favor_monto + v_take WHERE id = a.cobro_id;
          ELSE
            UPDATE public.cobros SET reembolso_monto = reembolso_monto + v_take WHERE id = a.cobro_id;
          END IF;
          PERFORM public._registrar_excedente(a.cobro_id, p_venta_id, COALESCE(p_destino_pago, 'reembolso'), 'cancelacion', v_take, v_uid);
        END IF;
      END LOOP;
    END IF;
  END IF;

  PERFORM public._cancelar_devoluciones_venta(p_venta_id, v_uid);
  UPDATE public.ventas SET status = 'cancelado' WHERE id = p_venta_id;
  PERFORM public.fn_recalc_venta_saldo(p_venta_id);

  PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id, 'cancelada',
    jsonb_build_object(
      'status', jsonb_build_object('anterior', v_venta.status::text, 'nuevo', 'cancelado'),
      'pagado', v_pagado,
      'ya_devuelto', v_dev,
      'destino_pago', CASE WHEN v_resto > 0.009 THEN p_destino_pago END,
      'motivo', NULLIF(btrim(COALESCE(p_motivo, '')), ''),
      'user_id', v_uid));

  RETURN jsonb_build_object('venta_id', p_venta_id, 'pagado', v_pagado, 'ya_devuelto', v_dev,
                            'destino_pago', CASE WHEN v_resto > 0.009 THEN p_destino_pago END);
END;
$function$;

-- Ventas ya canceladas (en esta base: VTA-0001): cancelar sus devoluciones y gastos de reembolso.
DO $fix$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT v.id FROM public.ventas v
      JOIN public.devoluciones d ON d.venta_id = v.id AND d.cancelado_at IS NULL
     WHERE v.status::text = 'cancelado'
  LOOP
    PERFORM public._cancelar_devoluciones_venta(r.id, NULL);
  END LOOP;
END
$fix$;
