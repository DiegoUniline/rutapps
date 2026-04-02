
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_empresa_nombre text;
  v_role_id uuid;
BEGIN
  v_empresa_nombre := COALESCE(NEW.raw_user_meta_data->>'empresa_nombre', '');
  
  IF v_empresa_nombre <> '' THEN
    -- Create empresa (this will trigger auto_create_empresa_basics which creates the Administrador role)
    INSERT INTO public.empresas (nombre, telefono, email, owner_user_id)
    VALUES (
      v_empresa_nombre,
      COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
      COALESCE(NEW.email, ''),
      NEW.id
    )
    RETURNING id INTO v_empresa_id;
    
    -- Create profile first so auto_create_empresa_basics can find the owner
    INSERT INTO public.profiles (user_id, nombre, empresa_id, telefono)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      v_empresa_id,
      NEW.raw_user_meta_data->>'phone'
    );
    
    -- Use the Administrador role already created by auto_create_empresa_basics
    SELECT id INTO v_role_id
    FROM public.roles
    WHERE empresa_id = v_empresa_id AND nombre = 'Administrador'
    LIMIT 1;
    
    IF v_role_id IS NOT NULL THEN
      INSERT INTO public.user_roles (user_id, role_id)
      VALUES (NEW.id, v_role_id)
      ON CONFLICT DO NOTHING;
    END IF;
    
  ELSE
    SELECT id INTO v_empresa_id FROM public.empresas LIMIT 1;
    
    INSERT INTO public.profiles (user_id, nombre, empresa_id, telefono)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      v_empresa_id,
      NEW.raw_user_meta_data->>'phone'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
