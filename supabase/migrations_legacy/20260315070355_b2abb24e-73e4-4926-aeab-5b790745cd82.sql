-- Enum for movement types
CREATE TYPE public.tipo_movimiento AS ENUM ('entrada', 'salida', 'transferencia');

-- Inventory movements table
CREATE TABLE public.movimientos_inventario (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  tipo public.tipo_movimiento NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad numeric NOT NULL DEFAULT 0,
  unidad_id uuid REFERENCES public.unidades(id),
  -- Origin / destination
  almacen_origen_id uuid REFERENCES public.almacenes(id),
  almacen_destino_id uuid REFERENCES public.almacenes(id),
  vendedor_destino_id uuid REFERENCES public.vendedores(id),
  -- Reference document
  referencia_tipo text, -- 'entrega', 'devolucion', 'compra', 'ajuste'
  referencia_id uuid,
  -- Metadata
  notas text,
  user_id uuid,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.movimientos_inventario ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.movimientos_inventario
  FOR ALL TO public
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Index for quick lookups
CREATE INDEX idx_movimientos_producto ON public.movimientos_inventario(producto_id, fecha);
CREATE INDEX idx_movimientos_referencia ON public.movimientos_inventario(referencia_tipo, referencia_id);
