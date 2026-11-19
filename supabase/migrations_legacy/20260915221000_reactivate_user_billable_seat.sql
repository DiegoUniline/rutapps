-- Reactivar no debe quedar bloqueado por subscriptions.max_usuarios: ese campo
-- representa la cantidad facturable vigente (con piso del plan), no un techo
-- rígido. El orquestador user-lifecycle sincroniza la nueva cantidad con Stripe.
CREATE OR REPLACE FUNCTION public.reactivar_usuario(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_estado text;
  v_archivado_en timestamptz;
  v_active_before int;
BEGIN
  SELECT empresa_id, estado, archivado_en
  INTO v_empresa_id, v_estado, v_archivado_en
  FROM public.profiles
  WHERE id = p_profile_id
  FOR UPDATE;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF NOT public.is_empresa_admin(auth.uid(), v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado: requiere permisos de administrador';
  END IF;

  IF v_estado = 'activo' AND v_archivado_en IS NULL THEN
    RETURN jsonb_build_object(
      'reactivado', true,
      'already_active', true,
      'profile_id', p_profile_id
    );
  END IF;

  SELECT COUNT(*) INTO v_active_before
  FROM public.profiles
  WHERE empresa_id = v_empresa_id
    AND estado = 'activo'
    AND archivado_en IS NULL;

  UPDATE public.profiles
  SET estado = 'activo',
      archivado_en = NULL,
      archivado_por = NULL,
      archivado_motivo = NULL
  WHERE id = p_profile_id;

  RETURN jsonb_build_object(
    'reactivado', true,
    'already_active', false,
    'profile_id', p_profile_id,
    'usuarios_activos_antes', v_active_before,
    'usuarios_activos_despues', v_active_before + 1
  );
END;
$$;
