
-- Entries table for accumulative counting per audit line
CREATE TABLE public.auditoria_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auditoria_linea_id uuid NOT NULL REFERENCES public.auditoria_lineas(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL DEFAULT 1,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.auditoria_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.auditoria_entradas
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auditoria_lineas al
      JOIN auditorias a ON a.id = al.auditoria_id
      WHERE al.id = auditoria_entradas.auditoria_linea_id
      AND a.empresa_id = get_my_empresa_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM auditoria_lineas al
      JOIN auditorias a ON a.id = al.auditoria_id
      WHERE al.id = auditoria_entradas.auditoria_linea_id
      AND a.empresa_id = get_my_empresa_id()
    )
  );
