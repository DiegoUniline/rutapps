
-- Roles personalizables por empresa
CREATE TABLE public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  nombre text NOT NULL,
  descripcion text,
  es_sistema boolean NOT NULL DEFAULT false,
  acceso_ruta_movil boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, nombre)
);
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.roles FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- Asignación de roles a usuarios (profiles)
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_id)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check role access
CREATE OR REPLACE FUNCTION public.user_role_empresa_id(p_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT empresa_id FROM public.profiles WHERE user_id = p_user_id LIMIT 1;
$$;

CREATE POLICY "Tenant isolation" ON public.user_roles FOR ALL
USING (user_role_empresa_id(user_id) = get_my_empresa_id())
WITH CHECK (user_role_empresa_id(user_id) = get_my_empresa_id());

-- Permisos por rol: modulo + accion
CREATE TABLE public.role_permisos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  modulo text NOT NULL, -- ventas, clientes, catalogo, almacen, finanzas, reportes, configuracion
  accion text NOT NULL, -- ver, crear, editar, eliminar
  permitido boolean NOT NULL DEFAULT false,
  UNIQUE(role_id, modulo, accion)
);
ALTER TABLE public.role_permisos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.role_permisos FOR ALL
USING (EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_permisos.role_id AND r.empresa_id = get_my_empresa_id()))
WITH CHECK (EXISTS (SELECT 1 FROM public.roles r WHERE r.id = role_permisos.role_id AND r.empresa_id = get_my_empresa_id()));
