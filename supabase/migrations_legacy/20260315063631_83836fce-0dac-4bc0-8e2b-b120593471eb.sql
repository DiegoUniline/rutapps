
ALTER TABLE public.cargas ADD COLUMN almacen_destino_id uuid REFERENCES public.almacenes(id) ON DELETE SET NULL;
