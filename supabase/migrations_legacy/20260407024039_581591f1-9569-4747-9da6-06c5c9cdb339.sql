CREATE OR REPLACE FUNCTION public.generate_folio(p_empresa_id uuid, p_tipo text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_max int;
  v_folio text;
BEGIN
  SELECT COALESCE(MAX(
    CAST(SUBSTRING(folio FROM LENGTH(p_tipo) + 2) AS integer)
  ), 0)
  INTO v_max
  FROM ventas
  WHERE empresa_id = p_empresa_id
    AND folio ~ ('^' || p_tipo || '-\d+$');

  v_folio := p_tipo || '-' || LPAD((v_max + 1)::text, 4, '0');
  RETURN v_folio;
END;
$$;