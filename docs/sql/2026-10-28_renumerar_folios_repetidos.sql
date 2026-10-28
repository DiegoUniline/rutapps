-- Corrección de datos (no es migración): renumera folios repetidos de ventas/pedidos (PED/VTA/SAL).
-- Decisión del dueño 2026-10-28: renumerar TODOS los repetidos; el primero de cada folio lo conserva.
-- Respaldo en ventas_folio_renumeracion (venta_id, folio_anterior, folio_nuevo). Idempotente. Lo ejecuta el dueño (D-002).
BEGIN;
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;
DO $$ BEGIN IF to_regprocedure('public.folio_num(bigint)') IS NULL THEN RAISE EXCEPTION 'Falta la corrección de folios 10000'; END IF; END $$;

-- Respaldo: cada folio cambiado (para auditoría y para poder revertir).
CREATE TABLE IF NOT EXISTS public.ventas_folio_renumeracion (
  venta_id uuid PRIMARY KEY,
  empresa_id uuid NOT NULL,
  folio_anterior text NOT NULL,
  folio_nuevo text NOT NULL,
  renumerado_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ventas_folio_renumeracion ENABLE ROW LEVEL SECURITY;

-- El primero de cada folio repetido (por fecha de creación) lo conserva; los demás
-- reciben el siguiente folio de su empresa y prefijo, en orden de creación.
DO $$
DECLARE g record; r record; v_max bigint; v_nuevo text;
BEGIN
  FOR g IN
    SELECT DISTINCT empresa_id, split_part(folio, '-', 1) AS pref
    FROM (SELECT empresa_id, folio FROM public.ventas
          WHERE folio ~ '^(PED|VTA|SAL)-[0-9]+$'
          GROUP BY empresa_id, folio HAVING count(*) > 1) d
  LOOP
    -- Mismo candado que next_folio: nadie toma folios de esa empresa/prefijo mientras tanto.
    PERFORM pg_advisory_xact_lock(hashtext('folio:' || g.pref), hashtext(g.empresa_id::text));
    SELECT COALESCE(MAX(CAST(SUBSTRING(folio FROM length(g.pref) + 2) AS bigint)), 0) INTO v_max
    FROM public.ventas WHERE empresa_id = g.empresa_id AND folio ~ ('^' || g.pref || '-[0-9]+$');
    FOR r IN
      SELECT id, folio FROM (
        SELECT id, folio, created_at,
               row_number() OVER (PARTITION BY folio ORDER BY created_at, id) AS n
        FROM public.ventas
        WHERE empresa_id = g.empresa_id AND folio ~ ('^' || g.pref || '-[0-9]+$')
      ) x
      WHERE n > 1 AND folio IN (SELECT folio FROM public.ventas WHERE empresa_id = g.empresa_id
                                GROUP BY folio HAVING count(*) > 1)
      ORDER BY created_at, id
    LOOP
      v_max := v_max + 1;
      v_nuevo := g.pref || '-' || public.folio_num(v_max);
      INSERT INTO public.ventas_folio_renumeracion (venta_id, empresa_id, folio_anterior, folio_nuevo)
      VALUES (r.id, g.empresa_id, r.folio, v_nuevo);
      UPDATE public.ventas SET folio = v_nuevo WHERE id = r.id;
    END LOOP;
  END LOOP;
END $$;

-- Resultado
SELECT e.nombre AS empresa, x.folio_anterior, count(*) AS renumerados,
       min(x.folio_nuevo) AS desde, max(x.folio_nuevo) AS hasta
FROM public.ventas_folio_renumeracion x JOIN public.empresas e ON e.id = x.empresa_id
GROUP BY e.nombre, x.folio_anterior ORDER BY 1, 2;
COMMIT;
