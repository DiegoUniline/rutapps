
-- Historial de cambios en ventas
CREATE TABLE public.venta_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  user_id uuid NOT NULL,
  user_nombre text NOT NULL DEFAULT '',
  accion text NOT NULL, -- 'creada', 'editada', 'confirmada', 'cancelada', 'vuelta_borrador', 'pago_agregado', 'pago_eliminado', 'linea_agregada', 'linea_editada', 'linea_eliminada', 'entregada', 'facturada'
  detalles jsonb DEFAULT '{}'::jsonb, -- { campo: 'total', anterior: 100, nuevo: 150 } or array of changes
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venta_historial ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.venta_historial
  FOR ALL TO authenticated
  USING (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = get_my_empresa_id() OR is_super_admin(auth.uid()));

CREATE INDEX idx_venta_historial_venta ON public.venta_historial(venta_id);
CREATE INDEX idx_venta_historial_empresa ON public.venta_historial(empresa_id);
