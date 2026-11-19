DO $$
DECLARE
  t text;
  tbls text[] := ARRAY[
    'stock_apartado',
    'cotizaciones',
    'descarga_ruta',
    'ajustes_inventario',
    'tarifas',
    'lista_precios',
    'proveedores',
    'traspasos',
    'compras',
    'mermas',
    'conteos_fisicos',
    'caja_turnos',
    'caja_movimientos',
    'ruta_sesiones',
    'cliente_orden_ruta'
  ];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = t
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      END IF;
    END IF;
  END LOOP;
END $$;