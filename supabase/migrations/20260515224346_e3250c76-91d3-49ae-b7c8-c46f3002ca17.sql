
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_empresa_id uuid;
  v_empresa_nombre text;
  v_ref_slug text;
  v_cupon_codigo text;
  v_is_partner boolean;
  v_role_id uuid;
  v_almacen_id uuid;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.partners WHERE lower(email) = lower(NEW.email)) INTO v_is_partner;
  IF v_is_partner THEN
    UPDATE public.partners SET user_id = NEW.id WHERE lower(email) = lower(NEW.email) AND user_id IS NULL;
    RETURN NEW;
  END IF;

  v_empresa_nombre := COALESCE(NEW.raw_user_meta_data->>'empresa_nombre', '');
  v_ref_slug := NULLIF(NEW.raw_user_meta_data->>'partner_ref', '');
  v_cupon_codigo := NULLIF(NEW.raw_user_meta_data->>'cupon_codigo', '');

  IF v_empresa_nombre <> '' THEN
    INSERT INTO public.empresas (nombre, telefono, email, owner_user_id)
    VALUES (
      v_empresa_nombre,
      COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
      COALESCE(NEW.email, ''),
      NEW.id
    )
    RETURNING id INTO v_empresa_id;
  ELSE
    SELECT id INTO v_empresa_id FROM public.empresas LIMIT 1;
  END IF;

  -- Pick the Almacén General created by auto_create_empresa_basics trigger
  SELECT id INTO v_almacen_id
  FROM public.almacenes
  WHERE empresa_id = v_empresa_id AND nombre = 'Almacén General'
  LIMIT 1;

  INSERT INTO public.profiles (user_id, nombre, empresa_id, telefono, almacen_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    v_empresa_id,
    NEW.raw_user_meta_data->>'phone',
    v_almacen_id
  );

  -- Assign Administrador role created by auto_create_empresa_basics trigger
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE empresa_id = v_empresa_id AND nombre = 'Administrador'
  LIMIT 1;

  IF v_role_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  IF v_empresa_nombre <> '' AND (v_ref_slug IS NOT NULL OR v_cupon_codigo IS NOT NULL) THEN
    BEGIN
      PERFORM public.aplicar_partner_referido(v_empresa_id, v_ref_slug, v_cupon_codigo);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- Backfill: set owner_user_id for empresas missing it (use first profile)
UPDATE public.empresas e
SET owner_user_id = sub.user_id
FROM (
  SELECT DISTINCT ON (empresa_id) empresa_id, user_id
  FROM public.profiles
  ORDER BY empresa_id, created_at ASC
) sub
WHERE e.id = sub.empresa_id
  AND e.owner_user_id IS NULL;
