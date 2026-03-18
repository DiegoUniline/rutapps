
-- Table: planes (subscription plans catalog)
CREATE TABLE public.planes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre text NOT NULL,
  precio_base_mes numeric NOT NULL,
  usuarios_incluidos integer NOT NULL DEFAULT 1,
  precio_usuario_extra numeric NOT NULL DEFAULT 0,
  stripe_product_id text,
  stripe_price_id text,
  descripcion text,
  activo boolean DEFAULT true,
  creado_en timestamptz DEFAULT now()
);

ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read active plans"
  ON public.planes FOR SELECT TO authenticated
  USING (true);

-- Table: facturas (billing invoices)
CREATE TABLE public.facturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE NOT NULL,
  suscripcion_id uuid REFERENCES public.subscriptions(id) ON DELETE SET NULL,
  numero_factura text,
  periodo_inicio date NOT NULL,
  periodo_fin date NOT NULL,
  num_usuarios integer NOT NULL DEFAULT 1,
  precio_unitario numeric NOT NULL DEFAULT 0,
  descuento_porcentaje numeric DEFAULT 0,
  subtotal numeric NOT NULL DEFAULT 0,
  total numeric NOT NULL DEFAULT 0,
  estado text DEFAULT 'pendiente', -- pendiente|procesando|pagada|cancelada
  es_prorrateo boolean DEFAULT false,
  fecha_emision timestamptz DEFAULT now(),
  fecha_pago timestamptz,
  fecha_vencimiento timestamptz,
  stripe_invoice_id text,
  stripe_payment_intent_id text,
  creado_en timestamptz DEFAULT now()
);

ALTER TABLE public.facturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own company invoices"
  ON public.facturas FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Super admins can manage all invoices"
  ON public.facturas FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()));

-- Auto-generate invoice numbers
CREATE OR REPLACE FUNCTION public.auto_numero_factura()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero_factura IS NULL OR NEW.numero_factura = '' THEN
    SELECT 'FAC-' || LPAD((COALESCE(MAX(
      CASE WHEN numero_factura ~ '^FAC-[0-9]+$'
        THEN CAST(SUBSTRING(numero_factura FROM 5) AS INT)
        ELSE 0
      END
    ), 0) + 1)::TEXT, 5, '0')
    INTO NEW.numero_factura
    FROM public.facturas
    WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_numero_factura
  BEFORE INSERT ON public.facturas
  FOR EACH ROW EXECUTE FUNCTION public.auto_numero_factura();

-- Add plan_id to subscriptions if not exists
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES public.planes(id);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS descuento_porcentaje numeric DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS es_manual boolean DEFAULT false;
