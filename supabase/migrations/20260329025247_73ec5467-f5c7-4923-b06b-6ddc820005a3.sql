
-- Update handle_new_user to set owner_user_id on new empresa creation
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
    INSERT INTO public.empresas (nombre, telefono, email, owner_user_id)
    VALUES (
      v_empresa_nombre,
      COALESCE(NEW.raw_user_meta_data->>'phone', NEW.phone, ''),
      COALESCE(NEW.email, ''),
      NEW.id
    )
    RETURNING id INTO v_empresa_id;
    
    INSERT INTO public.roles (empresa_id, nombre, descripcion, es_sistema, acceso_ruta_movil)
    VALUES (v_empresa_id, 'Administrador', 'Rol de administrador con todos los permisos', true, true)
    RETURNING id INTO v_role_id;
    
    INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
    SELECT v_role_id, sub.modulo, sub.accion, true
    FROM (
      SELECT DISTINCT modulo, accion FROM public.role_permisos
      UNION
      SELECT m, a FROM 
        unnest(ARRAY['dashboard','catalogo','catalogo.productos','catalogo.proveedores','catalogo.tarifas','catalogo.unidades','catalogo.clasificaciones','catalogo.marcas','catalogo.tasas_iva','catalogo.tasas_ieps','clientes','almacen','almacen.inventario','almacen.almacenes','almacen.traspasos','almacen.compras','almacen.ajustes','almacen.auditorias','almacen.lotes','ventas','ventas.ventas','ventas.devoluciones','ventas.demanda','ventas.promociones','finanzas','finanzas.por_cobrar','finanzas.por_pagar','finanzas.gastos','finanzas.comisiones','logistica','logistica.dashboard','logistica.rutas','logistica.entregas','logistica.descargas','logistica.pedidos','logistica.monitor','logistica.mapa_clientes','logistica.mapa_ventas','reportes','reportes.entregas','reportes.vendedores','reportes.ventas_producto','reportes.ventas_cliente','reportes.producto_cliente','reportes.resumen','reportes.utilidad','reportes.diario','reportes.cargas','reportes.devoluciones','reportes.promociones','facturacion','facturacion.cfdi','facturacion.catalogos','configuracion','configuracion.general','configuracion.usuarios','configuracion.suscripcion','configuracion.whatsapp','pos','supervisor']) AS m,
        unnest(ARRAY['ver','crear','editar','eliminar','ver_todos']) AS a
    ) sub
    ON CONFLICT DO NOTHING;
    
    INSERT INTO public.profiles (user_id, nombre, empresa_id, telefono)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
      v_empresa_id,
      NEW.raw_user_meta_data->>'phone'
    );
    
    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (NEW.id, v_role_id);
    
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
