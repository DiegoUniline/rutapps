-- Facturación · Fase 0-A (D-013): ambiente Facturama por empresa y permiso de configuración.
-- Solo agrega columnas/funciones/trigger; no mueve datos.

-- 1) Ambiente por empresa (sandbox para pruebas sin gastar timbres reales) y por documento,
--    para que descargar/cancelar use el mismo ambiente con que se timbró.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS facturama_ambiente text NOT NULL DEFAULT 'produccion',
  ADD COLUMN IF NOT EXISTS csd_no_certificado text,
  ADD COLUMN IF NOT EXISTS csd_vence timestamptz;
ALTER TABLE public.cfdis ADD COLUMN IF NOT EXISTS facturama_ambiente text NOT NULL DEFAULT 'produccion';
ALTER TABLE public.cfdi_pagos ADD COLUMN IF NOT EXISTS facturama_ambiente text NOT NULL DEFAULT 'produccion';

DO $$ BEGIN
  ALTER TABLE public.empresas ADD CONSTRAINT empresas_facturama_ambiente_chk CHECK (facturama_ambiente IN ('produccion','sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.cfdis ADD CONSTRAINT cfdis_facturama_ambiente_chk CHECK (facturama_ambiente IN ('produccion','sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE public.cfdi_pagos ADD CONSTRAINT cfdi_pagos_facturama_ambiente_chk CHECK (facturama_ambiente IN ('produccion','sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) ¿Puede configurar facturación (CSD, ambiente)? Misma regla que usePermisos:
--    super admin; dueño de la empresa; sin rol asignado = acceso total; con rol,
--    se requiere facturacion.cfdi · editar.
CREATE OR REPLACE FUNCTION public.puede_configurar_facturacion(p_user_id uuid, p_empresa_id uuid)
 RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT p_user_id IS NOT NULL AND p_empresa_id IS NOT NULL AND (
    public.is_super_admin(p_user_id)
    OR (
      EXISTS (SELECT 1 FROM public.profiles p WHERE p.user_id = p_user_id AND p.empresa_id = p_empresa_id)
      AND (
        EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = p_empresa_id AND e.owner_user_id = p_user_id)
        OR NOT EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p_user_id)
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          JOIN public.role_permisos rp ON rp.role_id = ur.role_id
          WHERE ur.user_id = p_user_id AND rp.modulo = 'facturacion.cfdi' AND rp.accion = 'editar' AND rp.permitido)
      )
    )
  );
$function$;
REVOKE ALL ON FUNCTION public.puede_configurar_facturacion(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.puede_configurar_facturacion(uuid, uuid) TO service_role;

-- 3) El ambiente y los datos del CSD solo los cambia la función facturama (service_role)
--    o el super admin: un usuario no puede pasar su empresa a sandbox desde el navegador.
CREATE OR REPLACE FUNCTION public.fn_guard_empresa_facturama()
 RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.facturama_ambiente IS DISTINCT FROM OLD.facturama_ambiente
      OR NEW.csd_no_certificado IS DISTINCT FROM OLD.csd_no_certificado
      OR NEW.csd_vence IS DISTINCT FROM OLD.csd_vence)
     AND COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'El ambiente de facturación y el CSD se cambian desde Facturación › Configuración.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS trg_guard_empresa_facturama ON public.empresas;
CREATE TRIGGER trg_guard_empresa_facturama BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_empresa_facturama();
