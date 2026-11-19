-- Actualizar links de notificaciones a detalle de cada movimiento

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
    '/ventas/' || NEW.id,
    'venta',
    NEW.id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_cobro() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cli_nombre TEXT;
  v_venta_id UUID;
  v_link TEXT;
BEGIN
  SELECT nombre INTO cli_nombre FROM public.clientes WHERE id = NEW.cliente_id;
  SELECT venta_id INTO v_venta_id FROM public.cobro_aplicaciones WHERE cobro_id = NEW.id LIMIT 1;
  v_link := COALESCE('/ventas/' || v_venta_id, '/clientes/' || NEW.cliente_id, '/ventas/cobranza');
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id)
  VALUES (
    NEW.empresa_id,
    'cobro',
    'Cobro recibido · $' || to_char(COALESCE(NEW.monto,0), 'FM999,999,990.00'),
    COALESCE(cli_nombre, 'Cliente') || ' · ' || COALESCE(NEW.metodo_pago, ''),
    v_link,
    'cobro',
    NEW.id
  );
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.notify_on_devolucion() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  cli_nombre TEXT;
  v_link TEXT;
BEGIN
  SELECT nombre INTO cli_nombre FROM public.clientes WHERE id = NEW.cliente_id;
  v_link := COALESCE('/ventas/' || NEW.venta_id, '/ventas/devoluciones');
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id)
  VALUES (
    NEW.empresa_id,
    'devolucion',
    'Devolución registrada',
    COALESCE(cli_nombre, 'Cliente'),
    v_link,
    'devolucion',
    NEW.id
  );
  RETURN NEW;
END $$;

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
      '/logistica/entregas/' || NEW.id,
      'entrega',
      NEW.id
    );
  END IF;
  RETURN NEW;
END $$;