
-- Tabla de cupones de descuento
CREATE TABLE public.cupones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL,
  descripcion text DEFAULT '',
  descuento_pct numeric NOT NULL DEFAULT 0,
  planes_aplicables text[] DEFAULT '{}',
  uso_maximo int DEFAULT NULL,
  uso_por_empresa int DEFAULT 1,
  usos_actuales int DEFAULT 0,
  meses_duracion int DEFAULT NULL,
  acumulable boolean DEFAULT false,
  activo boolean DEFAULT true,
  vigencia_inicio date DEFAULT NULL,
  vigencia_fin date DEFAULT NULL,
  created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX cupones_codigo_unique ON public.cupones (UPPER(codigo));

ALTER TABLE public.cupones ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read active coupons
CREATE POLICY "cupones_select_authenticated" ON public.cupones
  FOR SELECT TO authenticated USING (true);

-- Only super admins can insert/update/delete
CREATE POLICY "cupones_insert_super_admin" ON public.cupones
  FOR INSERT TO authenticated WITH CHECK (public.is_super_admin(auth.uid()));

CREATE POLICY "cupones_update_super_admin" ON public.cupones
  FOR UPDATE TO authenticated USING (public.is_super_admin(auth.uid()));

CREATE POLICY "cupones_delete_super_admin" ON public.cupones
  FOR DELETE TO authenticated USING (public.is_super_admin(auth.uid()));

-- Tabla de usos de cupones
CREATE TABLE public.cupon_usos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cupon_id uuid NOT NULL REFERENCES public.cupones(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  subscription_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  aplicado_at timestamptz DEFAULT now(),
  meses_restantes int DEFAULT NULL
);

ALTER TABLE public.cupon_usos ENABLE ROW LEVEL SECURITY;

-- Super admins can do everything
CREATE POLICY "cupon_usos_super_admin" ON public.cupon_usos
  FOR ALL TO authenticated USING (public.is_super_admin(auth.uid()));

-- Users can see their own company's coupon usage
CREATE POLICY "cupon_usos_select_empresa" ON public.cupon_usos
  FOR SELECT TO authenticated USING (empresa_id = public.get_my_empresa_id());

-- Users can insert usage for their own company
CREATE POLICY "cupon_usos_insert_empresa" ON public.cupon_usos
  FOR INSERT TO authenticated WITH CHECK (empresa_id = public.get_my_empresa_id());
