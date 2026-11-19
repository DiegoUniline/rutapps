
-- Super admins table
CREATE TABLE public.super_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  email text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.super_admins ENABLE ROW LEVEL SECURITY;

-- Subscription plans table
CREATE TABLE public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  periodo text NOT NULL DEFAULT 'mensual', -- mensual, semestral, anual
  precio_por_usuario numeric NOT NULL DEFAULT 300,
  descuento_pct numeric NOT NULL DEFAULT 0,
  meses integer NOT NULL DEFAULT 1,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Subscriptions per empresa
CREATE TABLE public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES public.subscription_plans(id),
  status text NOT NULL DEFAULT 'trial', -- trial, active, past_due, cancelled, suspended
  trial_ends_at timestamptz,
  current_period_start date,
  current_period_end date,
  max_usuarios integer NOT NULL DEFAULT 3,
  stripe_customer_id text,
  stripe_subscription_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Super admins can see everything
CREATE POLICY "Super admins full access on super_admins" ON public.super_admins
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  );

-- Super admins can manage all subscriptions, empresas can see own
CREATE POLICY "Super admins full access on subscriptions" ON public.subscriptions
  FOR ALL TO authenticated
  USING (
    empresa_id = get_my_empresa_id()
    OR EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid())
  );

-- Super admins can manage subscription plans
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read plans" ON public.subscription_plans
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Super admins manage plans" ON public.subscription_plans
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.super_admins sa WHERE sa.user_id = auth.uid()));

-- Insert default plans
INSERT INTO public.subscription_plans (nombre, periodo, precio_por_usuario, descuento_pct, meses) VALUES
  ('Mensual', 'mensual', 300, 0, 1),
  ('Semestral', 'semestral', 270, 10, 6),
  ('Anual', 'anual', 255, 15, 12);

-- Function to check if user is super admin
CREATE OR REPLACE FUNCTION public.is_super_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.super_admins WHERE user_id = p_user_id);
$$;
