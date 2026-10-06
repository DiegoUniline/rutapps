CREATE OR REPLACE FUNCTION public.ensure_empresa_admin_role(p_empresa_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_owner uuid;
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
  SELECT id INTO v_role_id FROM public.roles
  WHERE empresa_id = p_empresa_id AND nombre = 'Administrador' LIMIT 1;

  IF v_role_id IS NULL THEN
    INSERT INTO public.roles (empresa_id, nombre, descripcion, es_sistema, acceso_ruta_movil)
    VALUES (p_empresa_id, 'Administrador', 'Acceso total al sistema', true, true)
    RETURNING id INTO v_role_id;

    FOREACH v_modulo IN ARRAY v_modulos LOOP
      FOREACH v_accion IN ARRAY v_acciones LOOP
        INSERT INTO public.role_permisos (role_id, modulo, accion, permitido)
        VALUES (v_role_id, v_modulo, v_accion, true)
        ON CONFLICT DO NOTHING;
      END LOOP;
    END LOOP;
  END IF;

  SELECT owner_user_id INTO v_owner FROM public.empresas WHERE id = p_empresa_id;
  IF v_owner IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_owner) THEN
    INSERT INTO public.user_roles (user_id, role_id) VALUES (v_owner, v_role_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN v_role_id;
END;
$$;

REVOKE ALL ON FUNCTION public.ensure_empresa_admin_role(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_empresa_admin_role(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.trg_subscription_reactivada_admin_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('active','trialing')
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.empresa_id IS NOT NULL THEN
    PERFORM public.ensure_empresa_admin_role(NEW.empresa_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_subscription_reactivada_admin_role ON public.subscriptions;
CREATE TRIGGER trg_subscription_reactivada_admin_role
AFTER INSERT OR UPDATE OF status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.trg_subscription_reactivada_admin_role();