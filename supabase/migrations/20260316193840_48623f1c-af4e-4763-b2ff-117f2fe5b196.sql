
-- Update auto_create_empresa_basics with all granular sub-modules
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
  v_modulos text[] := ARRAY[
    'dashboard','supervisor',
    'ventas','ventas.cobranza','ventas.promociones','pos',
    'clientes',
    'logistica.dashboard','logistica.pedidos','logistica.entregas','logistica.descargas','logistica.monitor','logistica.rutas','logistica.mapa_clientes','logistica.mapa_ventas',
    'catalogo.productos','catalogo.tarifas','catalogo.clasificaciones','catalogo.marcas','catalogo.proveedores','catalogo.unidades','catalogo.tasas_iva','catalogo.tasas_ieps',
    'almacen.inventario','almacen.traspasos','almacen.ajustes','almacen.auditorias','almacen.compras','almacen.lotes','almacen.almacenes',
    'finanzas.por_cobrar','finanzas.por_pagar','finanzas.gastos','finanzas.comisiones',
    'reportes.generales','reportes.entregas',
    'facturacion.cfdi','facturacion.catalogos',
    'configuracion.general','configuracion.usuarios','configuracion.whatsapp','configuracion.suscripcion'
  ];
  v_acciones text[] := ARRAY['ver','crear','editar','eliminar'];
BEGIN
  -- Almacén General
  INSERT INTO public.almacenes (empresa_id, nombre) VALUES (NEW.id, 'Almacén General');
  -- Tarifa General
  INSERT INTO public.tarifas (empresa_id, nombre, tipo, activa) VALUES (NEW.id, 'Tarifa General', 'general', true);
  -- Unidad básica: Pieza
  INSERT INTO public.unidades (empresa_id, nombre, abreviatura) VALUES (NEW.id, 'Pieza', 'pza');
  -- Lista de precios General
  INSERT INTO public.listas (empresa_id, nombre) VALUES (NEW.id, 'Lista General');
  -- Zona por defecto
  INSERT INTO public.zonas (empresa_id, nombre) VALUES (NEW.id, 'Zona General');

  -- Create Administrador role with all permissions
  INSERT INTO public.roles (empresa_id, nombre, descripcion, es_sistema, acceso_ruta_movil)
  VALUES (NEW.id, 'Administrador', 'Acceso total al sistema', true, true)
  RETURNING id INTO v_role_id;

  FOREACH v_modulo IN ARRAY v_modulos LOOP
    FOREACH v_accion IN ARRAY v_acciones LOOP
      INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
      VALUES (v_role_id, v_modulo, v_accion, true);
    END LOOP;
  END LOOP;

  SELECT user_id INTO v_owner_user_id
  FROM public.profiles WHERE empresa_id = NEW.id LIMIT 1;

  IF v_owner_user_id IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (v_owner_user_id, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Add all new granular sub-module permissions to existing Administrador roles
-- First delete old coarse-grained permissions that no longer match any module
DELETE FROM public.role_permisos
WHERE modulo IN ('ventas','logistica','catalogo','almacen','finanzas','reportes','facturacion','configuracion')
AND role_id IN (SELECT id FROM public.roles WHERE nombre = 'Administrador' AND es_sistema = true);

-- Insert all granular permissions for existing Administrador roles
DO $$
DECLARE
  v_role RECORD;
  v_modulo text;
  v_accion text;
  v_modulos text[] := ARRAY[
    'dashboard','supervisor',
    'ventas','ventas.cobranza','ventas.promociones','pos',
    'clientes',
    'logistica.dashboard','logistica.pedidos','logistica.entregas','logistica.descargas','logistica.monitor','logistica.rutas','logistica.mapa_clientes','logistica.mapa_ventas',
    'catalogo.productos','catalogo.tarifas','catalogo.clasificaciones','catalogo.marcas','catalogo.proveedores','catalogo.unidades','catalogo.tasas_iva','catalogo.tasas_ieps',
    'almacen.inventario','almacen.traspasos','almacen.ajustes','almacen.auditorias','almacen.compras','almacen.lotes','almacen.almacenes',
    'finanzas.por_cobrar','finanzas.por_pagar','finanzas.gastos','finanzas.comisiones',
    'reportes.generales','reportes.entregas',
    'facturacion.cfdi','facturacion.catalogos',
    'configuracion.general','configuracion.usuarios','configuracion.whatsapp','configuracion.suscripcion'
  ];
  v_acciones text[] := ARRAY['ver','crear','editar','eliminar'];
BEGIN
  FOR v_role IN SELECT id FROM public.roles WHERE nombre = 'Administrador' AND es_sistema = true LOOP
    FOREACH v_modulo IN ARRAY v_modulos LOOP
      FOREACH v_accion IN ARRAY v_acciones LOOP
        INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
        VALUES (v_role.id, v_modulo, v_accion, true)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END $$;
