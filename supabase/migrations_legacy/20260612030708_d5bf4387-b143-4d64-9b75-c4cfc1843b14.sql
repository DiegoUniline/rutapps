ALTER TABLE public.metas_venta
  ADD COLUMN IF NOT EXISTS clasificacion_id uuid REFERENCES public.clasificaciones(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS marca_id uuid REFERENCES public.marcas(id) ON DELETE CASCADE;

DROP INDEX IF EXISTS public.metas_venta_unique_key;

CREATE UNIQUE INDEX metas_venta_unique_key ON public.metas_venta (
  empresa_id,
  COALESCE(vendedor_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(producto_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(presentacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(clasificacion_id, '00000000-0000-0000-0000-000000000000'::uuid),
  COALESCE(marca_id, '00000000-0000-0000-0000-000000000000'::uuid),
  periodo_year,
  periodo_month
);