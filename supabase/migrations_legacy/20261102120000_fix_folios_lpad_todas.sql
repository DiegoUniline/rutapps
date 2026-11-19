-- =====================================================================
-- Folios después del 9999 en TODAS las tablas (entregas, compras, traspasos,
-- solicitudes de traspaso, mermas, saldos iniciales, cotizaciones, facturas…).
-- Mismo error que PED (20261101120000): LPAD(n, 4, '0') CORTA el texto, así que
-- ENT-10000 salía ENT-1000 y se repetía. Aquí se cambia, sobre la definición
-- VIGENTE de cada función (pg_get_functiondef), la llamada LPAD( por
-- public.folio_lpad(, que rellena igual pero nunca corta. No se toca nada más.
-- Idempotente (después del cambio ya no queda "lpad(" suelto). Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

-- Igual que lpad(texto, largo, relleno) pero sin cortar textos más largos.
CREATE OR REPLACE FUNCTION public.folio_lpad(p_texto text, p_largo integer, p_relleno text DEFAULT ' ')
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(p_texto) >= p_largo THEN p_texto ELSE lpad(p_texto, p_largo, p_relleno) END
$$;

DO $patch$
DECLARE f record; v_def text; v_new text; v_cambiadas int := 0;
BEGIN
  FOR f IN
    SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f'
      AND p.proname NOT IN ('folio_lpad', 'folio_num')
      AND p.prosrc ~* '\mlpad\s*\('
      AND p.prosrc ~* '(folio|numero_factura)'
  LOOP
    v_def := pg_get_functiondef(f.oid);
    v_new := regexp_replace(v_def, '\mlpad\s*\(', 'public.folio_lpad(', 'gi');
    IF v_new <> v_def THEN
      EXECUTE v_new;
      v_cambiadas := v_cambiadas + 1;
      RAISE NOTICE 'Folio sin corte aplicado en %', f.proname;
    END IF;
  END LOOP;
  RAISE NOTICE 'Funciones cambiadas: %', v_cambiadas;
END
$patch$;

COMMIT;
