-- Registro: la pantalla revisaba empresas con la sesión anónima, que RLS no deja leer;
-- la revisión siempre pasaba y el teléfono repetido terminaba en «Database error saving
-- new user». Esta función solo responde si el correo/teléfono ya están en uso (sin datos).
-- El teléfono se compara igual que la restricción empresas_telefono_unique (texto exacto).
CREATE OR REPLACE FUNCTION public.fn_registro_disponible(p_email text, p_telefono text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_email text := lower(trim(coalesce(p_email, '')));
  v_tel   text := trim(coalesce(p_telefono, ''));
BEGIN
  RETURN jsonb_build_object(
    'email_en_uso', v_email <> '' AND (
      EXISTS (SELECT 1 FROM auth.users u WHERE lower(u.email) = v_email)
      OR EXISTS (SELECT 1 FROM public.empresas e WHERE lower(e.email) = v_email)
    ),
    'telefono_en_uso', v_tel <> '' AND EXISTS (SELECT 1 FROM public.empresas e WHERE e.telefono = v_tel)
  );
END
$fn$;

REVOKE ALL ON FUNCTION public.fn_registro_disponible(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_registro_disponible(text, text) TO anon, authenticated, service_role;
