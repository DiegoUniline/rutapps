
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS modo_compra_sugerida text NOT NULL DEFAULT 'maximo',
  ADD COLUMN IF NOT EXISTS dias_cobertura integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS lead_time_dias integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proveedor_preferido_id uuid REFERENCES public.proveedores(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'productos_modo_compra_sugerida_check') THEN
    ALTER TABLE public.productos
      ADD CONSTRAINT productos_modo_compra_sugerida_check
      CHECK (modo_compra_sugerida IN ('maximo','medio','minimo','cobertura'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_productos_proveedor_preferido ON public.productos(proveedor_preferido_id);
