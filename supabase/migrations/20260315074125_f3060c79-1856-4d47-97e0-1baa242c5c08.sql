CREATE OR REPLACE FUNCTION public.next_folio(prefix text, p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INT;
  pattern TEXT := '^' || prefix || '-[0-9]+$';
BEGIN
  IF prefix IN ('VTA', 'PED') THEN
    SELECT COALESCE(MAX(
      CASE WHEN folio ~ pattern
        THEN CAST(SUBSTRING(folio FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.ventas
    WHERE empresa_id = p_empresa_id
      AND folio ~ pattern;
  ELSIF prefix = 'CLI' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ pattern
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.clientes
    WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'PROD' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ pattern
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.productos
    WHERE empresa_id = p_empresa_id;
  ELSE
    next_num := 1;
  END IF;

  RETURN prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$function$;