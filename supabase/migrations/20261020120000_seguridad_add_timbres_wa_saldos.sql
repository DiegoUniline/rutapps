-- =====================================================================
-- RutApp · Seguridad S-02 y S-11 (auditoría 2026-10-20)
-- S-02 add_timbres: hoy cualquier usuario puede abonarse timbres a cualquier
--      empresa. Ahora solo service_role (purchase-timbres, admin-billing) o
--      super admin (pantallas de admin). Mismo cuerpo, se agrega el chequeo.
-- S-11 wa_clientes_saldos: hoy cualquier usuario lee clientes y saldos de
--      otra empresa. Solo la usan edge functions con service_role.
-- Seguro: si add_timbres en producción no es idéntica a la del repo, aborta
-- sin cambiar nada. Idempotente. Todo o nada. Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $guard$
DECLARE v_md5 text;
BEGIN
  SELECT md5(p.prosrc) INTO v_md5
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'add_timbres';
  IF v_md5 IS NULL THEN
    RAISE EXCEPTION 'add_timbres no existe en producción; no se aplica nada';
  END IF;
  IF v_md5 NOT IN ('d365b1c2c71a53714e7a0743df7e289c', '0d62c5ae02541ac223a6ba7f2c898f83') THEN
    RAISE EXCEPTION 'add_timbres en producción difiere del repo (md5 %); no se aplica nada', v_md5;
  END IF;
END
$guard$;

CREATE OR REPLACE FUNCTION public.add_timbres(p_empresa_id uuid, p_cantidad integer, p_user_id uuid, p_notas text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_actual integer;
  v_saldo_nuevo integer;
BEGIN
  -- S-02: solo el servidor (service_role) o un super admin puede abonar timbres.
  IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado para abonar timbres' USING ERRCODE = '42501';
  END IF;

  -- Upsert saldo
  INSERT INTO timbres_saldo (empresa_id, saldo)
  VALUES (p_empresa_id, 0)
  ON CONFLICT (empresa_id) DO NOTHING;

  SELECT saldo INTO v_saldo_actual
  FROM timbres_saldo
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  v_saldo_nuevo := v_saldo_actual + p_cantidad;

  UPDATE timbres_saldo
  SET saldo = v_saldo_nuevo, updated_at = now()
  WHERE empresa_id = p_empresa_id;

  INSERT INTO timbres_movimientos (empresa_id, tipo, cantidad, saldo_anterior, saldo_nuevo, user_id, notas)
  VALUES (p_empresa_id, 'compra', p_cantidad, v_saldo_actual, v_saldo_nuevo, p_user_id, COALESCE(p_notas, 'Recarga de timbres'));

  RETURN v_saldo_nuevo;
END;
$$;

REVOKE ALL ON FUNCTION public.add_timbres(uuid, integer, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_timbres(uuid, integer, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.wa_clientes_saldos(uuid, text, boolean, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.wa_clientes_saldos(uuid, text, boolean, int) TO service_role;

COMMIT;
