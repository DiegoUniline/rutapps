
-- 1. Conteos físicos (cabecera)
CREATE TABLE public.conteos_fisicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folio text NOT NULL,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id),
  asignado_a uuid,
  creado_por uuid,
  clasificacion_id uuid REFERENCES public.clasificaciones(id),
  filtro_stock text NOT NULL DEFAULT 'todos',
  status text NOT NULL DEFAULT 'abierto',
  abierto_en timestamptz NOT NULL DEFAULT now(),
  cerrado_en timestamptz,
  total_productos integer NOT NULL DEFAULT 0,
  productos_contados integer NOT NULL DEFAULT 0,
  diferencia_total_valor numeric DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. Líneas de conteo (un registro por producto)
CREATE TABLE public.conteo_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteo_id uuid NOT NULL REFERENCES public.conteos_fisicos(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  stock_inicial numeric NOT NULL DEFAULT 0,
  stock_esperado numeric,
  cantidad_contada numeric,
  diferencia numeric,
  diferencia_valor numeric,
  costo_unitario numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pendiente',
  linea_abierta_en timestamptz NOT NULL DEFAULT now(),
  linea_cerrada_en timestamptz,
  ajuste_aplicado boolean NOT NULL DEFAULT false,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Entradas de conteo (acumulativas)
CREATE TABLE public.conteo_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conteo_linea_id uuid NOT NULL REFERENCES public.conteo_lineas(id) ON DELETE CASCADE,
  cantidad numeric NOT NULL DEFAULT 1,
  codigo_escaneado text,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.conteos_fisicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteo_lineas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conteo_entradas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conteos_empresa" ON public.conteos_fisicos
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id())
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "conteo_lineas_empresa" ON public.conteo_lineas
  FOR ALL TO authenticated
  USING (conteo_id IN (SELECT id FROM public.conteos_fisicos WHERE empresa_id = public.get_my_empresa_id()))
  WITH CHECK (conteo_id IN (SELECT id FROM public.conteos_fisicos WHERE empresa_id = public.get_my_empresa_id()));

CREATE POLICY "conteo_entradas_empresa" ON public.conteo_entradas
  FOR ALL TO authenticated
  USING (conteo_linea_id IN (
    SELECT cl.id FROM public.conteo_lineas cl
    JOIN public.conteos_fisicos cf ON cf.id = cl.conteo_id
    WHERE cf.empresa_id = public.get_my_empresa_id()
  ))
  WITH CHECK (conteo_linea_id IN (
    SELECT cl.id FROM public.conteo_lineas cl
    JOIN public.conteos_fisicos cf ON cf.id = cl.conteo_id
    WHERE cf.empresa_id = public.get_my_empresa_id()
  ));

-- Indexes
CREATE INDEX idx_conteos_fisicos_empresa ON public.conteos_fisicos(empresa_id);
CREATE INDEX idx_conteo_lineas_conteo ON public.conteo_lineas(conteo_id);
CREATE INDEX idx_conteo_entradas_linea ON public.conteo_entradas(conteo_linea_id);
