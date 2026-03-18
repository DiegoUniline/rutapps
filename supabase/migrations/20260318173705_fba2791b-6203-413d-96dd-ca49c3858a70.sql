
-- Expand old parent-only permissions into granular sub-module permissions
-- This handles roles that have e.g. 'catalogo' but not 'catalogo.productos'

DO $$
DECLARE
  r record;
  v_modulo text;
  v_accion text;
  v_parent text;
  v_sub_modules text[];
  v_sub text;
BEGIN
  -- Define parent -> sub-module mappings
  FOR r IN 
    SELECT DISTINCT rp.role_id, rp.modulo, rp.accion, rp.permitido
    FROM role_permisos rp
    WHERE rp.modulo IN ('catalogo','almacen','logistica','finanzas','reportes','facturacion','configuracion')
  LOOP
    v_parent := r.modulo;
    
    CASE v_parent
      WHEN 'catalogo' THEN
        v_sub_modules := ARRAY['catalogo.productos','catalogo.tarifas','catalogo.clasificaciones','catalogo.marcas','catalogo.proveedores','catalogo.unidades','catalogo.tasas_iva','catalogo.tasas_ieps'];
      WHEN 'almacen' THEN
        v_sub_modules := ARRAY['almacen.inventario','almacen.traspasos','almacen.ajustes','almacen.auditorias','almacen.compras','almacen.lotes','almacen.almacenes'];
      WHEN 'logistica' THEN
        v_sub_modules := ARRAY['logistica.dashboard','logistica.pedidos','logistica.entregas','logistica.descargas','logistica.monitor','logistica.rutas','logistica.mapa_clientes','logistica.mapa_ventas'];
      WHEN 'finanzas' THEN
        v_sub_modules := ARRAY['finanzas.por_cobrar','finanzas.por_pagar','finanzas.gastos','finanzas.comisiones'];
      WHEN 'reportes' THEN
        v_sub_modules := ARRAY['reportes.generales','reportes.entregas'];
      WHEN 'facturacion' THEN
        v_sub_modules := ARRAY['facturacion.cfdi','facturacion.catalogos'];
      WHEN 'configuracion' THEN
        v_sub_modules := ARRAY['configuracion.general','configuracion.usuarios','configuracion.whatsapp','configuracion.suscripcion'];
      ELSE
        v_sub_modules := ARRAY[]::text[];
    END CASE;

    FOREACH v_sub IN ARRAY v_sub_modules LOOP
      INSERT INTO role_permisos (role_id, modulo, accion, permitido)
      VALUES (r.role_id, v_sub, r.accion, r.permitido)
      ON CONFLICT DO NOTHING;
    END LOOP;
  END LOOP;

  -- Also ensure 'dashboard' and 'supervisor' exist for roles that have old parent perms
  FOR r IN
    SELECT DISTINCT rp.role_id
    FROM role_permisos rp
    WHERE rp.modulo IN ('catalogo','almacen','logistica','finanzas','reportes','facturacion','configuracion')
  LOOP
    FOREACH v_modulo IN ARRAY ARRAY['dashboard','supervisor'] LOOP
      FOREACH v_accion IN ARRAY ARRAY['ver','crear','editar','eliminar'] LOOP
        INSERT INTO role_permisos (role_id, modulo, accion, permitido)
        VALUES (r.role_id, v_modulo, v_accion, true)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
    
    -- ventas sub-modules
    FOREACH v_modulo IN ARRAY ARRAY['ventas.cobranza','ventas.promociones'] LOOP
      FOREACH v_accion IN ARRAY ARRAY['ver','crear','editar','eliminar'] LOOP
        INSERT INTO role_permisos (role_id, modulo, accion, permitido)
        VALUES (r.role_id, v_modulo, v_accion, true)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;
