-- Table to track cancellation attempts, surveys, and retention offers
CREATE TABLE public.cancellation_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reason text NOT NULL DEFAULT '',
  reason_detail text,
  offered_discount boolean NOT NULL DEFAULT false,
  discount_accepted boolean NOT NULL DEFAULT false,
  cancelled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cancellation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.cancellation_requests
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

CREATE POLICY "Super admins view all" ON public.cancellation_requests
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));