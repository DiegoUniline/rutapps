-- 1. Flags en empresas
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS apartar_stock_pedidos boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS apartado_almacenes_ids uuid[] NOT NULL DEFAULT '{}';

-- 2. Columna almacen_id en venta_lineas (origen por línea cuando aplica)
ALTER TABLE public.venta_lineas
  ADD COLUMN IF NOT EXISTS almacen_id uuid NULL REFERENCES public.almacenes(id);

CREATE INDEX IF NOT EXISTS idx_venta_lineas_almacen ON public.venta_lineas(almacen_id);

-- 3. Tabla de apartados
CREATE TABLE IF NOT EXISTS public.stock_apartado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  venta_linea_id uuid NOT NULL UNIQUE REFERENCES public.venta_lineas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  almacen_id uuid NOT NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.stock_apartado TO authenticated;
GRANT ALL ON public.stock_apartado TO service_role;

ALTER TABLE public.stock_apartado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stock_apartado tenant access" ON public.stock_apartado
  FOR ALL
  TO authenticated
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()))
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_stock_apartado_lookup ON public.stock_apartado(empresa_id, almacen_id, producto_id);
CREATE INDEX IF NOT EXISTS idx_stock_apartado_venta ON public.stock_apartado(venta_id);

-- 4. Función de disponible por almacén
CREATE OR REPLACE FUNCTION public.fn_disponible_almacen(p_producto_id uuid, p_almacen_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT cantidad FROM public.stock_almacen
                    WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id LIMIT 1), 0)
       - COALESCE((SELECT SUM(cantidad) FROM public.stock_apartado
                    WHERE producto_id = p_producto_id AND almacen_id = p_almacen_id), 0)
$$;

GRANT EXECUTE ON FUNCTION public.fn_disponible_almacen(uuid, uuid) TO authenticated, anon, service_role;

-- 5. Trigger: gestiona stock_apartado al insertar/actualizar/borrar venta_lineas de pedidos
CREATE OR REPLACE FUNCTION public.trg_venta_lineas_apartado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_status text;
  v_empresa_id uuid;
  v_flag boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = OLD.id;
    RETURN OLD;
  END IF;

  SELECT v.tipo, v.status, v.empresa_id INTO v_tipo, v_status, v_empresa_id
    FROM public.ventas v WHERE v.id = NEW.venta_id;

  IF v_tipo IS DISTINCT FROM 'pedido' THEN
    RETURN NEW;
  END IF;

  SELECT apartar_stock_pedidos INTO v_flag FROM public.empresas WHERE id = v_empresa_id;
  IF NOT COALESCE(v_flag, false) THEN
    RETURN NEW;
  END IF;

  IF v_status = 'cancelado' OR NEW.almacen_id IS NULL OR NEW.producto_id IS NULL THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = NEW.id;
    RETURN NEW;
  END IF;

  INSERT INTO public.stock_apartado (empresa_id, venta_id, venta_linea_id, producto_id, almacen_id, cantidad)
  VALUES (v_empresa_id, NEW.venta_id, NEW.id, NEW.producto_id, NEW.almacen_id, COALESCE(NEW.cantidad, 0))
  ON CONFLICT (venta_linea_id) DO UPDATE
    SET producto_id = EXCLUDED.producto_id,
        almacen_id = EXCLUDED.almacen_id,
        cantidad = EXCLUDED.cantidad,
        updated_at = now();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_venta_lineas_apartado_iud ON public.venta_lineas;
CREATE TRIGGER trg_venta_lineas_apartado_iud
AFTER INSERT OR UPDATE OF cantidad, almacen_id, producto_id OR DELETE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.trg_venta_lineas_apartado();

-- 6. Trigger: al cambiar status de la venta (cancelado/entregado/facturado) liberar apartados de pedidos
CREATE OR REPLACE FUNCTION public.trg_ventas_apartado_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tipo = 'pedido' AND NEW.status IN ('cancelado','entregado','facturado')
     AND OLD.status IS DISTINCT FROM NEW.status THEN
    DELETE FROM public.stock_apartado WHERE venta_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ventas_apartado_status ON public.ventas;
CREATE TRIGGER trg_ventas_apartado_status
AFTER UPDATE OF status ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.trg_ventas_apartado_status();

-- 7. Trigger en entrega_lineas: consume apartado al entregar
-- Solo decrementa stock_apartado de la línea correspondiente; la deducción de stock_almacen
-- la sigue manejando el trigger DB existente de entregas (no se toca).
CREATE OR REPLACE FUNCTION public.trg_entrega_lineas_consume_apartado()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linea_id uuid;
  v_apartado numeric;
BEGIN
  -- Buscar la venta_linea correspondiente (por venta_id + producto_id)
  SELECT vl.id INTO v_linea_id
    FROM public.venta_lineas vl
    JOIN public.entregas e ON e.id = NEW.entrega_id
   WHERE vl.venta_id = e.venta_id
     AND vl.producto_id = NEW.producto_id
   LIMIT 1;

  IF v_linea_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT cantidad INTO v_apartado FROM public.stock_apartado WHERE venta_linea_id = v_linea_id;
  IF v_apartado IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_apartado - COALESCE(NEW.cantidad, 0) <= 0 THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = v_linea_id;
  ELSE
    UPDATE public.stock_apartado
       SET cantidad = cantidad - COALESCE(NEW.cantidad, 0), updated_at = now()
     WHERE venta_linea_id = v_linea_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entrega_lineas_consume_apartado ON public.entrega_lineas;
CREATE TRIGGER trg_entrega_lineas_consume_apartado
AFTER INSERT ON public.entrega_lineas
FOR EACH ROW EXECUTE FUNCTION public.trg_entrega_lineas_consume_apartado();