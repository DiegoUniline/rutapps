-- Add pedido_origen_id to ventas for partial delivery tracking
ALTER TABLE public.ventas ADD COLUMN pedido_origen_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL;

-- Add almacen_id and repartidor_id to cargas
ALTER TABLE public.cargas ADD COLUMN almacen_id uuid REFERENCES public.almacenes(id) ON DELETE SET NULL;
ALTER TABLE public.cargas ADD COLUMN repartidor_id uuid REFERENCES public.vendedores(id) ON DELETE SET NULL;