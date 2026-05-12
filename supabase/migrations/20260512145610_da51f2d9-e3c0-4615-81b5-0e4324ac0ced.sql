-- 1. Nuevas columnas
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS archivado_en timestamptz,
  ADD COLUMN IF NOT EXISTS archivado_por uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS archivado_motivo text;

-- Índice para selectores que filtran por estado activo
CREATE INDEX IF NOT EXISTS idx_profiles_empresa_estado ON public.profiles(empresa_id, estado);

-- 2. Helper: ¿el caller es admin de esta empresa?
CREATE OR REPLACE FUNCTION public.is_empresa_admin(p_user_id uuid, p_empresa_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.is_super_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.profiles pr
      JOIN public.user_roles ur ON ur.user_id = pr.user_id
      JOIN public.roles r ON r.id = ur.role_id
      WHERE pr.user_id = p_user_id
        AND pr.empresa_id = p_empresa_id
        AND r.nombre = 'Administrador'
    );
$$;

-- 3. Resumen de pendientes antes de archivar
CREATE OR REPLACE FUNCTION public.get_user_archive_summary(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_user_id uuid;
  v_almacen_id uuid;
  v_entregas_pendientes int;
  v_rutas_activas int;
  v_ventas_borrador int;
  v_stock_items int;
  v_stock_total numeric;
BEGIN
  SELECT empresa_id, user_id, almacen_id
  INTO v_empresa_id, v_user_id, v_almacen_id
  FROM public.profiles WHERE id = p_profile_id;

  IF v_empresa_id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  IF NOT public.is_empresa_admin(auth.uid(), v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado: requiere permisos de administrador';
  END IF;

  SELECT COUNT(*) INTO v_entregas_pendientes
  FROM public.entregas
  WHERE empresa_id = v_empresa_id
    AND status NOT IN ('hecho', 'cancelado')
    AND (vendedor_id = p_profile_id OR vendedor_ruta_id = p_profile_id);

  SELECT COUNT(*) INTO v_rutas_activas
  FROM public.ruta_sesiones
  WHERE vendedor_id = p_profile_id AND status = 'abierta';

  SELECT COUNT(*) INTO v_ventas_borrador
  FROM public.ventas
  WHERE empresa_id = v_empresa_id
    AND vendedor_id = p_profile_id
    AND status IN ('borrador', 'confirmado')
    AND tipo IN ('pedido', 'venta_directa')
    AND COALESCE(saldo_pendiente, 0) > 0;

  IF v_almacen_id IS NOT NULL THEN
    SELECT COUNT(*), COALESCE(SUM(cantidad), 0)
    INTO v_stock_items, v_stock_total
    FROM public.stock_almacen
    WHERE almacen_id = v_almacen_id AND cantidad <> 0;
  ELSE
    v_stock_items := 0;
    v_stock_total := 0;
  END IF;

  RETURN jsonb_build_object(
    'profile_id', p_profile_id,
    'empresa_id', v_empresa_id,
    'almacen_id', v_almacen_id,
    'entregas_pendientes', v_entregas_pendientes,
    'rutas_activas', v_rutas_activas,
    'ventas_borrador_con_saldo', v_ventas_borrador,
    'stock_items', v_stock_items,
    'stock_total', v_stock_total,
    'puede_archivar', (
      v_entregas_pendientes = 0
      AND v_rutas_activas = 0
      AND COALESCE(v_stock_total, 0) = 0
    )
  );
END;
$$;

-- 4. Reasignar pendientes a otro usuario activo
CREATE OR REPLACE FUNCTION public.reasignar_pendientes_usuario(
  p_profile_id uuid,
  p_target_profile_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_target_empresa uuid;
  v_target_estado text;
  v_entregas int := 0;
  v_ventas int := 0;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.profiles WHERE id = p_profile_id;
  IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'Usuario origen no encontrado'; END IF;

  SELECT empresa_id, estado INTO v_target_empresa, v_target_estado
  FROM public.profiles WHERE id = p_target_profile_id;

  IF v_target_empresa IS NULL THEN RAISE EXCEPTION 'Usuario destino no encontrado'; END IF;
  IF v_target_empresa <> v_empresa_id THEN RAISE EXCEPTION 'El usuario destino debe ser de la misma empresa'; END IF;
  IF v_target_estado <> 'activo' THEN RAISE EXCEPTION 'El usuario destino debe estar activo'; END IF;
  IF p_profile_id = p_target_profile_id THEN RAISE EXCEPTION 'No se puede reasignar al mismo usuario'; END IF;

  IF NOT public.is_empresa_admin(auth.uid(), v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado: requiere permisos de administrador';
  END IF;

  -- Reasignar entregas pendientes (vendedor de ruta y vendedor)
  WITH upd AS (
    UPDATE public.entregas
    SET vendedor_ruta_id = p_target_profile_id
    WHERE empresa_id = v_empresa_id
      AND status NOT IN ('hecho', 'cancelado')
      AND vendedor_ruta_id = p_profile_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_entregas FROM upd;

  UPDATE public.entregas
  SET vendedor_id = p_target_profile_id
  WHERE empresa_id = v_empresa_id
    AND status NOT IN ('hecho', 'cancelado')
    AND vendedor_id = p_profile_id;

  -- Reasignar ventas borrador / pedidos pendientes (mantenemos histórico de entregadas/canceladas intacto)
  WITH upd2 AS (
    UPDATE public.ventas
    SET vendedor_id = p_target_profile_id
    WHERE empresa_id = v_empresa_id
      AND vendedor_id = p_profile_id
      AND status IN ('borrador', 'confirmado')
      AND tipo IN ('pedido', 'venta_directa')
      AND COALESCE(saldo_pendiente, 0) > 0
      AND COALESCE(entrega_inmediata, false) = false
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_ventas FROM upd2;

  RETURN jsonb_build_object(
    'entregas_reasignadas', v_entregas,
    'ventas_reasignadas', v_ventas
  );
END;
$$;

-- 5. Archivar usuario
CREATE OR REPLACE FUNCTION public.archivar_usuario(
  p_profile_id uuid,
  p_motivo text DEFAULT NULL,
  p_force boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_user_id uuid;
  v_summary jsonb;
BEGIN
  SELECT empresa_id, user_id INTO v_empresa_id, v_user_id
  FROM public.profiles WHERE id = p_profile_id FOR UPDATE;

  IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  IF NOT public.is_empresa_admin(auth.uid(), v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado: requiere permisos de administrador';
  END IF;

  -- No permitir archivar al owner de la empresa
  IF EXISTS (SELECT 1 FROM public.empresas WHERE id = v_empresa_id AND owner_user_id = v_user_id) THEN
    RAISE EXCEPTION 'No se puede archivar al propietario de la empresa';
  END IF;

  -- No permitir auto-archivado
  IF v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'No puedes archivar tu propio usuario';
  END IF;

  v_summary := public.get_user_archive_summary(p_profile_id);

  IF NOT p_force AND NOT (v_summary->>'puede_archivar')::boolean THEN
    RAISE EXCEPTION 'El usuario tiene pendientes. Reasigna entregas/rutas y vacía el almacén antes de archivar. Detalle: %', v_summary::text;
  END IF;

  UPDATE public.profiles
  SET estado = 'archivado',
      archivado_en = now(),
      archivado_por = auth.uid(),
      archivado_motivo = p_motivo
  WHERE id = p_profile_id;

  -- Revocar roles para que pierda permisos
  DELETE FROM public.user_roles WHERE user_id = v_user_id;

  RETURN jsonb_build_object('archivado', true, 'profile_id', p_profile_id, 'resumen_previo', v_summary);
END;
$$;

-- 6. Reactivar usuario
CREATE OR REPLACE FUNCTION public.reactivar_usuario(p_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_max int;
  v_active int;
BEGIN
  SELECT empresa_id INTO v_empresa_id FROM public.profiles WHERE id = p_profile_id FOR UPDATE;
  IF v_empresa_id IS NULL THEN RAISE EXCEPTION 'Usuario no encontrado'; END IF;

  IF NOT public.is_empresa_admin(auth.uid(), v_empresa_id) THEN
    RAISE EXCEPTION 'Acceso denegado: requiere permisos de administrador';
  END IF;

  SELECT COALESCE(max_usuarios, 999) INTO v_max FROM public.subscriptions WHERE empresa_id = v_empresa_id;
  SELECT COUNT(*) INTO v_active FROM public.profiles WHERE empresa_id = v_empresa_id AND estado = 'activo';

  IF v_active >= v_max THEN
    RAISE EXCEPTION 'Tu plan no tiene cupo disponible (% / %). Archiva otro usuario o actualiza tu plan.', v_active, v_max;
  END IF;

  UPDATE public.profiles
  SET estado = 'activo',
      archivado_en = NULL,
      archivado_por = NULL,
      archivado_motivo = NULL
  WHERE id = p_profile_id;

  RETURN jsonb_build_object('reactivado', true, 'profile_id', p_profile_id, 'cupo_usado', v_active + 1, 'cupo_max', v_max);
END;
$$;

-- 7. Conteo de usuarios activos para límite del plan
CREATE OR REPLACE FUNCTION public.count_active_users(p_empresa_id uuid)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM public.profiles WHERE empresa_id = p_empresa_id AND estado = 'activo';
$$;