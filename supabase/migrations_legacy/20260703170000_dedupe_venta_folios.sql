-- ============================================================================
-- Limpieza única de folios de venta para Distribuidora Tampico.
-- ----------------------------------------------------------------------------
-- Contexto: convivían tres generadores de folio (trigger de BD, RPC
-- generate_folio y un fallback cliente `VTA-<hex>`). Eso dejó, para VTA:
--   - un bloque limpio y contiguo VTA-0001..VTA-0276,
--   - VTA-4210 repetido 42 veces (RPC MAX+1 sin lock, concurrencia),
--   - VTA-4210908 (hex que salió todo numérico → envenenó el MAX),
--   - varios VTA-<hex> sin lógica.
--
-- Estrategia QUIRÚRGICA por prefijo (VTA, PED, SAL), solo en esta empresa:
--   1. K = mayor número del bloque contiguo 1..K (folios legítimos). Se
--      conservan intactos.
--   2. La "basura" (folios no numéricos, o numéricos > K: duplicados y
--      atípicos) se renumera a K+1, K+2, … en orden cronológico → secuencia
--      continua, sin huecos absurdos ni duplicados.
--
-- Seguro: las referencias entre tablas van por `id`, no por folio.
-- Idempotente: tras correr, no queda basura (todo ≤ K nuevo) y no hace nada.
--
-- NOTA: el índice único global ventas(empresa_id, folio) se deja para una
-- migración posterior, cuando TODAS las empresas estén limpias. El advisory
-- lock (20260703160000) + que la venta de ruta ya manda folio=null evitan
-- duplicados nuevos.
-- ============================================================================

DO $$
DECLARE
  v_empresa uuid := '41cdb6df-40c0-4a95-89de-a54bf8eba0de';  -- Distribuidora Tampico
  p text;
  v_k int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.empresas WHERE id = v_empresa) THEN
    RAISE NOTICE 'Empresa % no encontrada; no se renumeró nada.', v_empresa;
    RETURN;
  END IF;

  FOREACH p IN ARRAY ARRAY['VTA','PED','SAL'] LOOP
    -- K = tope del bloque contiguo 1..K entre los folios numéricos del prefijo.
    -- Se calcula con una función ventana (num vs su posición ordenada), SIN
    -- generate_series: éste, con un MAX envenenado (p. ej. 4.2M por un folio
    -- basura), generaría millones de filas y agotaría el timeout sin guardar.
    WITH nums AS (
      SELECT DISTINCT CAST(SUBSTRING(folio FROM LENGTH(p) + 2) AS INT) AS n
      FROM public.ventas
      WHERE empresa_id = v_empresa
        AND folio ~ ('^' || p || '-[0-9]+$')
    ),
    seq AS (
      SELECT n, row_number() OVER (ORDER BY n) AS rn FROM nums
    )
    SELECT COALESCE(MAX(n) FILTER (WHERE n = rn), 0) INTO v_k FROM seq;

    -- Renumerar la basura (no numérica o numérica > K) a partir de K+1.
    WITH junk AS (
      SELECT id, created_at,
             CASE WHEN folio ~ ('^' || p || '-[0-9]+$')
                  THEN CAST(SUBSTRING(folio FROM LENGTH(p) + 2) AS INT)
             END AS num
      FROM public.ventas
      WHERE empresa_id = v_empresa
        AND folio LIKE (p || '-%')
    ),
    ren AS (
      SELECT id,
             v_k + row_number() OVER (ORDER BY created_at, id) AS newn
      FROM junk
      WHERE num IS NULL OR num > v_k
    )
    UPDATE public.ventas v
    SET folio = p || '-' || LPAD(r.newn::TEXT, 4, '0')
    FROM ren r
    WHERE v.id = r.id;

    RAISE NOTICE 'Prefijo %: bloque limpio 1..%, basura renumerada desde %.', p, v_k, v_k + 1;
  END LOOP;
END $$;
