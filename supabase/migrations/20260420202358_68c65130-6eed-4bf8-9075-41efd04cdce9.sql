CREATE OR REPLACE FUNCTION public.get_optimization_quota(_empresa_id uuid)
 RETURNS TABLE(usuarios_activos integer, cuota_base integer, recargas_disponibles integer, cuota_total integer, usadas_mes_actual integer, disponibles integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_usuarios INTEGER;
  v_base INTEGER;
  v_recargas INTEGER;
  v_usadas INTEGER;
  v_first_of_month TIMESTAMPTZ;
BEGIN
  v_first_of_month := date_trunc('month', now());

  SELECT COUNT(*)::INTEGER INTO v_usuarios
  FROM public.profiles
  WHERE empresa_id = _empresa_id AND estado = 'activo';

  v_base := COALESCE(v_usuarios, 0) * 30;

  SELECT COALESCE(SUM(cantidad_creditos - creditos_consumidos), 0)::INTEGER INTO v_recargas
  FROM public.optimizacion_recargas
  WHERE empresa_id = _empresa_id
    AND status = 'paid'
    AND cantidad_creditos > creditos_consumidos;

  SELECT COUNT(*)::INTEGER INTO v_usadas
  FROM public.optimizacion_rutas_log
  WHERE empresa_id = _empresa_id
    AND created_at >= v_first_of_month;

  RETURN QUERY SELECT
    v_usuarios,
    v_base,
    v_recargas,
    v_base + v_recargas,
    v_usadas,
    GREATEST(0, (v_base + v_recargas) - v_usadas);
END;
$function$;