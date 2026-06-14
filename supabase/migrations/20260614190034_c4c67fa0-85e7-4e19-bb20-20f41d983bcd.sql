
CREATE OR REPLACE FUNCTION public.set_updated_at_cotizaciones()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;$$;

CREATE TABLE IF NOT EXISTS public.cotizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  folio text,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  vendedor_id uuid,
  tarifa_id uuid REFERENCES public.tarifas(id) ON DELETE SET NULL,
  almacen_id uuid REFERENCES public.almacenes(id) ON DELETE SET NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  vigencia_dias integer NOT NULL DEFAULT 15,
  vence_at date,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  descuento numeric(14,2) NOT NULL DEFAULT 0,
  impuestos numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  moneda text DEFAULT 'MXN',
  notas text,
  estado text NOT NULL DEFAULT 'borrador',
  venta_id uuid,
  enviada_wa_at timestamptz,
  token_publico uuid NOT NULL DEFAULT gen_random_uuid(),
  cliente_snapshot jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_empresa ON public.cotizaciones(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_cliente ON public.cotizaciones(cliente_id);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_estado ON public.cotizaciones(estado);
CREATE INDEX IF NOT EXISTS idx_cotizaciones_token ON public.cotizaciones(token_publico);

CREATE TABLE IF NOT EXISTS public.cotizacion_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotizacion_id uuid NOT NULL REFERENCES public.cotizaciones(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  producto_id uuid REFERENCES public.productos(id) ON DELETE SET NULL,
  descripcion text,
  cantidad numeric(14,3) NOT NULL DEFAULT 1,
  precio_unitario numeric(14,4) NOT NULL DEFAULT 0,
  descuento_pct numeric(6,2) NOT NULL DEFAULT 0,
  impuesto_pct numeric(6,2) NOT NULL DEFAULT 0,
  subtotal numeric(14,2) NOT NULL DEFAULT 0,
  impuesto numeric(14,2) NOT NULL DEFAULT 0,
  total numeric(14,2) NOT NULL DEFAULT 0,
  producto_snapshot jsonb,
  orden integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cotlineas_cot ON public.cotizacion_lineas(cotizacion_id);
CREATE INDEX IF NOT EXISTS idx_cotlineas_empresa ON public.cotizacion_lineas(empresa_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizaciones TO authenticated;
GRANT ALL ON public.cotizaciones TO service_role;
GRANT SELECT ON public.cotizaciones TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cotizacion_lineas TO authenticated;
GRANT ALL ON public.cotizacion_lineas TO service_role;
GRANT SELECT ON public.cotizacion_lineas TO anon;

ALTER TABLE public.cotizaciones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotizacion_lineas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cotizaciones empresa access" ON public.cotizaciones
  FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cotizaciones public token read" ON public.cotizaciones FOR SELECT TO anon USING (true);

CREATE POLICY "cotlineas empresa access" ON public.cotizacion_lineas
  FOR ALL TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()))
  WITH CHECK (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "cotlineas public read" ON public.cotizacion_lineas FOR SELECT TO anon USING (true);

CREATE TRIGGER trg_cotizaciones_updated_at BEFORE UPDATE ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at_cotizaciones();

CREATE OR REPLACE FUNCTION public.trg_cotizacion_before_insert()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE next_num int;
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    SELECT COALESCE(MAX(NULLIF(regexp_replace(folio, '\D', '', 'g'), '')::int), 0) + 1
      INTO next_num FROM public.cotizaciones WHERE empresa_id = NEW.empresa_id;
    NEW.folio := 'COT-' || LPAD(next_num::text, 5, '0');
  END IF;
  IF NEW.vence_at IS NULL THEN
    NEW.vence_at := NEW.fecha + (NEW.vigencia_dias || ' days')::interval;
  END IF;
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_cotizacion_before_insert BEFORE INSERT ON public.cotizaciones
FOR EACH ROW EXECUTE FUNCTION public.trg_cotizacion_before_insert();

CREATE OR REPLACE FUNCTION public.validar_stock_cotizacion(p_cotizacion_id uuid, p_almacen_id uuid)
RETURNS TABLE (
  producto_id uuid,
  descripcion text,
  cantidad_solicitada numeric,
  stock_disponible numeric,
  faltante numeric,
  ok boolean
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    cl.producto_id,
    COALESCE(cl.descripcion, p.nombre) AS descripcion,
    cl.cantidad AS cantidad_solicitada,
    COALESCE(sa.cantidad, 0) AS stock_disponible,
    GREATEST(cl.cantidad - COALESCE(sa.cantidad, 0), 0) AS faltante,
    (COALESCE(sa.cantidad, 0) >= cl.cantidad OR COALESCE(p.vender_sin_stock, false)) AS ok
  FROM public.cotizacion_lineas cl
  LEFT JOIN public.productos p ON p.id = cl.producto_id
  LEFT JOIN public.stock_almacen sa ON sa.producto_id = cl.producto_id AND sa.almacen_id = p_almacen_id
  WHERE cl.cotizacion_id = p_cotizacion_id AND cl.producto_id IS NOT NULL;
$$;
