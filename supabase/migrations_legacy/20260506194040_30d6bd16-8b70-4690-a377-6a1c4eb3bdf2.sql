
ALTER TABLE public.almacenes ADD COLUMN IF NOT EXISTS es_merma boolean NOT NULL DEFAULT false;

CREATE TABLE public.merma_motivos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  nombre text NOT NULL,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, nombre)
);
CREATE INDEX idx_merma_motivos_empresa ON public.merma_motivos(empresa_id);
ALTER TABLE public.merma_motivos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation merma_motivos" ON public.merma_motivos
FOR ALL TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE TABLE public.mermas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  folio text NOT NULL,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  almacen_origen_id uuid NOT NULL REFERENCES public.almacenes(id),
  ruta_id uuid,
  motivo_id uuid REFERENCES public.merma_motivos(id),
  observaciones text,
  total_costo numeric NOT NULL DEFAULT 0,
  total_venta numeric NOT NULL DEFAULT 0,
  cancelada boolean NOT NULL DEFAULT false,
  cancelada_at timestamptz,
  cancelada_por uuid,
  devolucion_id uuid,
  creado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(empresa_id, folio)
);
CREATE INDEX idx_mermas_empresa_fecha ON public.mermas(empresa_id, fecha DESC);
CREATE INDEX idx_mermas_almacen ON public.mermas(almacen_origen_id);
ALTER TABLE public.mermas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation mermas" ON public.mermas
FOR ALL TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE TABLE public.merma_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merma_id uuid NOT NULL REFERENCES public.mermas(id) ON DELETE CASCADE,
  empresa_id uuid NOT NULL,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  costo_unitario numeric NOT NULL DEFAULT 0,
  precio_venta_unitario numeric NOT NULL DEFAULT 0,
  subtotal_costo numeric NOT NULL DEFAULT 0,
  subtotal_venta numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_merma_lineas_merma ON public.merma_lineas(merma_id);
CREATE INDEX idx_merma_lineas_producto ON public.merma_lineas(producto_id);
ALTER TABLE public.merma_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation merma_lineas" ON public.merma_lineas
FOR ALL TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.ensure_almacen_mermas(_empresa_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _id uuid;
BEGIN
  SELECT id INTO _id FROM public.almacenes WHERE empresa_id = _empresa_id AND es_merma = true LIMIT 1;
  IF _id IS NULL THEN
    INSERT INTO public.almacenes(empresa_id, nombre, tipo, es_merma, activo)
    VALUES (_empresa_id, 'Mermas', 'almacen', true, true) RETURNING id INTO _id;
  END IF;
  RETURN _id;
END; $$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.empresas LOOP
    PERFORM public.ensure_almacen_mermas(r.id);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.trg_create_almacen_mermas()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM public.ensure_almacen_mermas(NEW.id); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS create_almacen_mermas_after_empresa ON public.empresas;
CREATE TRIGGER create_almacen_mermas_after_empresa
AFTER INSERT ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.trg_create_almacen_mermas();

INSERT INTO public.merma_motivos (empresa_id, nombre)
SELECT e.id, m.nombre FROM public.empresas e
CROSS JOIN (VALUES ('Caducado'),('Dañado'),('Robo'),('Derrame'),('Quemado'),('Error de manejo'),('Otro')) AS m(nombre)
ON CONFLICT (empresa_id, nombre) DO NOTHING;

CREATE OR REPLACE FUNCTION public.trg_seed_merma_motivos()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.merma_motivos(empresa_id, nombre) VALUES
    (NEW.id,'Caducado'),(NEW.id,'Dañado'),(NEW.id,'Robo'),(NEW.id,'Derrame'),
    (NEW.id,'Quemado'),(NEW.id,'Error de manejo'),(NEW.id,'Otro')
  ON CONFLICT (empresa_id, nombre) DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS seed_merma_motivos_after_empresa ON public.empresas;
CREATE TRIGGER seed_merma_motivos_after_empresa
AFTER INSERT ON public.empresas FOR EACH ROW EXECUTE FUNCTION public.trg_seed_merma_motivos();

CREATE OR REPLACE FUNCTION public.registrar_merma(
  _almacen_origen_id uuid, _ruta_id uuid, _motivo_id uuid,
  _observaciones text, _lineas jsonb, _devolucion_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _empresa_id uuid := public.get_my_empresa_id();
  _user_id uuid := auth.uid();
  _almacen_mermas uuid; _merma_id uuid; _folio text; _next int;
  _total_costo numeric := 0; _total_venta numeric := 0;
  _line jsonb; _producto_id uuid; _cantidad numeric; _costo numeric; _precio numeric;
BEGIN
  IF _empresa_id IS NULL THEN RAISE EXCEPTION 'No hay empresa activa'; END IF;
  _almacen_mermas := public.ensure_almacen_mermas(_empresa_id);
  SELECT COALESCE(MAX(NULLIF(regexp_replace(folio,'[^0-9]','','g'),'')::int),0)+1
    INTO _next FROM public.mermas WHERE empresa_id = _empresa_id;
  _folio := 'MER-' || lpad(_next::text, 4, '0');

  INSERT INTO public.mermas(empresa_id, folio, almacen_origen_id, ruta_id, motivo_id, observaciones, devolucion_id, creado_por)
  VALUES (_empresa_id, _folio, _almacen_origen_id, _ruta_id, _motivo_id, _observaciones, _devolucion_id, _user_id)
  RETURNING id INTO _merma_id;

  FOR _line IN SELECT * FROM jsonb_array_elements(_lineas) LOOP
    _producto_id := (_line->>'producto_id')::uuid;
    _cantidad := (_line->>'cantidad')::numeric;
    _costo := COALESCE((_line->>'costo_unitario')::numeric, 0);
    _precio := COALESCE((_line->>'precio_venta_unitario')::numeric, 0);

    INSERT INTO public.merma_lineas(merma_id, empresa_id, producto_id, cantidad, costo_unitario, precio_venta_unitario, subtotal_costo, subtotal_venta)
    VALUES (_merma_id, _empresa_id, _producto_id, _cantidad, _costo, _precio, _costo*_cantidad, _precio*_cantidad);

    _total_costo := _total_costo + _costo*_cantidad;
    _total_venta := _total_venta + _precio*_cantidad;

    UPDATE public.stock_almacen SET cantidad = cantidad - _cantidad, updated_at = now()
     WHERE empresa_id = _empresa_id AND almacen_id = _almacen_origen_id AND producto_id = _producto_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
      VALUES (_empresa_id, _almacen_origen_id, _producto_id, -_cantidad);
    END IF;

    INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
    VALUES (_empresa_id, _almacen_mermas, _producto_id, _cantidad)
    ON CONFLICT (empresa_id, almacen_id, producto_id) DO UPDATE
       SET cantidad = public.stock_almacen.cantidad + EXCLUDED.cantidad, updated_at = now();

    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_empresa_id, 'transferencia', _producto_id, _cantidad, _almacen_origen_id, _almacen_mermas, 'merma', _merma_id, _folio, _user_id, CURRENT_DATE);
  END LOOP;

  UPDATE public.mermas SET total_costo = _total_costo, total_venta = _total_venta WHERE id = _merma_id;
  RETURN _merma_id;
END; $$;

CREATE OR REPLACE FUNCTION public.cancelar_merma(_merma_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _empresa_id uuid := public.get_my_empresa_id();
  _user_id uuid := auth.uid();
  _m record; _almacen_mermas uuid; _l record;
BEGIN
  SELECT * INTO _m FROM public.mermas WHERE id = _merma_id AND (empresa_id = _empresa_id OR public.is_super_admin(_user_id));
  IF NOT FOUND THEN RAISE EXCEPTION 'Merma no encontrada'; END IF;
  IF _m.cancelada THEN RAISE EXCEPTION 'Merma ya cancelada'; END IF;
  _almacen_mermas := public.ensure_almacen_mermas(_m.empresa_id);
  FOR _l IN SELECT * FROM public.merma_lineas WHERE merma_id = _merma_id LOOP
    UPDATE public.stock_almacen SET cantidad = cantidad + _l.cantidad, updated_at = now()
     WHERE empresa_id = _m.empresa_id AND almacen_id = _m.almacen_origen_id AND producto_id = _l.producto_id;
    IF NOT FOUND THEN
      INSERT INTO public.stock_almacen(empresa_id, almacen_id, producto_id, cantidad)
      VALUES (_m.empresa_id, _m.almacen_origen_id, _l.producto_id, _l.cantidad);
    END IF;
    UPDATE public.stock_almacen SET cantidad = cantidad - _l.cantidad, updated_at = now()
     WHERE empresa_id = _m.empresa_id AND almacen_id = _almacen_mermas AND producto_id = _l.producto_id;
    INSERT INTO public.movimientos_inventario(empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, referencia_tipo, referencia_id, notas, user_id, fecha)
    VALUES (_m.empresa_id, 'transferencia', _l.producto_id, _l.cantidad, _almacen_mermas, _m.almacen_origen_id, 'merma_cancelacion', _m.id, _m.folio || ' (CANCELADA)', _user_id, CURRENT_DATE);
  END LOOP;
  UPDATE public.mermas SET cancelada = true, cancelada_at = now(), cancelada_por = _user_id WHERE id = _merma_id;
END; $$;
