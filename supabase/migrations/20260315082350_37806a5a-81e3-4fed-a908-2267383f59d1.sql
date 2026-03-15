
-- Enum for traspaso types
CREATE TYPE public.tipo_traspaso AS ENUM ('almacen_almacen', 'almacen_ruta', 'ruta_almacen');
CREATE TYPE public.status_traspaso AS ENUM ('borrador', 'confirmado', 'cancelado');
CREATE TYPE public.status_auditoria AS ENUM ('pendiente', 'en_proceso', 'por_aprobar', 'aprobada', 'rechazada');

-- Traspasos
CREATE TABLE public.traspasos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  tipo tipo_traspaso NOT NULL DEFAULT 'almacen_almacen',
  status status_traspaso NOT NULL DEFAULT 'borrador',
  almacen_origen_id UUID REFERENCES public.almacenes(id),
  almacen_destino_id UUID REFERENCES public.almacenes(id),
  vendedor_origen_id UUID REFERENCES public.vendedores(id),
  vendedor_destino_id UUID REFERENCES public.vendedores(id),
  folio TEXT,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  notas TEXT,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.traspasos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.traspasos FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

CREATE TABLE public.traspaso_lineas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  traspaso_id UUID NOT NULL REFERENCES public.traspasos(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.traspaso_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.traspaso_lineas FOR ALL
  USING (EXISTS (SELECT 1 FROM traspasos t WHERE t.id = traspaso_lineas.traspaso_id AND t.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM traspasos t WHERE t.id = traspaso_lineas.traspaso_id AND t.empresa_id = get_my_empresa_id()));

-- Auto folio for traspasos
CREATE OR REPLACE FUNCTION public.auto_folio_traspaso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    SELECT 'TRA-' || LPAD((COALESCE(MAX(
      CASE WHEN folio ~ '^TRA-[0-9]+$'
        THEN CAST(SUBSTRING(folio FROM 5) AS INT)
        ELSE 0 END
    ), 0) + 1)::TEXT, 4, '0')
    INTO NEW.folio FROM public.traspasos WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_folio_traspaso BEFORE INSERT ON public.traspasos
FOR EACH ROW EXECUTE FUNCTION public.auto_folio_traspaso();

-- Ajustes de inventario
CREATE TABLE public.ajustes_inventario (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  almacen_id UUID REFERENCES public.almacenes(id),
  cantidad_anterior NUMERIC NOT NULL DEFAULT 0,
  cantidad_nueva NUMERIC NOT NULL DEFAULT 0,
  diferencia NUMERIC NOT NULL DEFAULT 0,
  motivo TEXT,
  user_id UUID NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.ajustes_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.ajustes_inventario FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- Auditorías
CREATE TABLE public.auditorias (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL REFERENCES public.empresas(id),
  nombre TEXT NOT NULL,
  filtro_tipo TEXT NOT NULL DEFAULT 'todos',
  filtro_valor TEXT,
  status status_auditoria NOT NULL DEFAULT 'pendiente',
  notas TEXT,
  notas_supervisor TEXT,
  aprobado_por UUID,
  fecha_aprobacion TIMESTAMPTZ,
  user_id UUID NOT NULL,
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auditorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.auditorias FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

CREATE TABLE public.auditoria_lineas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auditoria_id UUID NOT NULL REFERENCES public.auditorias(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES public.productos(id),
  cantidad_esperada NUMERIC NOT NULL DEFAULT 0,
  cantidad_real NUMERIC,
  diferencia NUMERIC NOT NULL DEFAULT 0,
  ajustado BOOLEAN NOT NULL DEFAULT false,
  notas TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.auditoria_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.auditoria_lineas FOR ALL
  USING (EXISTS (SELECT 1 FROM auditorias a WHERE a.id = auditoria_lineas.auditoria_id AND a.empresa_id = get_my_empresa_id()))
  WITH CHECK (EXISTS (SELECT 1 FROM auditorias a WHERE a.id = auditoria_lineas.auditoria_id AND a.empresa_id = get_my_empresa_id()));
