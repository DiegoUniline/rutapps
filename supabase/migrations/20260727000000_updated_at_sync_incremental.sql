-- Sincronización incremental para ahorrar datos móviles.
--
-- Problema: el móvil re-descargaba COMPLETAS las tablas maestras (productos,
-- clientes, stock) en cada sync porque `productos` no tenía `updated_at`, así
-- que un delta por `created_at` nunca detectaba ediciones (precio, IVA, etc.).
--
-- Solución: agregar `updated_at` (mantenido por trigger en cada UPDATE) a las
-- tablas grandes. Con eso el móvil pasa a delta real por `updated_at`: revisa
-- seguido (todo queda al día) pero solo baja las filas que cambiaron.
--
-- Aditivo e idempotente: seguro de correr varias veces.

-- Función genérica que estampa la hora de modificación en cada UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- Aplica columna + backfill + trigger + índice a una tabla dada.
DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['productos', 'clientes', 'stock_almacen', 'stock_apartado'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    -- 1) Columna (si no existe)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz',
      t
    );

    -- 2) Backfill de filas viejas: usa created_at si existe, si no now().
    BEGIN
      EXECUTE format(
        'UPDATE public.%I SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL',
        t
      );
    EXCEPTION WHEN undefined_column THEN
      -- La tabla no tiene created_at: usa now() para las nulas.
      EXECUTE format(
        'UPDATE public.%I SET updated_at = now() WHERE updated_at IS NULL',
        t
      );
    END;

    -- 3) Default para inserts nuevos.
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()',
      t
    );

    -- 4) Trigger BEFORE UPDATE que mantiene updated_at fresco en cada cambio.
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );

    -- 5) Índice (empresa_id, updated_at) para que el delta sea eficiente.
    BEGIN
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_empresa_updated ON public.%I (empresa_id, updated_at)',
        t, t
      );
    EXCEPTION WHEN undefined_column THEN
      -- Sin empresa_id: índice solo por updated_at.
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS idx_%s_updated ON public.%I (updated_at)',
        t, t
      );
    END;
  END LOOP;
END $$;
