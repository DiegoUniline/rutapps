
-- Add payment-related columns to compras
ALTER TABLE public.compras
  ADD COLUMN IF NOT EXISTS condicion_pago text NOT NULL DEFAULT 'contado',
  ADD COLUMN IF NOT EXISTS saldo_pendiente numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_credito integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notas_pago text;

-- Create pago_compras table
CREATE TABLE IF NOT EXISTS public.pago_compras (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  proveedor_id uuid REFERENCES public.proveedores(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  monto numeric NOT NULL DEFAULT 0,
  metodo_pago text NOT NULL DEFAULT 'transferencia',
  referencia text,
  notas text,
  user_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- RLS for pago_compras
ALTER TABLE public.pago_compras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.pago_compras
  FOR ALL
  USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Auto folio for compras
CREATE OR REPLACE FUNCTION public.auto_folio_compra()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    SELECT 'COM-' || LPAD((COALESCE(MAX(
      CASE WHEN folio ~ '^COM-[0-9]+$'
        THEN CAST(SUBSTRING(folio FROM 5) AS INT)
        ELSE 0
      END
    ), 0) + 1)::TEXT, 4, '0')
    INTO NEW.folio
    FROM public.compras
    WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_folio_compra ON public.compras;
CREATE TRIGGER trg_auto_folio_compra
  BEFORE INSERT ON public.compras
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_folio_compra();
