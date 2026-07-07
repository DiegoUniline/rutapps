
ALTER TABLE public.venta_historial ALTER COLUMN user_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public._current_user_nombre()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT nombre FROM public.profiles WHERE id = auth.uid() LIMIT 1), 'Sistema');
$$;

CREATE OR REPLACE FUNCTION public.log_venta_historial(
  _venta_id uuid, _empresa_id uuid, _accion text, _detalles jsonb DEFAULT '{}'::jsonb
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF _venta_id IS NULL OR _empresa_id IS NULL OR _accion IS NULL THEN RETURN; END IF;
  INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles)
  VALUES (_venta_id, _empresa_id, auth.uid(), public._current_user_nombre(), _accion, COALESCE(_detalles, '{}'::jsonb));
END;
$$;

-- VENTAS
CREATE OR REPLACE FUNCTION public.tg_ventas_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _acc text; _det jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_venta_historial(NEW.id, NEW.empresa_id, 'creada',
      jsonb_build_object('folio', COALESCE(NEW.folio, ''), 'tipo', NEW.tipo::text, 'total', NEW.total));
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _acc := CASE NEW.status::text
      WHEN 'confirmado' THEN 'confirmada'
      WHEN 'entregado'  THEN 'entregada'
      WHEN 'cancelado'  THEN 'cancelada'
      WHEN 'borrador'   THEN 'vuelta_borrador'
      WHEN 'facturado'  THEN 'facturada'
      ELSE 'editada'
    END;
    PERFORM public.log_venta_historial(NEW.id, NEW.empresa_id, _acc,
      jsonb_build_object('status', jsonb_build_object('anterior', OLD.status::text, 'nuevo', NEW.status::text)));
  ELSIF NEW.total IS DISTINCT FROM OLD.total OR NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
    _det := '{}'::jsonb;
    IF NEW.total IS DISTINCT FROM OLD.total THEN
      _det := _det || jsonb_build_object('total', jsonb_build_object('anterior', OLD.total, 'nuevo', NEW.total));
    END IF;
    IF NEW.subtotal IS DISTINCT FROM OLD.subtotal THEN
      _det := _det || jsonb_build_object('subtotal', jsonb_build_object('anterior', OLD.subtotal, 'nuevo', NEW.subtotal));
    END IF;
    PERFORM public.log_venta_historial(NEW.id, NEW.empresa_id, 'editada', _det);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ventas_historial ON public.ventas;
CREATE TRIGGER trg_ventas_historial AFTER INSERT OR UPDATE ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.tg_ventas_historial();

-- VENTA_LINEAS
CREATE OR REPLACE FUNCTION public.tg_venta_lineas_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp uuid; _prod text; _det jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT empresa_id INTO _emp FROM public.ventas WHERE id = NEW.venta_id;
    SELECT COALESCE(nombre, codigo, '') INTO _prod FROM public.productos WHERE id = NEW.producto_id;
    PERFORM public.log_venta_historial(NEW.venta_id, _emp, 'linea_agregada',
      jsonb_build_object('producto', COALESCE(_prod,''), 'cantidad', NEW.cantidad, 'precio', NEW.precio_unitario));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.cantidad IS DISTINCT FROM OLD.cantidad OR NEW.precio_unitario IS DISTINCT FROM OLD.precio_unitario THEN
      SELECT empresa_id INTO _emp FROM public.ventas WHERE id = NEW.venta_id;
      SELECT COALESCE(nombre, codigo, '') INTO _prod FROM public.productos WHERE id = NEW.producto_id;
      _det := jsonb_build_object('producto', COALESCE(_prod,''));
      IF NEW.cantidad IS DISTINCT FROM OLD.cantidad THEN
        _det := _det || jsonb_build_object('cantidad', jsonb_build_object('anterior', OLD.cantidad, 'nuevo', NEW.cantidad));
      END IF;
      IF NEW.precio_unitario IS DISTINCT FROM OLD.precio_unitario THEN
        _det := _det || jsonb_build_object('precio', jsonb_build_object('anterior', OLD.precio_unitario, 'nuevo', NEW.precio_unitario));
      END IF;
      PERFORM public.log_venta_historial(NEW.venta_id, _emp, 'linea_editada', _det);
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT empresa_id INTO _emp FROM public.ventas WHERE id = OLD.venta_id;
    IF _emp IS NOT NULL THEN
      SELECT COALESCE(nombre, codigo, '') INTO _prod FROM public.productos WHERE id = OLD.producto_id;
      PERFORM public.log_venta_historial(OLD.venta_id, _emp, 'linea_eliminada',
        jsonb_build_object('producto', COALESCE(_prod,''), 'cantidad', OLD.cantidad));
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_venta_lineas_historial ON public.venta_lineas;
CREATE TRIGGER trg_venta_lineas_historial AFTER INSERT OR UPDATE OR DELETE ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.tg_venta_lineas_historial();

-- ENTREGAS
CREATE OR REPLACE FUNCTION public._map_entrega_status(_s text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _s
    WHEN 'surtido'      THEN 'entrega_surtida'
    WHEN 'asignado'     THEN 'entrega_asignada'
    WHEN 'cargado'      THEN 'entrega_cargada'
    WHEN 'en_ruta'      THEN 'entrega_en_ruta'
    WHEN 'listo'        THEN 'entrega_lista'
    WHEN 'hecho'        THEN 'entrega_hecha'
    WHEN 'cancelado'    THEN 'entrega_cancelada'
    WHEN 'no_entregado' THEN 'entrega_no_entregada'
    ELSE 'entrega_editada'
  END;
$$;

CREATE OR REPLACE FUNCTION public.tg_entregas_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vid uuid;
BEGIN
  _vid := COALESCE(NEW.pedido_id, OLD.pedido_id);
  IF _vid IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_venta_historial(_vid, NEW.empresa_id, 'entrega_creada',
      jsonb_build_object('folio', COALESCE(NEW.folio,''), 'status', NEW.status::text));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    PERFORM public.log_venta_historial(_vid, NEW.empresa_id,
      public._map_entrega_status(NEW.status::text),
      jsonb_build_object('folio', COALESCE(NEW.folio,''),
        'status', jsonb_build_object('anterior', OLD.status::text, 'nuevo', NEW.status::text)));
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_entregas_historial ON public.entregas;
CREATE TRIGGER trg_entregas_historial AFTER INSERT OR UPDATE ON public.entregas
FOR EACH ROW EXECUTE FUNCTION public.tg_entregas_historial();

-- ENTREGA_LINEAS: qty change
CREATE OR REPLACE FUNCTION public.tg_entrega_lineas_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _vid uuid; _emp uuid; _folio text; _prod text;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.cantidad_entregada IS DISTINCT FROM OLD.cantidad_entregada
                       OR NEW.cantidad_pedida IS DISTINCT FROM OLD.cantidad_pedida) THEN
    SELECT e.pedido_id, e.empresa_id, e.folio INTO _vid, _emp, _folio
      FROM public.entregas e WHERE e.id = NEW.entrega_id;
    IF _vid IS NULL OR _emp IS NULL THEN RETURN NEW; END IF;
    SELECT COALESCE(nombre, codigo, '') INTO _prod FROM public.productos WHERE id = NEW.producto_id;
    PERFORM public.log_venta_historial(_vid, _emp, 'entrega_editada',
      jsonb_build_object('folio', COALESCE(_folio,''), 'producto', COALESCE(_prod,''),
        'cantidad_entregada', jsonb_build_object('anterior', OLD.cantidad_entregada, 'nuevo', NEW.cantidad_entregada)));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_entrega_lineas_historial ON public.entrega_lineas;
CREATE TRIGGER trg_entrega_lineas_historial AFTER UPDATE ON public.entrega_lineas
FOR EACH ROW EXECUTE FUNCTION public.tg_entrega_lineas_historial();

-- COBRO_APLICACIONES
CREATE OR REPLACE FUNCTION public.tg_cobro_aplicaciones_historial()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp uuid; _metodo text; _ref text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT c.empresa_id, c.metodo_pago, c.referencia INTO _emp, _metodo, _ref
      FROM public.cobros c WHERE c.id = NEW.cobro_id;
    PERFORM public.log_venta_historial(NEW.venta_id, _emp, 'pago_agregado',
      jsonb_build_object('monto', NEW.monto_aplicado, 'metodo', COALESCE(_metodo,''), 'referencia', COALESCE(_ref,'')));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT c.empresa_id, c.metodo_pago INTO _emp, _metodo FROM public.cobros c WHERE c.id = OLD.cobro_id;
    IF _emp IS NULL THEN SELECT empresa_id INTO _emp FROM public.ventas WHERE id = OLD.venta_id; END IF;
    IF _emp IS NOT NULL THEN
      PERFORM public.log_venta_historial(OLD.venta_id, _emp, 'pago_eliminado',
        jsonb_build_object('monto', OLD.monto_aplicado, 'metodo', COALESCE(_metodo,'')));
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_cobro_aplicaciones_historial ON public.cobro_aplicaciones;
CREATE TRIGGER trg_cobro_aplicaciones_historial AFTER INSERT OR DELETE ON public.cobro_aplicaciones
FOR EACH ROW EXECUTE FUNCTION public.tg_cobro_aplicaciones_historial();

-- ================ BACKFILL ================
INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles, created_at)
SELECT v.id, v.empresa_id, NULL, 'Sistema', 'creada',
       jsonb_build_object('folio', COALESCE(v.folio,''), 'tipo', v.tipo::text, 'total', v.total), v.created_at
FROM public.ventas v
WHERE NOT EXISTS (SELECT 1 FROM public.venta_historial h WHERE h.venta_id = v.id);

INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles, created_at)
SELECT e.pedido_id, e.empresa_id, NULL, 'Sistema', 'entrega_creada',
       jsonb_build_object('folio', COALESCE(e.folio,''), 'status', e.status::text), e.created_at
FROM public.entregas e
WHERE e.pedido_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.venta_historial h
    WHERE h.venta_id = e.pedido_id AND h.accion = 'entrega_creada'
      AND h.detalles->>'folio' = COALESCE(e.folio,'')
  );

INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles, created_at)
SELECT e.pedido_id, e.empresa_id, NULL, 'Sistema',
       public._map_entrega_status(e.status::text),
       jsonb_build_object('folio', COALESCE(e.folio,''), 'status', jsonb_build_object('nuevo', e.status::text)),
       COALESCE(e.fecha_entrega, e.fecha_carga, e.fecha_asignacion, e.created_at)
FROM public.entregas e
WHERE e.pedido_id IS NOT NULL AND e.status::text <> 'borrador'
  AND NOT EXISTS (
    SELECT 1 FROM public.venta_historial h
    WHERE h.venta_id = e.pedido_id
      AND h.accion = public._map_entrega_status(e.status::text)
      AND h.detalles->>'folio' = COALESCE(e.folio,'')
  );

INSERT INTO public.venta_historial (venta_id, empresa_id, user_id, user_nombre, accion, detalles, created_at)
SELECT ca.venta_id, c.empresa_id, NULL, 'Sistema', 'pago_agregado',
       jsonb_build_object('monto', ca.monto_aplicado, 'metodo', COALESCE(c.metodo_pago,'')), ca.created_at
FROM public.cobro_aplicaciones ca
JOIN public.cobros c ON c.id = ca.cobro_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.venta_historial h
  WHERE h.venta_id = ca.venta_id AND h.accion = 'pago_agregado' AND h.created_at = ca.created_at
);
