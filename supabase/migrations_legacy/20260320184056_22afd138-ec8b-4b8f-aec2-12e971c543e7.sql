
CREATE TABLE public.payment_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  empresa_nombre text NOT NULL DEFAULT '',
  openpay_customer_id text,
  openpay_plan_id text NOT NULL,
  plan_name text NOT NULL DEFAULT '',
  plan_amount numeric NOT NULL DEFAULT 0,
  plan_currency text NOT NULL DEFAULT 'MXN',
  plan_repeat_unit text NOT NULL DEFAULT 'month',
  customer_name text NOT NULL DEFAULT '',
  customer_email text NOT NULL DEFAULT '',
  customer_phone text,
  status text NOT NULL DEFAULT 'pending',
  openpay_subscription_id text,
  openpay_card_id text,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

-- Super admins can manage
CREATE POLICY "Super admins manage payment_links"
ON public.payment_links FOR ALL TO authenticated
USING (is_super_admin(auth.uid()));

-- Public read by token (for the payment page)
CREATE POLICY "Public read payment_links by token"
ON public.payment_links FOR SELECT TO anon
USING (true);
