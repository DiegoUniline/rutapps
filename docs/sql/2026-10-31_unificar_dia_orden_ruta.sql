-- Unifica el día en cliente_orden_ruta: "sábado"/"sabado" (celular) → "Sábado" (escritorio).
-- Si el cliente ya está en la ruta canónica del mismo vendedor y día, se conserva la canónica.
-- Respaldo: cliente_orden_ruta_dia_respaldo.
DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

BEGIN;

CREATE TEMP TABLE _dia_map(variante text, canonico text) ON COMMIT DROP;
INSERT INTO _dia_map
SELECT v, c FROM (VALUES ('Lunes'),('Martes'),('Miércoles'),('Jueves'),('Viernes'),('Sábado'),('Domingo')) d(c),
LATERAL (VALUES (lower(c)), (translate(c,'áéíóúÁÉÍÓÚ','aeiouAEIOU')), (lower(translate(c,'áéíóúÁÉÍÓÚ','aeiouAEIOU')))) x(v)
WHERE v <> c;

CREATE TABLE IF NOT EXISTS public.cliente_orden_ruta_dia_respaldo AS
SELECT now() AS respaldado_en, r.* FROM public.cliente_orden_ruta r WHERE false;

INSERT INTO public.cliente_orden_ruta_dia_respaldo
SELECT now(), r.* FROM public.cliente_orden_ruta r JOIN _dia_map m ON m.variante = r.dia;

-- 1) Duplicados: ya existe en el día canónico → se quita la variante.
DELETE FROM public.cliente_orden_ruta r
USING _dia_map m
WHERE r.dia = m.variante
  AND EXISTS (SELECT 1 FROM public.cliente_orden_ruta c
              WHERE c.empresa_id = r.empresa_id AND c.cliente_id = r.cliente_id
                AND c.dia = m.canonico
                AND c.vendedor_id IS NOT DISTINCT FROM r.vendedor_id);

-- 2) Una misma variante repetida para el cliente (sabado y sábado): se deja la de menor orden.
DELETE FROM public.cliente_orden_ruta r
USING (
  SELECT r2.ctid AS rid,
         row_number() OVER (PARTITION BY r2.empresa_id, r2.cliente_id, m.canonico, r2.vendedor_id ORDER BY r2.orden) AS n
  FROM public.cliente_orden_ruta r2 JOIN _dia_map m ON m.variante = r2.dia
) d
WHERE r.ctid = d.rid AND d.n > 1;

-- 3) Lo que queda se renombra al día canónico.
UPDATE public.cliente_orden_ruta r SET dia = m.canonico
FROM _dia_map m WHERE r.dia = m.variante;

-- 4) Renumera 1..N cada ruta (empresa, vendedor, día) sin huecos.
WITH n AS (
  SELECT ctid AS rid, row_number() OVER (PARTITION BY empresa_id, vendedor_id, dia ORDER BY orden, cliente_id) AS o
  FROM public.cliente_orden_ruta WHERE dia IS NOT NULL
)
UPDATE public.cliente_orden_ruta r SET orden = n.o FROM n WHERE r.ctid = n.rid AND r.orden <> n.o;

-- Verificación (debe salir 0 filas en variantes_restantes y 0 en duplicados)
SELECT
  (SELECT count(*) FROM public.cliente_orden_ruta r JOIN _dia_map m ON m.variante = r.dia) AS variantes_restantes,
  (SELECT count(*) FROM (SELECT 1 FROM public.cliente_orden_ruta
     GROUP BY empresa_id, cliente_id, dia, vendedor_id HAVING count(*) > 1) x) AS duplicados,
  (SELECT count(*) FROM public.cliente_orden_ruta_dia_respaldo) AS respaldadas;

COMMIT;
