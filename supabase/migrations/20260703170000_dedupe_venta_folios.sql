-- ============================================================================
-- Limpieza única: renumera folios de venta duplicados que dejó la carrera de
-- concurrencia (varios VTA-4210, etc.) ANTES del fix del advisory lock.
-- ----------------------------------------------------------------------------
-- Estrategia por prefijo (VTA, PED, SAL):
--   - Se agrupan las ventas por (empresa_id, folio).
--   - Del grupo se CONSERVA la más antigua (created_at, id) con su folio.
--   - Las demás reciben un folio nuevo = consecutivo libre por encima del MAX
--     actual de ese prefijo/empresa, garantizando unicidad.
--   - No toca folios que no están duplicados. Las referencias entre tablas van
--     por `id` (no por folio), así que renumerar es seguro.
--
-- Es idempotente: al volver a correr no encuentra duplicados y no hace nada.
-- Nota operativa: cambia el folio VISIBLE de las copias (el ticket ya impreso
-- del cliente conservará el número viejo); es el precio de dejar folios únicos.
-- ============================================================================

DO $$
DECLARE
  p text;
BEGIN
  FOREACH p IN ARRAY ARRAY['VTA','PED','SAL'] LOOP
    WITH dups AS (
      SELECT id, empresa_id, folio, created_at,
             row_number() OVER (PARTITION BY empresa_id, folio ORDER BY created_at, id) AS rn
      FROM public.ventas
      WHERE folio ~ ('^' || p || '-[0-9]+$')
    ),
    to_fix AS (
      SELECT id, empresa_id, created_at FROM dups WHERE rn > 1   -- todas menos el original
    ),
    maxnum AS (
      SELECT empresa_id, MAX(CAST(SUBSTRING(folio FROM 5) AS INT)) AS maxn
      FROM public.ventas
      WHERE folio ~ ('^' || p || '-[0-9]+$')
      GROUP BY empresa_id
    ),
    numbered AS (
      -- Consecutivo nuevo por encima del MAX, asignado en orden cronológico.
      SELECT tf.id,
             m.maxn + row_number() OVER (PARTITION BY tf.empresa_id ORDER BY tf.created_at, tf.id) AS newn
      FROM to_fix tf
      JOIN maxnum m USING (empresa_id)
    )
    UPDATE public.ventas v
    SET folio = p || '-' || LPAD(n.newn::TEXT, 4, '0')
    FROM numbered n
    WHERE v.id = n.id;

    RAISE NOTICE 'Prefijo %: renumeración aplicada', p;
  END LOOP;
END $$;

-- Red de seguridad definitiva: índice único de folio por empresa. Con el
-- advisory lock ya no deberían generarse duplicados; esto lo garantiza a nivel
-- de BD. Se crea dentro de un bloque que NO aborta la migración: si aún
-- quedara algún duplicado (p. ej. folios manuales fuera de VTA/PED/SAL), solo
-- avisa por NOTICE en lugar de fallar el deploy.
DO $$
BEGIN
  BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS ventas_empresa_folio_unique
      ON public.ventas (empresa_id, folio)
      WHERE folio IS NOT NULL;
    RAISE NOTICE 'Índice único ventas(empresa_id, folio) creado';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'No se creó el índice único de folio (quedan duplicados por revisar): %', SQLERRM;
  END;
END $$;
