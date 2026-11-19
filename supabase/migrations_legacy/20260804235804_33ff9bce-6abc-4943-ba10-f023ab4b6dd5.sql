CREATE TABLE public.traspaso_linea_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  traspaso_id uuid NOT NULL REFERENCES public.traspasos(id) ON DELETE CASCADE,
  traspaso_linea_id uuid NOT NULL REFERENCES public.traspaso_lineas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE RESTRICT,
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE RESTRICT,
  cantidad numeric NOT NULL CHECK (cantidad > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (traspaso_linea_id, lote_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.traspaso_linea_lotes TO authenticated;
GRANT ALL ON public.traspaso_linea_lotes TO service_role;

CREATE INDEX idx_traspaso_linea_lotes_empresa ON public.traspaso_linea_lotes(empresa_id);
CREATE INDEX idx_traspaso_linea_lotes_traspaso ON public.traspaso_linea_lotes(traspaso_id);
CREATE INDEX idx_traspaso_linea_lotes_linea ON public.traspaso_linea_lotes(traspaso_linea_id);
CREATE INDEX idx_traspaso_linea_lotes_producto ON public.traspaso_linea_lotes(producto_id);
CREATE INDEX idx_traspaso_linea_lotes_lote ON public.traspaso_linea_lotes(lote_id);

ALTER TABLE public.traspaso_linea_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "traspaso_linea_lotes_tenant"
ON public.traspaso_linea_lotes
FOR ALL TO authenticated
USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.validate_traspaso_linea_lote()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa_id uuid;
  v_traspaso_id uuid;
  v_producto_id uuid;
  v_status public.status_traspaso;
BEGIN
  SELECT t.empresa_id, tl.traspaso_id, tl.producto_id, t.status
  INTO v_empresa_id, v_traspaso_id, v_producto_id, v_status
  FROM public.traspaso_lineas tl
  JOIN public.traspasos t ON t.id = tl.traspaso_id
  WHERE tl.id = NEW.traspaso_linea_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'Línea de traspaso no encontrada'; END IF;
  IF v_status <> 'borrador' THEN RAISE EXCEPTION 'Solo se pueden asignar lotes a traspasos en borrador'; END IF;
  IF NEW.empresa_id <> v_empresa_id OR NEW.traspaso_id <> v_traspaso_id OR NEW.producto_id <> v_producto_id THEN
    RAISE EXCEPTION 'La asignación no corresponde a la empresa, traspaso o producto de la línea';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.lotes l
    WHERE l.id = NEW.lote_id AND l.empresa_id = NEW.empresa_id
      AND l.producto_id = NEW.producto_id AND l.activo = true
  ) THEN
    RAISE EXCEPTION 'El lote no corresponde al producto o está inactivo';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_traspaso_linea_lote
BEFORE INSERT OR UPDATE ON public.traspaso_linea_lotes
FOR EACH ROW EXECUTE FUNCTION public.validate_traspaso_linea_lote();

CREATE OR REPLACE FUNCTION public.confirmar_traspaso(p_traspaso_id uuid, p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_traspaso public.traspasos%ROWTYPE;
  v_linea RECORD;
  v_asignacion RECORD;
  v_origen_id uuid;
  v_destino_id uuid;
  v_stock_id uuid;
  v_stock numeric;
  v_dest_stock_id uuid;
  v_total_lotes numeric;
  v_prod_name text;
  v_allow_negative boolean;
  v_maneja_lote boolean;
  v_folio text;
BEGIN
  SELECT * INTO v_traspaso
  FROM public.traspasos
  WHERE id = p_traspaso_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Traspaso no encontrado'; END IF;
  IF v_traspaso.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se puede confirmar un traspaso en borrador'; END IF;
  IF NOT (v_traspaso.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado para confirmar este traspaso';
  END IF;

  v_origen_id := v_traspaso.almacen_origen_id;
  v_destino_id := v_traspaso.almacen_destino_id;

  IF v_traspaso.vendedor_origen_id IS NOT NULL THEN
    SELECT almacen_id INTO v_origen_id FROM public.profiles WHERE id = v_traspaso.vendedor_origen_id;
  END IF;
  IF v_traspaso.vendedor_destino_id IS NOT NULL THEN
    SELECT almacen_id INTO v_destino_id FROM public.profiles WHERE id = v_traspaso.vendedor_destino_id;
  END IF;

  IF v_origen_id IS NULL OR v_destino_id IS NULL THEN RAISE EXCEPTION 'El origen o destino no tiene almacén asignado'; END IF;
  IF v_origen_id = v_destino_id THEN RAISE EXCEPTION 'El origen y destino deben ser diferentes'; END IF;
  v_folio := COALESCE(v_traspaso.folio, '');

  FOR v_linea IN
    SELECT * FROM public.traspaso_lineas WHERE traspaso_id = p_traspaso_id ORDER BY id
  LOOP
    SELECT nombre, COALESCE(vender_sin_stock, false), COALESCE(maneja_lote, false)
    INTO v_prod_name, v_allow_negative, v_maneja_lote
    FROM public.productos
    WHERE id = v_linea.producto_id AND empresa_id = v_traspaso.empresa_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto inválido en el traspaso'; END IF;

    v_stock_id := NULL;
    v_stock := 0;
    SELECT id, cantidad INTO v_stock_id, v_stock
    FROM public.stock_almacen
    WHERE empresa_id = v_traspaso.empresa_id AND almacen_id = v_origen_id AND producto_id = v_linea.producto_id
    FOR UPDATE;

    IF NOT v_allow_negative AND COALESCE(v_stock, 0) < v_linea.cantidad THEN
      RAISE EXCEPTION 'Stock insuficiente en origen para "%". Disponible: %, solicitado: %', v_prod_name, COALESCE(v_stock, 0), v_linea.cantidad;
    END IF;

    IF v_maneja_lote THEN
      SELECT COALESCE(SUM(cantidad), 0) INTO v_total_lotes
      FROM public.traspaso_linea_lotes
      WHERE traspaso_linea_id = v_linea.id;
      IF v_total_lotes <> v_linea.cantidad THEN
        RAISE EXCEPTION 'Asigna lotes por el total de "%". Requerido: %, asignado: %', v_prod_name, v_linea.cantidad, v_total_lotes;
      END IF;

      FOR v_asignacion IN
        SELECT tll.lote_id, tll.cantidad, COALESCE(sl.cantidad, 0) AS disponible
        FROM public.traspaso_linea_lotes tll
        JOIN public.lotes l ON l.id = tll.lote_id
        LEFT JOIN public.stock_lotes sl
          ON sl.empresa_id = tll.empresa_id AND sl.almacen_id = v_origen_id
         AND sl.producto_id = tll.producto_id AND sl.lote_id = tll.lote_id
        WHERE tll.traspaso_linea_id = v_linea.id
          AND tll.empresa_id = v_traspaso.empresa_id
          AND l.producto_id = v_linea.producto_id
        ORDER BY tll.id
        FOR UPDATE OF sl
      LOOP
        IF v_asignacion.disponible < v_asignacion.cantidad THEN
          RAISE EXCEPTION 'Stock insuficiente en el lote de "%". Disponible: %, solicitado: %', v_prod_name, v_asignacion.disponible, v_asignacion.cantidad;
        END IF;
        INSERT INTO public.movimientos_inventario
          (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, almacen_destino_id, lote_id, referencia_tipo, referencia_id, user_id, fecha, notas)
        VALUES
          (v_traspaso.empresa_id, 'traspaso', v_linea.producto_id, v_asignacion.cantidad,
           v_origen_id, v_destino_id, v_asignacion.lote_id, 'traspaso', p_traspaso_id,
           COALESCE(auth.uid(), p_user_id), CURRENT_DATE, 'Traspaso ' || v_folio);
      END LOOP;
    ELSE
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES
        (v_traspaso.empresa_id, 'salida', v_linea.producto_id, v_linea.cantidad,
         v_origen_id, 'traspaso', p_traspaso_id, COALESCE(auth.uid(), p_user_id), CURRENT_DATE, 'Traspaso ' || v_folio);
      INSERT INTO public.movimientos_inventario
        (empresa_id, tipo, producto_id, cantidad, almacen_destino_id, referencia_tipo, referencia_id, user_id, fecha, notas)
      VALUES
        (v_traspaso.empresa_id, 'entrada', v_linea.producto_id, v_linea.cantidad,
         v_destino_id, 'traspaso', p_traspaso_id, COALESCE(auth.uid(), p_user_id), CURRENT_DATE, 'Traspaso ' || v_folio);
    END IF;

    IF v_stock_id IS NULL THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_traspaso.empresa_id, v_origen_id, v_linea.producto_id, -v_linea.cantidad);
    ELSE
      UPDATE public.stock_almacen SET cantidad = COALESCE(cantidad, 0) - v_linea.cantidad, updated_at = now() WHERE id = v_stock_id;
    END IF;

    v_dest_stock_id := NULL;
    SELECT id INTO v_dest_stock_id
    FROM public.stock_almacen
    WHERE empresa_id = v_traspaso.empresa_id AND almacen_id = v_destino_id AND producto_id = v_linea.producto_id
    FOR UPDATE;
    IF v_dest_stock_id IS NULL THEN
      INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_traspaso.empresa_id, v_destino_id, v_linea.producto_id, v_linea.cantidad);
    ELSE
      UPDATE public.stock_almacen SET cantidad = COALESCE(cantidad, 0) + v_linea.cantidad, updated_at = now() WHERE id = v_dest_stock_id;
    END IF;
  END LOOP;

  UPDATE public.traspasos SET status = 'confirmado' WHERE id = p_traspaso_id;
END;
$$;