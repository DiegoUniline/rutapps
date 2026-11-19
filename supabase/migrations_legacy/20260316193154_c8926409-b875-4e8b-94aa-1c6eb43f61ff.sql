
-- Update auto_create_empresa_basics to also create Administrador role with all permissions
-- and assign it to the owner user
CREATE OR REPLACE FUNCTION public.auto_create_empresa_basics()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role_id uuid;
  v_owner_user_id uuid;
  v_modulo text;
  v_accion text;
  v_modulos text[] := ARRAY['ventas','pos','clientes','logistica','catalogo','almacen','finanzas','reportes','facturacion','configuracion'];
  v_acciones text[] := ARRAY['ver','crear','editar','eliminar'];
BEGIN
  -- Almacén General
  INSERT INTO public.almacenes (empresa_id, nombre)
  VALUES (NEW.id, 'Almacén General');

  -- Tarifa General
  INSERT INTO public.tarifas (empresa_id, nombre, tipo, activa)
  VALUES (NEW.id, 'Tarifa General', 'general', true);

  -- Unidad básica: Pieza
  INSERT INTO public.unidades (empresa_id, nombre, abreviatura)
  VALUES (NEW.id, 'Pieza', 'pza');

  -- Lista de precios General
  INSERT INTO public.listas (empresa_id, nombre)
  VALUES (NEW.id, 'Lista General');

  -- Zona por defecto
  INSERT INTO public.zonas (empresa_id, nombre)
  VALUES (NEW.id, 'Zona General');

  -- Create Administrador role with all permissions
  INSERT INTO public.roles (empresa_id, nombre, descripcion, es_sistema, acceso_ruta_movil)
  VALUES (NEW.id, 'Administrador', 'Acceso total al sistema', true, true)
  RETURNING id INTO v_role_id;

  -- Grant all permissions to the Administrador role
  FOREACH v_modulo IN ARRAY v_modulos LOOP
    FOREACH v_accion IN ARRAY v_acciones LOOP
      INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
      VALUES (v_role_id, v_modulo, v_accion, true);
    END LOOP;
  END LOOP;

  -- Find the owner (the user who created this empresa via handle_new_user)
  SELECT user_id INTO v_owner_user_id
  FROM public.profiles
  WHERE empresa_id = NEW.id
  LIMIT 1;

  -- Assign the Administrador role to the owner
  IF v_owner_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (v_owner_user_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;
