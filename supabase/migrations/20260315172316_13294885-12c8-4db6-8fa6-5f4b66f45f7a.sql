
CREATE TABLE public.billing_message_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL UNIQUE,
  campos jsonb NOT NULL DEFAULT '{}'::jsonb,
  emoji text NOT NULL DEFAULT '📋',
  encabezado text,
  pie_mensaje text,
  activo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_message_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage billing templates"
  ON public.billing_message_templates
  FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Insert default templates
INSERT INTO public.billing_message_templates (tipo, emoji, encabezado, campos) VALUES
('pre_cobro', '🔔', 'Aviso de cobro Rutapp', '{"nombre_cliente": true, "nombre_empresa": true, "monto": true, "fecha_cobro": true, "num_usuarios": true, "enlace_facturacion": true, "mensaje_despedida": true}'::jsonb),
('cobro_exitoso', '✅', 'Pago exitoso — Rutapp', '{"nombre_cliente": true, "nombre_empresa": true, "monto": true, "fecha_vigencia": true, "mensaje_despedida": true}'::jsonb),
('cobro_fallido', '⚠️', 'Cobro fallido — Rutapp', '{"nombre_cliente": true, "nombre_empresa": true, "monto": true, "dias_gracia": true, "enlace_pago": true, "advertencia_suspension": true}'::jsonb),
('suspension', '🔴', 'Cuenta suspendida — Rutapp', '{"nombre_cliente": true, "nombre_empresa": true, "enlace_facturacion": true, "mensaje_contacto": true}'::jsonb);
