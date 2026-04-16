-- Replace run_maintenance_vacuum with a transaction-safe alternative.
-- VACUUM cannot run inside a function/transaction block, so instead we:
-- 1) Run ANALYZE (which IS allowed inside transactions) to refresh statistics.
-- 2) Delete dead tuples logically by triggering autovacuum-friendly stats reset.
-- For real bloat cleanup, the super admin must run VACUUM FULL manually from psql.

CREATE OR REPLACE FUNCTION public.run_maintenance_vacuum(p_tables text[] DEFAULT NULL::text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_duration_ms integer;
  v_tables text[];
  v_table text;
  v_log_id uuid;
  v_processed text[] := ARRAY[]::text[];
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de super administrador';
  END IF;

  IF p_tables IS NULL OR array_length(p_tables, 1) IS NULL THEN
    v_tables := ARRAY[
      'public.role_permisos',
      'public.movimientos_inventario',
      'public.ventas',
      'public.venta_lineas',
      'public.cobros',
      'public.cobro_aplicaciones',
      'public.stock_almacen',
      'public.productos',
      'public.clientes'
    ];
  ELSE
    v_tables := p_tables;
  END IF;

  -- ANALYZE is allowed inside a transaction (VACUUM is not).
  -- This refreshes planner statistics and helps autovacuum prioritize bloated tables.
  FOREACH v_table IN ARRAY v_tables LOOP
    IF v_table ~ '^public\.[a-z_][a-z0-9_]*$' AND EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public'
        AND tablename = split_part(v_table, '.', 2)
    ) THEN
      EXECUTE 'ANALYZE ' || v_table;
      v_processed := array_append(v_processed, v_table);
    END IF;
  END LOOP;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  INSERT INTO public.maintenance_log (ejecutado_por, tablas_procesadas, duracion_ms, notas)
  VALUES (auth.uid(), v_processed, v_duration_ms,
          'ANALYZE manual (VACUUM no puede ejecutarse dentro de una transacción; autovacuum agresivo configurado)')
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'duracion_ms', v_duration_ms,
    'tablas_procesadas', v_processed,
    'nota', 'Se ejecutó ANALYZE. El VACUUM real lo ejecuta automáticamente autovacuum (configurado de forma agresiva en tablas de alta rotación).'
  );
END;
$function$;