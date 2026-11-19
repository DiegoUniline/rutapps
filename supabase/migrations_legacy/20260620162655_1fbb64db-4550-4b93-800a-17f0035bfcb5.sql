
-- Triggers to populate internal_notifications on key events

CREATE OR REPLACE FUNCTION public.notify_on_venta() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cli_nombre TEXT;
BEGIN
  SELECT nombre INTO cli_nombre FROM public.clientes WHERE id = NEW.cliente_id;
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id)
  VALUES (
    NEW.empresa_id,
    'venta',
    'Nueva venta ' || COALESCE(NEW.folio, ''),
    COALESCE(cli_nombre, 'Cliente') || ' · $' || to_char(COALESCE(NEW.total,0), 'FM999,999,990.00'),
    '/ventas',
    'venta',
    NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_venta ON public.ventas;
CREATE TRIGGER trg_notify_venta AFTER INSERT ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.notify_on_venta();

CREATE OR REPLACE FUNCTION public.notify_on_cobro() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cli_nombre TEXT;
BEGIN
  SELECT nombre INTO cli_nombre FROM public.clientes WHERE id = NEW.cliente_id;
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id)
  VALUES (
    NEW.empresa_id,
    'cobro',
    'Cobro recibido · $' || to_char(COALESCE(NEW.monto,0), 'FM999,999,990.00'),
    COALESCE(cli_nombre, 'Cliente') || ' · ' || COALESCE(NEW.metodo_pago, ''),
    '/ventas/cobranza',
    'cobro',
    NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_cobro ON public.cobros;
CREATE TRIGGER trg_notify_cobro AFTER INSERT ON public.cobros
FOR EACH ROW EXECUTE FUNCTION public.notify_on_cobro();

CREATE OR REPLACE FUNCTION public.notify_on_devolucion() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cli_nombre TEXT;
BEGIN
  SELECT nombre INTO cli_nombre FROM public.clientes WHERE id = NEW.cliente_id;
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id)
  VALUES (
    NEW.empresa_id,
    'devolucion',
    'Devolución registrada',
    COALESCE(cli_nombre, 'Cliente'),
    '/inventario/devoluciones',
    'devolucion',
    NEW.id
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_devolucion ON public.devoluciones;
CREATE TRIGGER trg_notify_devolucion AFTER INSERT ON public.devoluciones
FOR EACH ROW EXECUTE FUNCTION public.notify_on_devolucion();

CREATE OR REPLACE FUNCTION public.notify_on_entrega() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cli_nombre TEXT;
BEGIN
  IF NEW.status = 'hecho' AND (OLD.status IS DISTINCT FROM 'hecho') THEN
    SELECT nombre INTO cli_nombre FROM public.clientes WHERE id = NEW.cliente_id;
    INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id)
    VALUES (
      NEW.empresa_id,
      'entrega',
      'Entrega completada ' || COALESCE(NEW.folio,''),
      COALESCE(cli_nombre, 'Cliente'),
      '/logistica',
      'entrega',
      NEW.id
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_entrega ON public.entregas;
CREATE TRIGGER trg_notify_entrega AFTER UPDATE ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.notify_on_entrega();
