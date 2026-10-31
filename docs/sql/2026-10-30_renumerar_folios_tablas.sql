-- Corrección de datos (no es migración): renumera folios repetidos de entregas, compras, traspasos,
-- solicitudes de traspaso y cotizaciones. Misma regla que ventas (decisión del dueño 2026-10-28):
-- el primero de cada folio lo conserva; los demás toman el siguiente número de su empresa.
-- Respaldo en folios_renumeracion (tabla, registro_id, folio_anterior, folio_nuevo). Idempotente. Lo ejecuta el dueño (D-002).
BEGIN;
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

-- Respaldo: cada folio cambiado (auditoría y para poder revertir).
CREATE TABLE IF NOT EXISTS public.folios_renumeracion (
  tabla text NOT NULL,
  registro_id uuid NOT NULL,
  empresa_id uuid NOT NULL,
  folio_anterior text NOT NULL,
  folio_nuevo text NOT NULL,
  renumerado_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tabla, registro_id)
);
ALTER TABLE public.folios_renumeracion ENABLE ROW LEVEL SECURITY;

-- El primero de cada folio repetido (por fecha de creación) lo conserva; los demás
-- toman el siguiente número de su empresa y prefijo, en orden de creación,
-- con el mismo número de dígitos mínimo que el folio original.
DO $$
DECLARE t text; g record; r record; v_max bigint; v_nuevo text;
BEGIN
  FOREACH t IN ARRAY ARRAY['entregas','compras','traspasos','solicitudes_traspaso','cotizaciones'] LOOP
    CONTINUE WHEN to_regclass('public.' || t) IS NULL;
    FOR g IN EXECUTE format(
      'SELECT DISTINCT empresa_id, split_part(folio, ''-'', 1) AS pref FROM public.%I
       WHERE folio ~ ''^[A-Z]+-[0-9]+$'' GROUP BY empresa_id, folio HAVING count(*) > 1', t)
    LOOP
      PERFORM pg_advisory_xact_lock(hashtext('folio:' || g.pref), hashtext(g.empresa_id::text));
      EXECUTE format('SELECT COALESCE(MAX(CAST(substring(folio FROM ''([0-9]+)$'') AS bigint)), 0)
                      FROM public.%I WHERE empresa_id = $1 AND folio ~ (''^'' || $2 || ''-[0-9]+$'')', t)
        INTO v_max USING g.empresa_id, g.pref;
      FOR r IN EXECUTE format(
        'SELECT id, folio FROM (
           SELECT id, folio, created_at, row_number() OVER (PARTITION BY folio ORDER BY created_at, id) AS n
           FROM public.%I WHERE empresa_id = $1 AND folio ~ (''^'' || $2 || ''-[0-9]+$'')
         ) x WHERE n > 1 ORDER BY created_at, id', t) USING g.empresa_id, g.pref
      LOOP
        v_max := v_max + 1;
        v_nuevo := g.pref || '-' || public.folio_lpad(v_max::text, length(substring(r.folio FROM '([0-9]+)$')), '0');
        INSERT INTO public.folios_renumeracion (tabla, registro_id, empresa_id, folio_anterior, folio_nuevo)
        VALUES (t, r.id, g.empresa_id, r.folio, v_nuevo);
        EXECUTE format('UPDATE public.%I SET folio = $1 WHERE id = $2', t) USING v_nuevo, r.id;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;

-- Resultado
SELECT x.tabla, e.nombre AS empresa, x.folio_anterior, count(*) AS renumerados,
       min(x.folio_nuevo) AS desde, max(x.folio_nuevo) AS hasta
FROM public.folios_renumeracion x JOIN public.empresas e ON e.id = x.empresa_id
GROUP BY 1, 2, 3 ORDER BY 1, 2, 3;
COMMIT;
