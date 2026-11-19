-- Add new motivo values
ALTER TYPE motivo_devolucion ADD VALUE IF NOT EXISTS 'error_pedido';
ALTER TYPE motivo_devolucion ADD VALUE IF NOT EXISTS 'caducado';

-- Create accion_devolucion enum
DO $$ BEGIN
  CREATE TYPE accion_devolucion AS ENUM ('reposicion', 'nota_credito', 'devolucion_dinero', 'descuento_venta');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add accion and reemplazo columns to devolucion_lineas
ALTER TABLE devolucion_lineas
  ADD COLUMN IF NOT EXISTS accion accion_devolucion NOT NULL DEFAULT 'reposicion',
  ADD COLUMN IF NOT EXISTS reemplazo_producto_id uuid REFERENCES productos(id),
  ADD COLUMN IF NOT EXISTS monto_credito numeric NOT NULL DEFAULT 0;