
-- Internal company notifications system (desktop only)

CREATE TABLE public.internal_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  tipo text NOT NULL, -- 'venta' | 'pedido' | 'cobro' | 'devolucion' | 'entrega' | 'stock_bajo'
  title text NOT NULL,
  body text,
  link text,
  entity_type text,
  entity_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_internal_notif_empresa_created ON public.internal_notifications(empresa_id, created_at DESC);
CREATE INDEX idx_internal_notif_entity ON public.internal_notifications(entity_type, entity_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_notifications TO authenticated;
GRANT ALL ON public.internal_notifications TO service_role;

ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_same_empresa" ON public.internal_notifications
  FOR SELECT TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "delete_same_empresa" ON public.internal_notifications
  FOR DELETE TO authenticated
  USING (empresa_id = (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

-- Per-user read tracking
CREATE TABLE public.internal_notification_reads (
  notification_id uuid NOT NULL REFERENCES public.internal_notifications(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (notification_id, user_id)
);

CREATE INDEX idx_internal_notif_reads_user ON public.internal_notification_reads(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.internal_notification_reads TO authenticated;
GRANT ALL ON public.internal_notification_reads TO service_role;

ALTER TABLE public.internal_notification_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "manage_own_reads" ON public.internal_notification_reads
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.internal_notifications;

-- ============ TRIGGER FUNCTIONS ============

-- Helper: get cliente name
CREATE OR REPLACE FUNCTION public._inotif_cliente_nombre(_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT nombre FROM public.clientes WHERE id = _id;
$$;

-- VENTAS / PEDIDOS
CREATE OR REPLACE FUNCTION public.trg_inotif_venta()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tipo text;
  v_title text;
  v_link text;
  v_cliente text;
BEGIN
  v_cliente := COALESCE(public._inotif_cliente_nombre(NEW.cliente_id), 'Sin cliente');
  IF NEW.tipo = 'pedido' THEN
    v_tipo := 'pedido';
    v_title := 'Nuevo pedido ' || COALESCE(NEW.folio,'') || ' · ' || v_cliente;
    v_link := '/ventas';
  ELSE
    v_tipo := 'venta';
    v_title := 'Nueva venta ' || COALESCE(NEW.folio,'') || ' · ' || v_cliente;
    v_link := '/ventas';
  END IF;

  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id, metadata)
  VALUES (
    NEW.empresa_id, v_tipo, v_title,
    'Total: $' || to_char(COALESCE(NEW.total,0),'FM999,999,990.00'),
    v_link, 'venta', NEW.id,
    jsonb_build_object('folio', NEW.folio, 'total', NEW.total, 'cliente_id', NEW.cliente_id, 'vendedor_id', NEW.vendedor_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inotif_venta_ai ON public.ventas;
CREATE TRIGGER trg_inotif_venta_ai
  AFTER INSERT ON public.ventas
  FOR EACH ROW
  WHEN (NEW.es_saldo_inicial IS NOT TRUE)
  EXECUTE FUNCTION public.trg_inotif_venta();

-- COBROS
CREATE OR REPLACE FUNCTION public.trg_inotif_cobro()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cliente text;
BEGIN
  v_cliente := COALESCE(public._inotif_cliente_nombre(NEW.cliente_id), 'Sin cliente');
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id, metadata)
  VALUES (
    NEW.empresa_id, 'cobro',
    'Cobro recibido · ' || v_cliente,
    'Monto: $' || to_char(COALESCE(NEW.monto,0),'FM999,999,990.00'),
    '/ventas/cobranza', 'cobro', NEW.id,
    jsonb_build_object('monto', NEW.monto, 'cliente_id', NEW.cliente_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inotif_cobro_ai ON public.cobros;
CREATE TRIGGER trg_inotif_cobro_ai
  AFTER INSERT ON public.cobros
  FOR EACH ROW EXECUTE FUNCTION public.trg_inotif_cobro();

-- DEVOLUCIONES
CREATE OR REPLACE FUNCTION public.trg_inotif_devolucion()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cliente text;
BEGIN
  v_cliente := COALESCE(public._inotif_cliente_nombre(NEW.cliente_id), 'Sin cliente');
  INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id, metadata)
  VALUES (
    NEW.empresa_id, 'devolucion',
    'Nueva devolución · ' || v_cliente,
    'Tipo: ' || COALESCE(NEW.tipo,'—'),
    '/ventas/devoluciones', 'devolucion', NEW.id,
    jsonb_build_object('tipo', NEW.tipo, 'cliente_id', NEW.cliente_id)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inotif_devolucion_ai ON public.devoluciones;
CREATE TRIGGER trg_inotif_devolucion_ai
  AFTER INSERT ON public.devoluciones
  FOR EACH ROW EXECUTE FUNCTION public.trg_inotif_devolucion();

-- ENTREGAS (cuando pasa a 'hecho')
CREATE OR REPLACE FUNCTION public.trg_inotif_entrega()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_cliente text;
BEGIN
  IF NEW.status = 'hecho' AND (OLD.status IS DISTINCT FROM 'hecho') THEN
    v_cliente := COALESCE(public._inotif_cliente_nombre(NEW.cliente_id), 'Sin cliente');
    INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id, metadata)
    VALUES (
      NEW.empresa_id, 'entrega',
      'Entrega completada ' || COALESCE(NEW.folio,'') || ' · ' || v_cliente,
      NULL,
      '/logistica/pedidos', 'entrega', NEW.id,
      jsonb_build_object('folio', NEW.folio, 'cliente_id', NEW.cliente_id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inotif_entrega_au ON public.entregas;
CREATE TRIGGER trg_inotif_entrega_au
  AFTER UPDATE ON public.entregas
  FOR EACH ROW EXECUTE FUNCTION public.trg_inotif_entrega();

-- STOCK BAJO: cuando cantidad cae al/abajo de productos.min (>0)
CREATE OR REPLACE FUNCTION public.trg_inotif_stock_bajo()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_min numeric;
  v_nombre text;
  v_alm text;
  v_recent_exists boolean;
BEGIN
  SELECT p.min, p.nombre INTO v_min, v_nombre
  FROM public.productos p WHERE p.id = NEW.producto_id;

  IF v_min IS NULL OR v_min <= 0 THEN RETURN NEW; END IF;

  IF NEW.cantidad <= v_min AND (OLD.cantidad IS NULL OR OLD.cantidad > v_min) THEN
    -- evita spam: si ya hubo aviso del mismo producto+almacen en últimas 6h, no repetir
    SELECT EXISTS (
      SELECT 1 FROM public.internal_notifications
      WHERE empresa_id = NEW.empresa_id
        AND tipo = 'stock_bajo'
        AND (metadata->>'producto_id')::uuid = NEW.producto_id
        AND (metadata->>'almacen_id')::uuid = NEW.almacen_id
        AND created_at > now() - interval '6 hours'
    ) INTO v_recent_exists;
    IF v_recent_exists THEN RETURN NEW; END IF;

    SELECT nombre INTO v_alm FROM public.almacenes WHERE id = NEW.almacen_id;

    INSERT INTO public.internal_notifications (empresa_id, tipo, title, body, link, entity_type, entity_id, metadata)
    VALUES (
      NEW.empresa_id, 'stock_bajo',
      'Stock bajo: ' || COALESCE(v_nombre,'Producto'),
      COALESCE(v_alm,'Almacén') || ' · ' || NEW.cantidad::text || ' / mínimo ' || v_min::text,
      '/almacen/inventario', 'producto', NEW.producto_id,
      jsonb_build_object('producto_id', NEW.producto_id, 'almacen_id', NEW.almacen_id, 'cantidad', NEW.cantidad, 'min', v_min)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inotif_stock_bajo_au ON public.stock_almacen;
CREATE TRIGGER trg_inotif_stock_bajo_au
  AFTER INSERT OR UPDATE OF cantidad ON public.stock_almacen
  FOR EACH ROW EXECUTE FUNCTION public.trg_inotif_stock_bajo();

-- Mantenimiento: borrar notificaciones de >30 días automáticamente (vía función llamable)
CREATE OR REPLACE FUNCTION public.purge_internal_notifications()
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.internal_notifications WHERE created_at < now() - interval '30 days';
$$;
