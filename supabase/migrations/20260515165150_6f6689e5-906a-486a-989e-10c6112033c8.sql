
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_empresa_nombre text;
  v_ref_slug text;
  v_cupon_codigo text;
BEGIN
  v_empresa_nombre := COALESCE(NEW.raw_user_meta_data->>'empresa_nombre', '');
  v_ref_slug := NULLIF(NEW.raw_user_meta_data->>'partner_ref', '');
  v_cupon_codigo := NULLIF(NEW.raw_user_meta_data->>'cupon_codigo', '');

  IF v_empresa_nombre <> '' THEN
    INSERT INTO public.empresas (nombre, telefono, email)
    VALUES (
      v_empresa_nombre,
      COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
      COALESCE(NEW.email, '')
    )
    RETURNING id INTO v_empresa_id;
  ELSE
    SELECT id INTO v_empresa_id FROM public.empresas LIMIT 1;
  END IF;

  INSERT INTO public.profiles (user_id, nombre, empresa_id, telefono)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_empresa_id,
    NEW.raw_user_meta_data->>'phone'
  );

  -- Aplicar atribución a partner si vino link/cupón
  IF v_empresa_nombre <> '' AND (v_ref_slug IS NOT NULL OR v_cupon_codigo IS NOT NULL) THEN
    BEGIN
      PERFORM public.aplicar_partner_referido(v_empresa_id, v_ref_slug, v_cupon_codigo);
    EXCEPTION WHEN OTHERS THEN
      -- Nunca bloquear el signup por esto
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$function$;
