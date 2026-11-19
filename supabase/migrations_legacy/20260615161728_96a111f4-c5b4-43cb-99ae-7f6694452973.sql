-- Reserva atómica: descuenta 1 timbre y devuelve el id de la reserva
CREATE OR REPLACE FUNCTION public.reserve_timbre(p_empresa_id uuid, p_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_saldo_actual integer;
  v_mov_id uuid;
BEGIN
  SELECT saldo INTO v_saldo_actual
  FROM timbres_saldo
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_saldo_actual IS NULL OR v_saldo_actual < 1 THEN
    RETURN NULL;
  END IF;

  UPDATE timbres_saldo
  SET saldo = saldo - 1, updated_at = now()
  WHERE empresa_id = p_empresa_id;

  INSERT INTO timbres_movimientos (empresa_id, tipo, cantidad, saldo_anterior, saldo_nuevo, referencia_id, user_id, notas)
  VALUES (p_empresa_id, 'reserva', -1, v_saldo_actual, v_saldo_actual - 1, NULL, p_user_id, 'Reserva previa a timbrado Facturama')
  RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$;

-- Confirma la reserva: actualiza el movimiento a tipo 'uso' y vincula el cfdi
CREATE OR REPLACE FUNCTION public.confirm_timbre_reserve(p_reservation_id uuid, p_cfdi_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_existed boolean;
BEGIN
  UPDATE timbres_movimientos
  SET tipo = 'uso',
      referencia_id = p_cfdi_id,
      notas = 'Timbre usado para CFDI (confirmado)'
  WHERE id = p_reservation_id
    AND tipo = 'reserva'
  RETURNING true INTO v_existed;

  RETURN COALESCE(v_existed, false);
END;
$$;

-- Libera la reserva: devuelve +1 al saldo y deja un movimiento de auditoría
CREATE OR REPLACE FUNCTION public.release_timbre(p_reservation_id uuid, p_motivo text DEFAULT 'Liberación de reserva')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa_id uuid;
  v_user_id uuid;
  v_saldo_actual integer;
  v_already_released boolean;
BEGIN
  -- Sólo procesar si aún es una reserva (no si ya fue confirmada como 'uso')
  SELECT empresa_id, user_id
  INTO v_empresa_id, v_user_id
  FROM timbres_movimientos
  WHERE id = p_reservation_id
    AND tipo = 'reserva'
  FOR UPDATE;

  IF v_empresa_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT saldo INTO v_saldo_actual
  FROM timbres_saldo
  WHERE empresa_id = v_empresa_id
  FOR UPDATE;

  UPDATE timbres_saldo
  SET saldo = saldo + 1, updated_at = now()
  WHERE empresa_id = v_empresa_id;

  -- Marca la reserva como liberada
  UPDATE timbres_movimientos
  SET tipo = 'reserva_liberada',
      notas = COALESCE(p_motivo, 'Liberación de reserva')
  WHERE id = p_reservation_id;

  -- Movimiento espejo (+1) para que la suma de saldos cuadre con el log
  INSERT INTO timbres_movimientos (empresa_id, tipo, cantidad, saldo_anterior, saldo_nuevo, referencia_id, user_id, notas)
  VALUES (v_empresa_id, 'liberacion', 1, COALESCE(v_saldo_actual, 0), COALESCE(v_saldo_actual, 0) + 1, p_reservation_id, v_user_id, p_motivo);

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_timbre(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.confirm_timbre_reserve(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_timbre(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_timbre(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.confirm_timbre_reserve(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_timbre(uuid, text) TO service_role;