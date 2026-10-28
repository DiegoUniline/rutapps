-- =====================================================================
-- Facturación · Fase 3 (D-013, D-016): abrir la facturación a las empresas por permiso.
-- puede_facturar(usuario, empresa, acción): super admin, o usuario de la empresa que sea
-- dueño, no tenga rol (acceso total, igual que la app) o tenga facturacion.cfdi · <acción>.
-- Acciones: ver (consultar), crear (timbrar, complemento, global, sustituir, correo),
-- eliminar (cancelar ante el SAT). Configurar CSD/ambiente/serie sigue en puede_configurar_facturacion.
-- Idempotente. Lo ejecuta el dueño (D-002).
-- =====================================================================
BEGIN;

DO $$ BEGIN IF to_regclass('public.stock_almacen') IS NULL THEN RAISE EXCEPTION 'Proyecto equivocado'; END IF; END $$;

CREATE OR REPLACE FUNCTION public.puede_facturar(p_user_id uuid, p_empresa_id uuid, p_accion text)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL AND p_empresa_id IS NOT NULL AND p_accion IN ('ver','crear','editar','eliminar') AND (
    public.is_super_admin(p_user_id)
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id AND p.empresa_id = p_empresa_id)
      AND (
        EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id AND e.owner_user_id = p_user_id)
        OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.role_permisos rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = p_user_id AND rp.modulo = 'facturacion.cfdi' AND rp.accion = p_accion AND rp.permitido)
      )
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.puede_facturar(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_facturar(uuid, uuid, text) TO service_role;

COMMIT;
