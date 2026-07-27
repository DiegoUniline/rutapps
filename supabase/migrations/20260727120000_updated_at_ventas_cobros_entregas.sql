-- Propagar ACTUALIZACIONES de ventas/cobros/entregas al móvil (saldo, status).
--
-- Problema: estas tablas se sincronizan por `created_at` (solo filas nuevas).
-- Cuando se paga una venta, el trigger actualiza `ventas.saldo_pendiente`, pero
-- como no es una fila nueva, ese cambio NUNCA baja al celular → "adeudo
-- fantasma": el servidor dice saldo 0 y el móvil sigue mostrando deuda.
-- Igual con cancelaciones de cobros y cambios de status de entregas.
--
-- Solución: agregar `updated_at` (mantenido por trigger en cada UPDATE) para que
-- el móvil pueda sincronizar por delta de updated_at y ver las actualizaciones.
--
-- Aditivo e idempotente. Reusa public.set_updated_at() (migración anterior);
-- se recrea aquí por si esta corre primero.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
  tbls text[] := ARRAY['ventas', 'cobros', 'entregas'];
BEGIN
  FOREACH t IN ARRAY tbls LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS updated_at timestamptz', t);
    EXECUTE format(
      'UPDATE public.%I SET updated_at = COALESCE(updated_at, created_at, now()) WHERE updated_at IS NULL',
      t
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN updated_at SET DEFAULT now()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%s_updated_at ON public.%I', t, t);
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      t, t
    );
    -- Índice para el delta por updated_at (acotado por empresa).
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_empresa_updated ON public.%I (empresa_id, updated_at)',
      t, t
    );
  END LOOP;
END $$;
