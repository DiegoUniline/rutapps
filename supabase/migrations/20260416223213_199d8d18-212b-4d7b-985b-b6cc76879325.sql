
ALTER TABLE public.role_permisos SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

ALTER TABLE public.movimientos_inventario SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='visitas') THEN
    EXECUTE 'ALTER TABLE public.visitas SET (autovacuum_vacuum_scale_factor = 0.05, autovacuum_analyze_scale_factor = 0.05)';
  END IF;
END $$;

DELETE FROM auth.refresh_tokens WHERE updated_at < NOW() - INTERVAL '30 days';

CREATE TABLE IF NOT EXISTS public.maintenance_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ejecutado_por uuid NOT NULL,
  ejecutado_en timestamptz NOT NULL DEFAULT now(),
  tablas_procesadas text[] NOT NULL DEFAULT '{}',
  duracion_ms integer NOT NULL DEFAULT 0,
  notas text
);

ALTER TABLE public.maintenance_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can view maintenance log" ON public.maintenance_log;
CREATE POLICY "Super admins can view maintenance log"
ON public.maintenance_log
FOR SELECT
USING (public.is_super_admin(auth.uid()));

DROP POLICY IF EXISTS "Super admins can insert maintenance log" ON public.maintenance_log;
CREATE POLICY "Super admins can insert maintenance log"
ON public.maintenance_log
FOR INSERT
WITH CHECK (public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.get_database_health()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_result jsonb;
  v_db_size text;
  v_db_size_bytes bigint;
  v_top_tables jsonb;
  v_bloat_tables jsonb;
  v_storage_buckets jsonb;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de super administrador';
  END IF;

  SELECT pg_size_pretty(pg_database_size(current_database())),
         pg_database_size(current_database())
  INTO v_db_size, v_db_size_bytes;

  SELECT jsonb_agg(t) INTO v_top_tables
  FROM (
    SELECT
      schemaname || '.' || relname AS tabla,
      pg_size_pretty(pg_total_relation_size(schemaname || '.' || relname)) AS tamano,
      pg_total_relation_size(schemaname || '.' || relname) AS bytes,
      n_live_tup AS filas_vivas,
      n_dead_tup AS dead_tuples,
      CASE WHEN n_live_tup > 0
        THEN ROUND((n_dead_tup::numeric / n_live_tup::numeric) * 100, 2)
        ELSE 0 END AS bloat_pct,
      last_vacuum,
      last_autovacuum,
      last_analyze
    FROM pg_stat_user_tables
    WHERE schemaname = 'public'
    ORDER BY pg_total_relation_size(schemaname || '.' || relname) DESC
    LIMIT 10
  ) t;

  SELECT jsonb_agg(t) INTO v_bloat_tables
  FROM (
    SELECT
      schemaname || '.' || relname AS tabla,
      n_live_tup AS filas_vivas,
      n_dead_tup AS dead_tuples,
      CASE WHEN n_live_tup > 0
        THEN ROUND((n_dead_tup::numeric / n_live_tup::numeric) * 100, 2)
        ELSE 0 END AS bloat_pct,
      last_vacuum,
      last_autovacuum
    FROM pg_stat_user_tables
    WHERE schemaname = 'public' AND n_dead_tup > 100
    ORDER BY n_dead_tup DESC
    LIMIT 10
  ) t;

  BEGIN
    SELECT jsonb_agg(b) INTO v_storage_buckets
    FROM (
      SELECT
        bucket_id AS bucket,
        COUNT(*) AS num_archivos,
        pg_size_pretty(COALESCE(SUM((metadata->>'size')::bigint), 0)) AS tamano,
        COALESCE(SUM((metadata->>'size')::bigint), 0) AS bytes
      FROM storage.objects
      GROUP BY bucket_id
      ORDER BY COALESCE(SUM((metadata->>'size')::bigint), 0) DESC
    ) b;
  EXCEPTION WHEN OTHERS THEN
    v_storage_buckets := '[]'::jsonb;
  END;

  v_result := jsonb_build_object(
    'db_total_size', v_db_size,
    'db_total_bytes', v_db_size_bytes,
    'top_tables', COALESCE(v_top_tables, '[]'::jsonb),
    'bloat_tables', COALESCE(v_bloat_tables, '[]'::jsonb),
    'storage_buckets', COALESCE(v_storage_buckets, '[]'::jsonb),
    'generated_at', now()
  );

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.run_maintenance_vacuum(p_tables text[] DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_start timestamptz := clock_timestamp();
  v_duration_ms integer;
  v_tables text[];
  v_table text;
  v_log_id uuid;
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

  FOREACH v_table IN ARRAY v_tables LOOP
    IF v_table ~ '^public\.[a-z_][a-z0-9_]*$' AND EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public'
        AND tablename = split_part(v_table, '.', 2)
    ) THEN
      EXECUTE 'VACUUM ANALYZE ' || v_table;
    END IF;
  END LOOP;

  v_duration_ms := EXTRACT(EPOCH FROM (clock_timestamp() - v_start)) * 1000;

  INSERT INTO public.maintenance_log (ejecutado_por, tablas_procesadas, duracion_ms, notas)
  VALUES (auth.uid(), v_tables, v_duration_ms, 'VACUUM ANALYZE manual')
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'success', true,
    'log_id', v_log_id,
    'duracion_ms', v_duration_ms,
    'tablas_procesadas', v_tables
  );
END;
$$;
