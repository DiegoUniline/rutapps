-- F1b (D-020): cancelar venta en una sola operación. Si tiene pagos, el usuario elige:
--   cancelar_pago : el pago se cancela (solo si no cubre otras ventas)
--   saldo_favor   : el pago se desaplica y queda como saldo a favor del cliente
--   reembolso     : el pago se desaplica y se registra que se devolvió el dinero
-- Sin destino y con pagos → error 'PAGADA|<monto>|<mensaje>' para que el front pregunte.

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
      END LOOP;
    END IF;
  END IF;

  -- Inventario: lo regresa trg_ventas_sync_inventario. Pedido con entregas: lo bloquea
  -- trg_bloquear_cancelar_pedido_con_entregas.
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

REVOKE ALL ON FUNCTION public.cancelar_venta(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_venta(uuid, text, text) TO authenticated, service_role;
