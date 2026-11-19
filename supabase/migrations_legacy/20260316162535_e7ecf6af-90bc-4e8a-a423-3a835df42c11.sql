
-- Trigger: auto-update venta status to 'entregado' when all entregas are 'hecho'
CREATE OR REPLACE FUNCTION public.auto_venta_entregado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pedido_id uuid;
  v_total_entregas int;
  v_entregas_hecho int;
BEGIN
  v_pedido_id := NEW.pedido_id;
  IF v_pedido_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.status <> 'hecho' THEN RETURN NEW; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'hecho')
  INTO v_total_entregas, v_entregas_hecho
  FROM public.entregas
  WHERE pedido_id = v_pedido_id AND status <> 'cancelado';

  IF v_total_entregas > 0 AND v_total_entregas = v_entregas_hecho THEN
    UPDATE public.ventas SET status = 'entregado'
    WHERE id = v_pedido_id AND status = 'confirmado';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_venta_entregado ON public.entregas;
CREATE TRIGGER trg_auto_venta_entregado
AFTER UPDATE OF status ON public.entregas
FOR EACH ROW
EXECUTE FUNCTION public.auto_venta_entregado();

-- Trigger: auto-update venta status to 'facturado' when all lines are facturado=true
CREATE OR REPLACE FUNCTION public.auto_venta_facturado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venta_id uuid;
  v_total_lineas int;
  v_lineas_facturadas int;
BEGIN
  v_venta_id := NEW.venta_id;
  IF v_venta_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.facturado IS NOT TRUE THEN RETURN NEW; END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE facturado = true)
  INTO v_total_lineas, v_lineas_facturadas
  FROM public.venta_lineas
  WHERE venta_id = v_venta_id;

  IF v_total_lineas > 0 AND v_total_lineas = v_lineas_facturadas THEN
    UPDATE public.ventas SET status = 'facturado'
    WHERE id = v_venta_id AND status IN ('confirmado', 'entregado');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_venta_facturado ON public.venta_lineas;
CREATE TRIGGER trg_auto_venta_facturado
AFTER UPDATE OF facturado ON public.venta_lineas
FOR EACH ROW
EXECUTE FUNCTION public.auto_venta_facturado();
