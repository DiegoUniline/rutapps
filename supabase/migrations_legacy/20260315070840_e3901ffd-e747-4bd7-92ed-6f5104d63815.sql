-- Add new status values to status_entrega enum
ALTER TYPE public.status_entrega ADD VALUE IF NOT EXISTS 'surtido' AFTER 'borrador';
ALTER TYPE public.status_entrega ADD VALUE IF NOT EXISTS 'asignado' AFTER 'surtido';
ALTER TYPE public.status_entrega ADD VALUE IF NOT EXISTS 'cargado' AFTER 'asignado';
ALTER TYPE public.status_entrega ADD VALUE IF NOT EXISTS 'en_ruta' AFTER 'cargado';

-- Add new columns to entregas
ALTER TABLE public.entregas
  ADD COLUMN IF NOT EXISTS vendedor_ruta_id uuid REFERENCES public.vendedores(id),
  ADD COLUMN IF NOT EXISTS fecha_asignacion timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_carga timestamptz;

-- Add almacen_origen_id per line
ALTER TABLE public.entrega_lineas
  ADD COLUMN IF NOT EXISTS almacen_origen_id uuid REFERENCES public.almacenes(id);