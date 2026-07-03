-- ============================================================================
-- Limpieza única: renumera folios de venta DUPLICADOS (varios VTA-4210, etc.)
-- que dejó la carrera de concurrencia previa al advisory lock (migración
-- 20260703160000). ACOTADO A UNA EMPRESA: Distribuidora Tampico.
-- ----------------------------------------------------------------------------
-- Estrategia por prefijo (VTA, PED, SAL), solo dentro de esa empresa:
--   - Agrupa las ventas por folio.
--   - CONSERVA la más antigua (created_at, id) con su folio original.
--   - A las copias les asigna un consecutivo nuevo por encima del MAX actual
--     del prefijo, en orden cronológico → número real, único y ordenado.
--   - No toca folios que no están duplicados.
--
-- Seguro: las referencias entre tablas (cobros, entregas, etc.) van por `id`,
-- no por folio. Idempotente: al re-correr no hay duplicados y no hace nada.
--
-- NOTA: el índice único global ventas(empresa_id, folio) se deja para una
-- migración posterior, cuando TODAS las empresas estén sin duplicados. El
-- advisory lock de la 160000 ya evita duplicados nuevos en todas las empresas.
-- ============================================================================

DO $$
DECLARE
  p text;
  v_empresa uuid;
BEGIN
  -- Resolver la empresa objetivo por nombre.
  SELECT id INTO v_empresa
  FROM public.empresas
  WHERE nombre ILIKE 'Distribuidora Tampico'
  LIMIT 1;

  IF v_empresa IS NULL THEN
    RAISE NOTICE 'Empresa "Distribuidora Tampico" no encontrada; no se renumeró nada.';
    RETURN;
  END IF;

  FOREACH p IN ARRAY ARRAY['VTA','PED','SAL'] LOOP
    WITH dups AS (
      SELECT id, folio, created_at,
             row_number() OVER (PARTITION BY folio ORDER BY created_at, id) AS rn
      FROM public.ventas
      WHERE empresa_id = v_empresa
        AND folio ~ ('^' || p || '-[0-9]+$')
    ),
    to_fix AS (
      SELECT id, created_at FROM dups WHERE rn > 1   -- todas menos el original
    ),
    maxnum AS (
      SELECT COALESCE(MAX(CAST(SUBSTRING(folio FROM 5) AS INT)), 0) AS maxn
      FROM public.ventas
      WHERE empresa_id = v_empresa
        AND folio ~ ('^' || p || '-[0-9]+$')
    ),
    numbered AS (
      -- Consecutivo nuevo por encima del MAX, en orden cronológico.
      SELECT tf.id,
             (SELECT maxn FROM maxnum) + row_number() OVER (ORDER BY tf.created_at, tf.id) AS newn
      FROM to_fix tf
    )
    UPDATE public.ventas v
    SET folio = p || '-' || LPAD(n.newn::TEXT, 4, '0')
    FROM numbered n
    WHERE v.id = n.id;

    RAISE NOTICE 'Prefijo %: duplicados renumerados para Distribuidora Tampico.', p;
  END LOOP;
END $$;
