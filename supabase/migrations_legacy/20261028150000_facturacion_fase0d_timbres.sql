-- =====================================================================
-- Facturación · Fase 0-D (D-013): timbres
-- S-07  Abono de timbres pagados por Stripe UNA sola vez por pago
--       (referencia_externa única). Lo usan purchase-timbres, stripe-webhook
--       y admin-billing con service_role.
-- RPCs de timbres: deduct/reserve/confirm/release solo service_role
--       (hoy PUBLIC puede ejecutarlas: liberar reservas ajenas = timbres gratis).
-- Idempotente. Todo o nada. Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

ALTER TABLE public.timbres_movimientos ADD COLUMN IF NOT EXISTS referencia_externa text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_timbres_movimientos_referencia_externa
  ON public.timbres_movimientos (referencia_externa) WHERE referencia_externa IS NOT NULL;

-- Devuelve el saldo nuevo, o NULL si esa referencia ya se había abonado.
CREATE OR REPLACE FUNCTION public.acreditar_timbres_pago(
  p_empresa_id uuid, p_cantidad integer, p_user_id uuid, p_notas text, p_referencia text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_actual integer;
  v_saldo_nuevo integer;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'No autorizado para abonar timbres' USING ERRCODE = '42501';
  END IF;
  IF p_referencia IS NULL OR btrim(p_referencia) = '' THEN
    RAISE EXCEPTION 'referencia requerida';
  END IF;
  IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
    RAISE EXCEPTION 'cantidad inválida';
  END IF;

  INSERT INTO timbres_saldo (empresa_id, saldo) VALUES (p_empresa_id, 0)
  ON CONFLICT (empresa_id) DO NOTHING;

  -- El bloqueo del saldo serializa abonos simultáneos de la misma empresa.
  SELECT saldo INTO v_saldo_actual FROM timbres_saldo
  WHERE empresa_id = p_empresa_id FOR UPDATE;

  IF EXISTS (SELECT 1 FROM timbres_movimientos WHERE referencia_externa = p_referencia) THEN
    RETURN NULL;
  END IF;

  v_saldo_nuevo := v_saldo_actual + p_cantidad;
  UPDATE timbres_saldo SET saldo = v_saldo_nuevo, updated_at = now()
  WHERE empresa_id = p_empresa_id;

  INSERT INTO timbres_movimientos (empresa_id, tipo, cantidad, saldo_anterior, saldo_nuevo, user_id, notas, referencia_externa)
  VALUES (p_empresa_id, 'compra', p_cantidad, v_saldo_actual, v_saldo_nuevo, p_user_id,
          COALESCE(p_notas, 'Compra de timbres'), p_referencia);

  RETURN v_saldo_nuevo;
END;
$$;

REVOKE ALL ON FUNCTION public.acreditar_timbres_pago(uuid, integer, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acreditar_timbres_pago(uuid, integer, uuid, text, text) TO service_role;

DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public.deduct_timbre(uuid, uuid, uuid)',
    'public.reserve_timbre(uuid, uuid)',
    'public.confirm_timbre_reserve(uuid, uuid)',
    'public.release_timbre(uuid, text)'
  ] LOOP
    IF to_regprocedure(f) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
    END IF;
  END LOOP;
END $$;

COMMIT;
