
-- Update handle_new_user to create empresa from metadata and assign it
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_empresa_id uuid;
  v_empresa_nombre text;
BEGIN
  v_empresa_nombre := COALESCE(NEW.raw_user_meta_data->>'empresa_nombre', '');
  
  -- If empresa_nombre is provided, create a new empresa
  IF v_empresa_nombre <> '' THEN
    INSERT INTO public.empresas (nombre, telefono)
    VALUES (v_empresa_nombre, NEW.raw_user_meta_data->>'phone')
    RETURNING id INTO v_empresa_id;
  ELSE
    -- Fallback: use first existing empresa (for admin-created users)
    SELECT id INTO v_empresa_id FROM public.empresas LIMIT 1;
  END IF;
  
  INSERT INTO public.profiles (user_id, nombre, empresa_id, telefono)
  VALUES (
    NEW.id, 
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 
    v_empresa_id,
    NEW.raw_user_meta_data->>'phone'
  );
  
  RETURN NEW;
END;
$function$;
