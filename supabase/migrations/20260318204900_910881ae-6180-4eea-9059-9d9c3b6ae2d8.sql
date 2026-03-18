
-- Per-warehouse stock tracking table
CREATE TABLE public.stock_almacen (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (almacen_id, producto_id)
);

ALTER TABLE public.stock_almacen ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.stock_almacen
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Initialize: put all current stock into the first almacen of each empresa
INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
SELECT p.empresa_id, a.id, p.id, p.cantidad
FROM public.productos p
JOIN LATERAL (
  SELECT id FROM public.almacenes WHERE empresa_id = p.empresa_id ORDER BY created_at ASC LIMIT 1
) a ON true
WHERE p.cantidad > 0 AND p.status = 'activo';
