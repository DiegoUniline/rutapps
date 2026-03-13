
-- Enum for application level
CREATE TYPE public.aplica_a_tarifa AS ENUM ('todos', 'categoria', 'producto');

-- Enum for calculation type
CREATE TYPE public.tipo_calculo_tarifa AS ENUM ('margen_costo', 'descuento_precio', 'precio_fijo');

-- Add new columns to tarifa_lineas
ALTER TABLE public.tarifa_lineas 
  ADD COLUMN aplica_a public.aplica_a_tarifa NOT NULL DEFAULT 'producto',
  ADD COLUMN tipo_calculo public.tipo_calculo_tarifa NOT NULL DEFAULT 'precio_fijo',
  ADD COLUMN clasificacion_id uuid REFERENCES public.clasificaciones(id) ON DELETE SET NULL,
  ADD COLUMN margen_pct numeric DEFAULT 0,
  ADD COLUMN descuento_pct numeric DEFAULT 0;

-- Make producto_id nullable (for "todos" and "categoria" rules)
ALTER TABLE public.tarifa_lineas ALTER COLUMN producto_id DROP NOT NULL;
