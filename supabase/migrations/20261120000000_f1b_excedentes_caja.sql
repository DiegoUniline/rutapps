-- F1b (D-020, D-025, D-032): cada vez que un pago queda como saldo a favor o se devuelve el dinero,
-- se registra con fecha, usuario y venta (antes solo se acumulaba en cobros.saldo_favor_monto /
-- reembolso_monto, sin fecha). Si es devolución de dinero y quien la registra tiene un turno de caja
-- abierto, se anota como RETIRO de ese turno para que el arqueo lo reste (D-032).

CREATE TABLE IF NOT EXISTS public.cobro_excedentes (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES public.empresas(id),
  cliente_id         uuid REFERENCES public.clientes(id),
  cobro_id           uuid NOT NULL REFERENCES public.cobros(id),
  venta_id           uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  tipo               text NOT NULL CHECK (tipo IN ('saldo_favor', 'reembolso')),
  origen             text NOT NULL CHECK (origen IN ('correccion', 'cancelacion', 'previo')),
  monto              numeric(14,2) NOT NULL CHECK (monto > 0),
  user_id            uuid,
  turno_id           uuid REFERENCES public.caja_turnos(id),
  caja_movimiento_id uuid REFERENCES public.caja_movimientos(id),
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cobro_excedentes_cliente ON public.cobro_excedentes (empresa_id, cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cobro_excedentes_cobro ON public.cobro_excedentes (cobro_id);
CREATE INDEX IF NOT EXISTS idx_cobro_excedentes_turno ON public.cobro_excedentes (turno_id) WHERE turno_id IS NOT NULL;

ALTER TABLE public.cobro_excedentes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cobro_excedentes_select ON public.cobro_excedentes;
CREATE POLICY cobro_excedentes_select ON public.cobro_excedentes
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
-- Sin políticas de escritura: solo lo escriben las funciones de la BD.
REVOKE INSERT, UPDATE, DELETE ON public.cobro_excedentes FROM anon, authenticated;
GRANT SELECT ON public.cobro_excedentes TO authenticated;

-- Registro de un excedente (y retiro de caja si es devolución con turno abierto).
CREATE OR REPLACE FUNCTION public._registrar_excedente(
  p_cobro_id uuid, p_venta_id uuid, p_tipo text, p_origen text, p_monto numeric, p_uid uuid
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_emp   uuid;
  v_cli   uuid;
  v_folio text;
  v_turno uuid;
  v_mov   uuid;
BEGIN
  IF COALESCE(p_monto, 0) <= 0.009 THEN RETURN; END IF;
  SELECT empresa_id, cliente_id INTO v_emp, v_cli FROM public.cobros WHERE id = p_cobro_id;
  IF v_emp IS NULL THEN RETURN; END IF;
  SELECT folio INTO v_folio FROM public.ventas WHERE id = p_venta_id;

  IF p_tipo = 'reembolso' AND p_uid IS NOT NULL THEN
    SELECT id INTO v_turno
      FROM public.caja_turnos
     WHERE empresa_id = v_emp AND cajero_id = p_uid AND status = 'abierto'
     ORDER BY abierto_at DESC
     LIMIT 1;
    IF v_turno IS NOT NULL THEN
      INSERT INTO public.caja_movimientos (empresa_id, turno_id, tipo, monto, motivo, user_id)
      VALUES (v_emp, v_turno, 'retiro', round(p_monto, 2),
              'Devolución de dinero ' || COALESCE(v_folio, ''), p_uid)
      RETURNING id INTO v_mov;
    END IF;
  END IF;

  INSERT INTO public.cobro_excedentes
    (empresa_id, cliente_id, cobro_id, venta_id, tipo, origen, monto, user_id, turno_id, caja_movimiento_id)
  VALUES (v_emp, v_cli, p_cobro_id, p_venta_id, p_tipo, p_origen, round(p_monto, 2), p_uid, v_turno, v_mov);
END;
$function$;
REVOKE ALL ON FUNCTION public._registrar_excedente(uuid, uuid, text, text, numeric, uuid) FROM PUBLIC, anon, authenticated;

-- Excedente por corrección (Editar venta, Ajustar entrega, cierre parcial): ahora deja registro.
CREATE OR REPLACE FUNCTION public._resolver_excedente_venta(p_venta_id uuid, p_destino text, p_uid uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_base numeric;
  v_pagado numeric;
  v_exc numeric;
  v_rest numeric;
  v_take numeric;
  a record;
BEGIN
  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  IF NOT FOUND THEN RETURN 0; END IF;
  v_base := CASE WHEN v_venta.cerrado_at IS NOT NULL THEN COALESCE(v_venta.total_efectivo, v_venta.total) ELSE v_venta.total END;
  SELECT COALESCE(SUM(ca.monto_aplicado), 0) INTO v_pagado
    FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
   WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado';
  v_exc := round(v_pagado - COALESCE(v_base, 0), 2);
  IF v_exc <= 0.009 THEN RETURN 0; END IF;

  IF p_destino IS NULL THEN
    RAISE EXCEPTION 'EXCEDENTE|%|El nuevo total (%) queda abajo de lo ya pagado (%).', v_exc, round(COALESCE(v_base,0),2), round(v_pagado,2)
      USING ERRCODE = 'P0001';
  END IF;
  IF p_destino = 'nada' THEN RETURN 0; END IF;
  IF p_destino NOT IN ('saldo_favor','reembolso') THEN
    RAISE EXCEPTION 'Destino del excedente inválido: saldo_favor, reembolso o nada' USING ERRCODE = '22023';
  END IF;

  v_rest := v_exc;
  FOR a IN
    SELECT ca.id, ca.cobro_id, ca.monto_aplicado
      FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
     WHERE ca.venta_id = p_venta_id AND COALESCE(c.status,'activo') <> 'cancelado' AND ca.monto_aplicado > 0
     ORDER BY c.fecha DESC, c.created_at DESC, ca.created_at DESC
     FOR UPDATE OF ca
  LOOP
    EXIT WHEN v_rest <= 0.009;
    v_take := LEAST(a.monto_aplicado, v_rest);
    IF a.monto_aplicado - v_take <= 0.009 THEN
      DELETE FROM public.cobro_aplicaciones WHERE id = a.id;
    ELSE
      UPDATE public.cobro_aplicaciones SET monto_aplicado = monto_aplicado - v_take WHERE id = a.id;
    END IF;
    IF p_destino = 'saldo_favor' THEN
      UPDATE public.cobros SET saldo_favor_monto = saldo_favor_monto + v_take WHERE id = a.cobro_id;
    ELSE
      UPDATE public.cobros SET reembolso_monto = reembolso_monto + v_take WHERE id = a.cobro_id;
    END IF;
    PERFORM public._registrar_excedente(a.cobro_id, p_venta_id, p_destino, 'correccion', v_take, p_uid);
    v_rest := v_rest - v_take;
  END LOOP;

  PERFORM public.fn_recalc_venta_saldo(p_venta_id);
  PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id,
    CASE WHEN p_destino = 'saldo_favor' THEN 'excedente_saldo_favor' ELSE 'excedente_reembolso' END,
    jsonb_build_object('monto', v_exc - v_rest, 'user_id', p_uid));
  RETURN v_exc - v_rest;
END;
$function$;

-- Cancelar venta (F1b): igual que antes + registro del destino del dinero.
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
  v_uid    uuid := auth.uid();
  v_venta  public.ventas%ROWTYPE;
  v_pagado numeric;
  a        record;
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

  IF v_pagado > 0.009 THEN
    IF p_destino_pago IS NULL THEN
      RAISE EXCEPTION 'PAGADA|%|La venta % tiene pagos por %.', v_pagado, v_venta.folio, v_pagado
        USING ERRCODE = 'P0001';
    END IF;
    IF p_destino_pago NOT IN ('cancelar_pago', 'saldo_favor', 'reembolso') THEN
      RAISE EXCEPTION 'Destino del pago inválido: cancelar_pago, saldo_favor o reembolso' USING ERRCODE = '22023';
    END IF;

    IF p_destino_pago = 'cancelar_pago' THEN
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
      FOR a IN
        SELECT ca.id, ca.cobro_id, ca.monto_aplicado
          FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
         WHERE ca.venta_id = p_venta_id AND COALESCE(c.status, 'activo') <> 'cancelado' AND ca.monto_aplicado > 0
         FOR UPDATE OF ca
      LOOP
        DELETE FROM public.cobro_aplicaciones WHERE id = a.id;
        IF p_destino_pago = 'saldo_favor' THEN
          UPDATE public.cobros SET saldo_favor_monto = saldo_favor_monto + a.monto_aplicado WHERE id = a.cobro_id;
        ELSE
          UPDATE public.cobros SET reembolso_monto = reembolso_monto + a.monto_aplicado WHERE id = a.cobro_id;
        END IF;
        PERFORM public._registrar_excedente(a.cobro_id, p_venta_id, p_destino_pago, 'cancelacion', a.monto_aplicado, v_uid);
      END LOOP;
    END IF;
  END IF;

  UPDATE public.ventas SET status = 'cancelado' WHERE id = p_venta_id;
  PERFORM public.fn_recalc_venta_saldo(p_venta_id);

  PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id, 'cancelada',
    jsonb_build_object(
      'status', jsonb_build_object('anterior', v_venta.status::text, 'nuevo', 'cancelado'),
      'pagado', v_pagado,
      'destino_pago', CASE WHEN v_pagado > 0.009 THEN p_destino_pago END,
      'motivo', NULLIF(btrim(COALESCE(p_motivo, '')), ''),
      'user_id', v_uid));

  RETURN jsonb_build_object('venta_id', p_venta_id, 'pagado', v_pagado,
                            'destino_pago', CASE WHEN v_pagado > 0.009 THEN p_destino_pago END);
END;
$function$;

-- Saldo a favor por cliente de la empresa (misma regla que saldo_a_favor_cliente), para listados.
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
REVOKE ALL ON FUNCTION public.saldos_a_favor_empresa() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.saldos_a_favor_empresa() TO authenticated, service_role;

-- Registro de lo que ya había antes de esta tabla (sin fecha exacta: se usa la del cobro).
INSERT INTO public.cobro_excedentes (empresa_id, cliente_id, cobro_id, tipo, origen, monto, created_at)
SELECT c.empresa_id, c.cliente_id, c.id, 'saldo_favor', 'previo', round(c.saldo_favor_monto, 2), c.created_at
  FROM public.cobros c
 WHERE c.saldo_favor_monto > 0.009
   AND NOT EXISTS (SELECT 1 FROM public.cobro_excedentes x WHERE x.cobro_id = c.id AND x.tipo = 'saldo_favor');
INSERT INTO public.cobro_excedentes (empresa_id, cliente_id, cobro_id, tipo, origen, monto, created_at)
SELECT c.empresa_id, c.cliente_id, c.id, 'reembolso', 'previo', round(c.reembolso_monto, 2), c.created_at
  FROM public.cobros c
 WHERE c.reembolso_monto > 0.009
   AND NOT EXISTS (SELECT 1 FROM public.cobro_excedentes x WHERE x.cobro_id = c.id AND x.tipo = 'reembolso');
