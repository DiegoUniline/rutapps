
CREATE TABLE public.solicitudes_pago (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  tipo text NOT NULL DEFAULT 'suscripcion',
  concepto text NOT NULL DEFAULT '',
  monto_centavos integer NOT NULL DEFAULT 0,
  metodo text NOT NULL DEFAULT 'transferencia',
  comprobante_url text,
  notas text,
  status text NOT NULL DEFAULT 'pendiente',
  aprobado_por uuid,
  fecha_aprobacion timestamptz,
  notas_admin text,
  plan_price_id text,
  cantidad_usuarios integer,
  cantidad_timbres integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.solicitudes_pago ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own empresa solicitudes"
  ON public.solicitudes_pago FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

CREATE POLICY "Users can create solicitudes"
  ON public.solicitudes_pago FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_my_empresa_id() AND user_id = auth.uid());

CREATE POLICY "Super admins full access solicitudes"
  ON public.solicitudes_pago FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()));
