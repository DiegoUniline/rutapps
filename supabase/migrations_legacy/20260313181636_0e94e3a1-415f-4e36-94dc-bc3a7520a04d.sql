
-- Create zonas catalog table
CREATE TABLE public.zonas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.zonas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.zonas FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- Create vendedores catalog table
CREATE TABLE public.vendedores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.vendedores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.vendedores FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- Create cobradores catalog table
CREATE TABLE public.cobradores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id uuid NOT NULL REFERENCES public.empresas(id),
  nombre text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cobradores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.cobradores FOR ALL USING (empresa_id = get_my_empresa_id()) WITH CHECK (empresa_id = get_my_empresa_id());

-- Create enums for frecuencia and status_cliente
CREATE TYPE public.frecuencia_visita AS ENUM ('diaria', 'semanal', 'quincenal', 'mensual');
CREATE TYPE public.status_cliente AS ENUM ('activo', 'inactivo', 'suspendido');

-- Add new columns to clientes
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS codigo text,
  ADD COLUMN IF NOT EXISTS gps_lat numeric,
  ADD COLUMN IF NOT EXISTS gps_lng numeric,
  ADD COLUMN IF NOT EXISTS colonia text,
  ADD COLUMN IF NOT EXISTS zona_id uuid REFERENCES public.zonas(id),
  ADD COLUMN IF NOT EXISTS frecuencia frecuencia_visita DEFAULT 'semanal',
  ADD COLUMN IF NOT EXISTS dia_visita text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lista_id uuid REFERENCES public.listas(id),
  ADD COLUMN IF NOT EXISTS vendedor_id uuid REFERENCES public.vendedores(id),
  ADD COLUMN IF NOT EXISTS cobrador_id uuid REFERENCES public.cobradores(id),
  ADD COLUMN IF NOT EXISTS credito boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS limite_credito numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dias_credito integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS foto_url text,
  ADD COLUMN IF NOT EXISTS foto_fachada_url text,
  ADD COLUMN IF NOT EXISTS fecha_alta date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS orden integer DEFAULT 0;

-- Drop old status column and re-add as enum (it was text before)
ALTER TABLE public.clientes DROP COLUMN IF EXISTS status;
ALTER TABLE public.clientes ADD COLUMN status status_cliente DEFAULT 'activo';
