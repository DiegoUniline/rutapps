CREATE TABLE public.billing_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_email text NOT NULL,
  customer_phone text,
  channel text NOT NULL DEFAULT 'whatsapp',
  tipo text NOT NULL DEFAULT 'factura',
  mensaje text,
  stripe_invoice_id text,
  stripe_invoice_url text,
  monto_centavos integer DEFAULT 0,
  status text NOT NULL DEFAULT 'sent',
  error_detalle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage billing_notifications"
  ON public.billing_notifications FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));