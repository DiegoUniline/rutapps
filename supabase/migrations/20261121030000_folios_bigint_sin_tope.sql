-- Folios sin tope: los generadores leían el consecutivo como INT (máx. 2,147,483,647).
-- Se cambia a BIGINT sobre la definición VIGENTE de cada función (solo el tipo
-- del número; prefijos, relleno con folio_lpad/folio_num y locks no cambian).
-- next_folio y auto_folio_venta ya usan BIGINT.
DO $mig$
DECLARE
  f text;
  v_def text;
  v_new text;
  v_funcs text[] := ARRAY[
    'auto_folio_compra', 'auto_folio_entrega', 'auto_folio_solicitud_traspaso',
    'auto_folio_traspaso', 'auto_numero_factura', 'generate_folio',
    'registrar_merma', 'registrar_saldo_inicial', 'trg_cotizacion_before_insert'
  ];
BEGIN
  FOREACH f IN ARRAY v_funcs LOOP
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f;
    IF v_def IS NULL THEN
      RAISE NOTICE 'folios_bigint: % no existe, se omite', f;
      CONTINUE;
    END IF;

    v_new := v_def;
    v_new := regexp_replace(v_new, 'AS\s+INT(EGER)?\)', 'AS BIGINT)', 'gi');
    v_new := regexp_replace(v_new, '\)::int(eger)?\M', ')::bigint', 'gi');
    v_new := regexp_replace(v_new, '\m(v_max|_next|next_num)\s+int(eger)?\s*;', '\1 bigint;', 'gi');

    IF v_new IS DISTINCT FROM v_def THEN
      EXECUTE v_new;
    END IF;

    -- Guardia: no debe quedar el consecutivo como INT.
    SELECT pg_get_functiondef(p.oid) INTO v_def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = f;
    IF v_def ~* 'AS\s+INT(EGER)?\)|\)::int(eger)?\M|\m(v_max|_next|next_num)\s+int(eger)?\s*;' THEN
      RAISE EXCEPTION 'folios_bigint: % conserva un consecutivo INT', f;
    END IF;
  END LOOP;
END
$mig$;
