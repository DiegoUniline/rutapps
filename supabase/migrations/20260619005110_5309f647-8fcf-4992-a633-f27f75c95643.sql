-- Etapa 1: habilitar Realtime para tablas que ya tienen suscripciones en el frontend
-- pero que no estaban en la publicación supabase_realtime.
-- Se usa DO blocks para ser idempotente (no falla si ya están agregadas).

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['clientes','entregas','visitas','devoluciones','cargas'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- REPLICA IDENTITY FULL: necesario para que los eventos UPDATE/DELETE
    -- incluyan los valores anteriores (requerido por filtros de Realtime).
    EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);

    -- Agregar a la publicación solo si no está ya
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;