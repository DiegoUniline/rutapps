
-- Enum for descarga status
CREATE TYPE public.status_descarga AS ENUM ('pendiente', 'aprobada', 'rechazada');

-- Enum for motivo de diferencia
CREATE TYPE public.motivo_diferencia AS ENUM ('error_entrega', 'merma', 'danado', 'faltante', 'sobrante', 'otro');

-- Main descarga_ruta table
CREATE TABLE public.descarga_ruta (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  carga_id uuid NOT NULL REFERENCES public.cargas(id),
  vendedor_id uuid REFERENCES public.vendedores(id),
  user_id uuid NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  status status_descarga NOT NULL DEFAULT 'pendiente',
  efectivo_esperado numeric NOT NULL DEFAULT 0,
  efectivo_entregado numeric NOT NULL DEFAULT 0,
  diferencia_efectivo numeric NOT NULL DEFAULT 0,
  notas text,
  aprobado_por uuid,
  fecha_aprobacion timestamptz,
  notas_supervisor text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.descarga_ruta ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.descarga_ruta
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Descarga line items
CREATE TABLE public.descarga_ruta_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  descarga_id uuid NOT NULL REFERENCES public.descarga_ruta(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad_esperada numeric NOT NULL DEFAULT 0,
  cantidad_real numeric NOT NULL DEFAULT 0,
  diferencia numeric NOT NULL DEFAULT 0,
  motivo motivo_diferencia,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.descarga_ruta_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.descarga_ruta_lineas
  FOR ALL USING (
    EXISTS (SELECT 1 FROM descarga_ruta d WHERE d.id = descarga_ruta_lineas.descarga_id AND d.empresa_id = get_my_empresa_id())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM descarga_ruta d WHERE d.id = descarga_ruta_lineas.descarga_id AND d.empresa_id = get_my_empresa_id())
  );
