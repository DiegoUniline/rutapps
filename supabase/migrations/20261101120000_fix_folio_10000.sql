-- =====================================================================
-- Folios después del 9999 (PED/VTA/SAL/CLI/PROD).
-- Causa: LPAD(n::text, 4, '0') en Postgres CORTA el texto a 4 caracteres:
-- LPAD('10000', 4, '0') = '1000'. Después de PED-9999 todos los pedidos
-- salían como PED-1000 (y el MAX se quedaba en 9999 para siempre).
-- Ahora solo se rellena con ceros cuando el número tiene menos de 4 dígitos.
-- Mismo cuerpo que 20260703160000 / 20260703180000; solo cambia el formato.
-- Guardia: aborta si producción no tiene la versión esperada (con el LPAD).
-- Idempotente. Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

DO $guard$
DECLARE v_nf text; v_av text;
BEGIN
  -- Se compara sin espacios ni saltos de línea (producción tiene el mismo cuerpo con otro formato).
  SELECT regexp_replace(prosrc, '\s', '', 'g') INTO v_nf FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'next_folio';
  SELECT regexp_replace(prosrc, '\s', '', 'g') INTO v_av FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'auto_folio_venta';
  IF v_nf IS NULL OR v_av IS NULL THEN RAISE EXCEPTION 'next_folio o auto_folio_venta no existen; no se aplica nada'; END IF;
  IF v_nf NOT LIKE '%pg_advisory_xact_lock%' OR (v_nf NOT ILIKE '%LPAD(next_num::TEXT,4,''0'')%' AND v_nf NOT LIKE '%public.folio_num(%') THEN
    RAISE EXCEPTION 'next_folio en producción difiere del repo; no se aplica nada';
  END IF;
  IF v_av NOT LIKE '%next_folio(%' OR v_av NOT LIKE '%SAL-%' THEN
    RAISE EXCEPTION 'auto_folio_venta en producción difiere del repo; no se aplica nada';
  END IF;
END
$guard$;

-- Número de folio: mínimo 4 dígitos, sin cortar los de 5 o más.
CREATE OR REPLACE FUNCTION public.folio_num(n bigint)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN length(n::text) >= 4 THEN n::text ELSE lpad(n::text, 4, '0') END
$$;

CREATE OR REPLACE FUNCTION public.next_folio(prefix text, p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num BIGINT;
  pattern TEXT := '^' || prefix || '-[0-9]+$';
BEGIN
  -- Serializa la numeración por (prefijo, empresa) durante la transacción.
  PERFORM pg_advisory_xact_lock(hashtext('folio:' || prefix), hashtext(p_empresa_id::text));

  IF prefix IN ('VTA', 'PED') THEN
    SELECT COALESCE(MAX(
      CASE WHEN folio ~ pattern
        THEN CAST(SUBSTRING(folio FROM LENGTH(prefix) + 2) AS BIGINT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.ventas
    WHERE empresa_id = p_empresa_id
      AND folio ~ pattern;
  ELSIF prefix = 'CLI' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ pattern
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS BIGINT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.clientes
    WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'PROD' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ pattern
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS BIGINT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.productos
    WHERE empresa_id = p_empresa_id;
  ELSE
    next_num := 1;
  END IF;

  RETURN prefix || '-' || public.folio_num(next_num);
END;
$function$;

CREATE OR REPLACE FUNCTION public.auto_folio_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  -- El folio SIEMPRE lo asigna la base (fuente única de verdad). Se ignora
  -- cualquier NEW.folio que traiga el cliente.
  IF NEW.tipo = 'saldo_inicial' THEN
    PERFORM pg_advisory_xact_lock(hashtext('folio:SAL'), hashtext(NEW.empresa_id::text));
    SELECT 'SAL-' || public.folio_num(COALESCE(MAX(
      CASE WHEN folio ~ '^SAL-[0-9]+$'
        THEN CAST(SUBSTRING(folio FROM 5) AS BIGINT)
        ELSE 0
      END
    ), 0) + 1)
    INTO NEW.folio
    FROM public.ventas
    WHERE empresa_id = NEW.empresa_id;
  ELSE
    NEW.folio := next_folio(
      CASE WHEN NEW.tipo = 'pedido' THEN 'PED' ELSE 'VTA' END,
      NEW.empresa_id
    );
  END IF;
  RETURN NEW;
END;
$$;

COMMIT;
