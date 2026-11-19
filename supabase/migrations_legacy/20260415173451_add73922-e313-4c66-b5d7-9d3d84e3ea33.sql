
-- 1. Drop triggers and function
DROP TRIGGER IF EXISTS trg_sync_profile_vendedor ON public.profiles;
DROP TRIGGER IF EXISTS trg_sync_profile_vendedor_cobrador ON public.profiles;
DROP TRIGGER IF EXISTS on_profile_sync ON public.profiles;
DROP FUNCTION IF EXISTS public.sync_profile_to_vendedor_cobrador() CASCADE;

-- 2. Clean orphan references and re-point FKs
DO $$
DECLARE
  v_rec RECORD;
  v_pairs TEXT[][] := ARRAY[
    ['ventas',                'vendedor_id'],
    ['gastos',                'vendedor_id'],
    ['devoluciones',          'vendedor_id'],
    ['cargas',                'vendedor_id'],
    ['cargas',                'repartidor_id'],
    ['entregas',              'vendedor_id'],
    ['entregas',              'vendedor_ruta_id'],
    ['descarga_ruta',         'vendedor_id'],
    ['descarga_ruta',         'aprobado_por'],
    ['stock_camion',          'vendedor_id'],
    ['venta_comisiones',      'vendedor_id'],
    ['pago_comisiones',       'vendedor_id'],
    ['traspasos',             'vendedor_origen_id'],
    ['traspasos',             'vendedor_destino_id'],
    ['movimientos_inventario','vendedor_destino_id'],
    ['clientes',              'vendedor_id'],
    ['clientes',              'cobrador_id'],
    ['auditorias',            'aprobado_por']
  ];
  v_table_name TEXT;
  v_column_name TEXT;
  v_constraint_name TEXT;
  i INT;
BEGIN
  FOR i IN 1..array_length(v_pairs, 1) LOOP
    v_table_name := v_pairs[i][1];
    v_column_name := v_pairs[i][2];

    -- Drop existing FK
    FOR v_rec IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.table_schema = 'public'
        AND tc.table_name = v_table_name
        AND tc.constraint_type = 'FOREIGN KEY'
        AND kcu.column_name = v_column_name
    LOOP
      EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', v_table_name, v_rec.constraint_name);
    END LOOP;

    -- Nullify orphan IDs not present in profiles
    EXECUTE format(
      'UPDATE public.%I SET %I = NULL WHERE %I IS NOT NULL AND %I NOT IN (SELECT id FROM public.profiles)',
      v_table_name, v_column_name, v_column_name, v_column_name
    );

    -- Add new FK to profiles
    v_constraint_name := v_table_name || '_' || v_column_name || '_profiles_fkey';
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.profiles(id) ON DELETE SET NULL',
      v_table_name, v_constraint_name, v_column_name
    );
  END LOOP;
END;
$$;

-- 3. Drop profiles.vendedor_id
ALTER TABLE public.profiles DROP COLUMN IF EXISTS vendedor_id;
