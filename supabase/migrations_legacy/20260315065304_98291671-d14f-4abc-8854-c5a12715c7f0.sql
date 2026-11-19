
-- Enum for entrega status
CREATE TYPE public.status_entrega AS ENUM ('borrador', 'listo', 'hecho', 'cancelado');

-- Entregas table
CREATE TABLE public.entregas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  folio text,
  pedido_id uuid REFERENCES public.ventas(id),
  vendedor_id uuid REFERENCES public.vendedores(id),
  cliente_id uuid REFERENCES public.clientes(id),
  almacen_id uuid REFERENCES public.almacenes(id),
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  status public.status_entrega NOT NULL DEFAULT 'borrador',
  validado_por uuid,
  validado_at timestamptz,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entregas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.entregas
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());

-- Auto folio for entregas
CREATE OR REPLACE FUNCTION public.auto_folio_entrega()
  RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    SELECT 'ENT-' || LPAD((COALESCE(MAX(
      CASE WHEN folio ~ '^ENT-[0-9]+$'
        THEN CAST(SUBSTRING(folio FROM 5) AS INT)
        ELSE 0
      END
    ), 0) + 1)::TEXT, 4, '0')
    INTO NEW.folio
    FROM public.entregas
    WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_folio_entrega
  BEFORE INSERT ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.auto_folio_entrega();

-- Entrega lineas
CREATE TABLE public.entrega_lineas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entrega_id uuid NOT NULL REFERENCES public.entregas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  unidad_id uuid REFERENCES public.unidades(id),
  cantidad_pedida numeric NOT NULL DEFAULT 0,
  cantidad_entregada numeric NOT NULL DEFAULT 0,
  hecho boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.entrega_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.entrega_lineas
  FOR ALL USING (EXISTS (SELECT 1 FROM entregas e WHERE e.id = entrega_lineas.entrega_id AND e.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM entregas e WHERE e.id = entrega_lineas.entrega_id AND e.empresa_id = get_my_empresa_id()));

-- Stock camion
CREATE TABLE public.stock_camion (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  vendedor_id uuid NOT NULL REFERENCES public.vendedores(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad_inicial numeric NOT NULL DEFAULT 0,
  cantidad_actual numeric NOT NULL DEFAULT 0,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_camion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation" ON public.stock_camion
  FOR ALL USING (empresa_id = get_my_empresa_id())
  WITH CHECK (empresa_id = get_my_empresa_id());
