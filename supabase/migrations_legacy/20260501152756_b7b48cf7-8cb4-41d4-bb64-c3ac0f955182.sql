CREATE TABLE IF NOT EXISTS public.cobro_reintentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  factura_id uuid NOT NULL REFERENCES public.facturas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  stripe_invoice_id text,
  intento_num int NOT NULL CHECK (intento_num BETWEEN 1 AND 3),
  proxima_fecha date NOT NULL,
  estado text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','procesado','exitoso','fallido')),
  ultimo_error text,
  procesado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cobro_reintentos_pendientes
  ON public.cobro_reintentos (proxima_fecha, estado)
  WHERE estado = 'pendiente';

CREATE INDEX IF NOT EXISTS idx_cobro_reintentos_factura
  ON public.cobro_reintentos (factura_id);

ALTER TABLE public.cobro_reintentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin can manage cobro_reintentos"
  ON public.cobro_reintentos
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

CREATE TRIGGER trg_cobro_reintentos_updated_at
  BEFORE UPDATE ON public.cobro_reintentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Fix Salgado: point local sub to the new active Stripe subscription
UPDATE public.subscriptions
SET stripe_subscription_id = 'sub_1TSIorCUpJnsv7ilnxiMetSL',
    updated_at = now()
WHERE empresa_id = 'dad7a4a0-6ed7-458c-a3a2-82ecf83a64dd'
  AND stripe_subscription_id = 'sub_1TOKddCUpJnsv7ilfVcpTwMX';