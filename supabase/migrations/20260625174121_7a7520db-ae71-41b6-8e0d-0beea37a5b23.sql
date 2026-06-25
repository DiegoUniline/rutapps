ALTER TABLE public.tienda_config
  ADD COLUMN IF NOT EXISTS usar_lista_cliente boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tienda_config.usar_lista_cliente IS
  'Si true (default), un cliente logueado ve los precios de la lista asignada a su ficha. Si false, todos ven la lista por defecto de la tienda.';