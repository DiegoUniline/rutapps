CREATE OR REPLACE FUNCTION public.close_audit_line(p_linea_id uuid, p_cerrada boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auditoria_lineas SET cerrada = p_cerrada WHERE id = p_linea_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_audit_line(uuid, boolean) TO anon;

CREATE OR REPLACE FUNCTION public.close_full_audit(p_auditoria_id uuid, p_cerrada_por text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE auditorias SET status = 'cerrada', cerrada_por = p_cerrada_por, cerrada_at = now() WHERE id = p_auditoria_id;
  UPDATE auditoria_lineas SET cerrada = true WHERE auditoria_id = p_auditoria_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_full_audit(uuid, text) TO anon;