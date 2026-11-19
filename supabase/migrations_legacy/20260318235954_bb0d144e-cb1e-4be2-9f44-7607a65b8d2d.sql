ALTER TABLE public.lista_precios 
ADD COLUMN share_token uuid NOT NULL DEFAULT gen_random_uuid(),
ADD COLUMN share_activo boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX idx_lista_precios_share_token ON public.lista_precios (share_token);
