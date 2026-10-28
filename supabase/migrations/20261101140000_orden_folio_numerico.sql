-- =====================================================================
-- Orden por folio NUMÉRICO en logística (concentrado de pedidos / entregas).
-- Las funciones ordenaban "folio ASC" como texto: PED-1000, PED-10000, PED-10001…
-- PED-1001, y parecían repetidos. Ahora se ordena por el número del folio y luego
-- por el texto. El parche se aplica sobre la definición VIGENTE en la base
-- (pg_get_functiondef): solo cambia "folio ASC NULLS LAST" en los ORDER BY.
-- Idempotente (si ya tiene folio_orden no la toca). Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

-- Número final del folio (PED-10003 → 10003); NULL si no tiene número.
CREATE OR REPLACE FUNCTION public.folio_orden(p_folio text)
RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
  SELECT NULLIF(substring(p_folio FROM '([0-9]+)$'), '')::bigint
$$;

DO $patch$
DECLARE
  f record;
  v_def text;
  v_new text;
  v_cambiadas int := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('fn_logistica_concentrado_pedidos_v3', 'fn_logistica_entregas_workspace_v2', 'fn_logistica_concentrado_surtido_v2')
  LOOP
    v_def := pg_get_functiondef(f.oid);
    CONTINUE WHEN v_def LIKE '%folio_orden(%';
    v_new := regexp_replace(v_def,
      '(\m[a-z_]+\.)?folio(\s+)ASC(\s+)NULLS(\s+)LAST',
      'public.folio_orden(\1folio) ASC NULLS LAST, \1folio ASC NULLS LAST', 'gi');
    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_cambiadas := v_cambiadas + 1;
      RAISE NOTICE 'Orden numérico aplicado en %', f.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'Funciones cambiadas: %', v_cambiadas;
END
$patch$;

COMMIT;
