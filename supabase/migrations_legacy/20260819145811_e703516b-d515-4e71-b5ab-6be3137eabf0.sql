-- ============ 1. Config mínimo/máximo por producto + almacén ============
CREATE TABLE IF NOT EXISTS public.producto_almacen_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  almacen_id uuid NOT NULL REFERENCES public.almacenes(id) ON DELETE CASCADE,
  stock_minimo numeric NOT NULL DEFAULT 0,
  stock_maximo numeric NOT NULL DEFAULT 0,
  activo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT producto_almacen_config_unq UNIQUE (producto_id, almacen_id),
  CONSTRAINT producto_almacen_config_rango CHECK (stock_maximo >= stock_minimo AND stock_minimo >= 0)
);
CREATE INDEX IF NOT EXISTS idx_pac_empresa ON public.producto_almacen_config(empresa_id);
CREATE INDEX IF NOT EXISTS idx_pac_almacen ON public.producto_almacen_config(almacen_id);
CREATE INDEX IF NOT EXISTS idx_pac_producto ON public.producto_almacen_config(producto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producto_almacen_config TO authenticated;
GRANT ALL ON public.producto_almacen_config TO service_role;
ALTER TABLE public.producto_almacen_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.producto_almacen_config FOR ALL
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

-- ============ 2. Enum de estados ============
DO $$ BEGIN
  CREATE TYPE public.status_solicitud_traspaso AS ENUM
    ('borrador','solicitada','aprobada','parcialmente_surtida','surtida','rechazada','cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============ 3. Encabezado ============
CREATE TABLE IF NOT EXISTS public.solicitudes_traspaso (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  folio text,
  fecha date NOT NULL DEFAULT CURRENT_DATE,
  status public.status_solicitud_traspaso NOT NULL DEFAULT 'borrador',
  almacen_origen_id uuid REFERENCES public.almacenes(id),
  almacen_destino_id uuid REFERENCES public.almacenes(id),
  solicitante_user_id uuid,
  solicitante_profile_id uuid REFERENCES public.profiles(id),
  observaciones text,
  enviado_at timestamptz,
  aprobado_por uuid,
  aprobado_at timestamptz,
  rechazado_por uuid,
  rechazado_at timestamptz,
  motivo_rechazo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sol_tras_empresa ON public.solicitudes_traspaso(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sol_tras_destino ON public.solicitudes_traspaso(almacen_destino_id);
CREATE INDEX IF NOT EXISTS idx_sol_tras_origen ON public.solicitudes_traspaso(almacen_origen_id);
CREATE INDEX IF NOT EXISTS idx_sol_tras_status ON public.solicitudes_traspaso(empresa_id, status);
CREATE INDEX IF NOT EXISTS idx_sol_tras_solicitante ON public.solicitudes_traspaso(solicitante_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitudes_traspaso TO authenticated;
GRANT ALL ON public.solicitudes_traspaso TO service_role;
ALTER TABLE public.solicitudes_traspaso ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.solicitudes_traspaso FOR ALL
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

-- ============ 4. Detalle ============
CREATE TABLE IF NOT EXISTS public.solicitud_traspaso_lineas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  solicitud_id uuid NOT NULL REFERENCES public.solicitudes_traspaso(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  presentacion_id uuid REFERENCES public.producto_presentaciones(id),
  stock_actual_snapshot numeric NOT NULL DEFAULT 0,
  stock_minimo_snapshot numeric NOT NULL DEFAULT 0,
  stock_maximo_snapshot numeric NOT NULL DEFAULT 0,
  cantidad_sugerida numeric NOT NULL DEFAULT 0,
  cantidad_solicitada numeric NOT NULL DEFAULT 0,
  cantidad_aprobada numeric NOT NULL DEFAULT 0,
  cantidad_surtida numeric NOT NULL DEFAULT 0,
  notas text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stl_cantidades_no_negativas CHECK (
    cantidad_solicitada >= 0 AND cantidad_aprobada >= 0 AND cantidad_surtida >= 0
  )
);
CREATE INDEX IF NOT EXISTS idx_stl_solicitud ON public.solicitud_traspaso_lineas(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_stl_producto ON public.solicitud_traspaso_lineas(producto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitud_traspaso_lineas TO authenticated;
GRANT ALL ON public.solicitud_traspaso_lineas TO service_role;
ALTER TABLE public.solicitud_traspaso_lineas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation via padre" ON public.solicitud_traspaso_lineas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.solicitudes_traspaso s WHERE s.id = solicitud_id
    AND (s.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.solicitudes_traspaso s WHERE s.id = solicitud_id
    AND (s.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))));

-- ============ 5. Surtidos (liga con traspasos) ============
CREATE TABLE IF NOT EXISTS public.solicitud_traspaso_surtidos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitud_id uuid NOT NULL REFERENCES public.solicitudes_traspaso(id) ON DELETE CASCADE,
  traspaso_id uuid REFERENCES public.traspasos(id),
  surtido_por uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sts_solicitud ON public.solicitud_traspaso_surtidos(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_sts_empresa ON public.solicitud_traspaso_surtidos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_sts_traspaso ON public.solicitud_traspaso_surtidos(traspaso_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.solicitud_traspaso_surtidos TO authenticated;
GRANT ALL ON public.solicitud_traspaso_surtidos TO service_role;
ALTER TABLE public.solicitud_traspaso_surtidos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant isolation" ON public.solicitud_traspaso_surtidos FOR ALL
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

-- ============ 6. Historial ============
CREATE TABLE IF NOT EXISTS public.solicitud_traspaso_historial (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  solicitud_id uuid NOT NULL REFERENCES public.solicitudes_traspaso(id) ON DELETE CASCADE,
  accion text NOT NULL,
  user_id uuid,
  user_nombre text,
  detalle jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sth_solicitud ON public.solicitud_traspaso_historial(solicitud_id);
CREATE INDEX IF NOT EXISTS idx_sth_empresa ON public.solicitud_traspaso_historial(empresa_id);

GRANT SELECT, INSERT ON public.solicitud_traspaso_historial TO authenticated;
GRANT ALL ON public.solicitud_traspaso_historial TO service_role;
ALTER TABLE public.solicitud_traspaso_historial ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tenant read" ON public.solicitud_traspaso_historial FOR SELECT
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));
CREATE POLICY "Tenant insert" ON public.solicitud_traspaso_historial FOR INSERT
  WITH CHECK (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

-- ============ 7. Folio automático SOL-###### ============
CREATE OR REPLACE FUNCTION public.auto_folio_solicitud_traspaso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    PERFORM pg_advisory_xact_lock(hashtext('folio:SOL'), hashtext(NEW.empresa_id::text));
    SELECT 'SOL-' || LPAD((COALESCE(MAX(CASE WHEN folio ~ '^SOL-[0-9]+$'
              THEN CAST(SUBSTRING(folio FROM 5) AS INT) ELSE 0 END),0)+1)::TEXT, 6, '0')
      INTO NEW.folio
      FROM public.solicitudes_traspaso WHERE empresa_id = NEW.empresa_id;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_auto_folio_solicitud_traspaso ON public.solicitudes_traspaso;
CREATE TRIGGER trg_auto_folio_solicitud_traspaso
BEFORE INSERT ON public.solicitudes_traspaso
FOR EACH ROW EXECUTE FUNCTION public.auto_folio_solicitud_traspaso();

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_sol_traspaso ON public.solicitudes_traspaso;
CREATE TRIGGER trg_touch_sol_traspaso BEFORE UPDATE ON public.solicitudes_traspaso
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_sol_traspaso_lineas ON public.solicitud_traspaso_lineas;
CREATE TRIGGER trg_touch_sol_traspaso_lineas BEFORE UPDATE ON public.solicitud_traspaso_lineas
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_touch_pac ON public.producto_almacen_config;
CREATE TRIGGER trg_touch_pac BEFORE UPDATE ON public.producto_almacen_config
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- ============ 8. Sugerencias de resurtido ============
CREATE OR REPLACE FUNCTION public.fn_sugerencias_resurtido(p_almacen_id uuid)
RETURNS TABLE (
  producto_id uuid, codigo text, nombre text,
  stock_actual numeric, stock_minimo numeric, stock_maximo numeric, cantidad_sugerida numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.codigo, p.nombre,
         COALESCE(sa.cantidad, 0) AS stock_actual,
         c.stock_minimo, c.stock_maximo,
         GREATEST(c.stock_maximo - COALESCE(sa.cantidad, 0), 0) AS cantidad_sugerida
  FROM public.producto_almacen_config c
  JOIN public.productos p ON p.id = c.producto_id
  JOIN public.almacenes a ON a.id = c.almacen_id
  LEFT JOIN public.stock_almacen sa
    ON sa.almacen_id = c.almacen_id AND sa.producto_id = c.producto_id
  WHERE c.almacen_id = p_almacen_id
    AND c.activo
    AND p.status = 'activo'
    AND (a.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()))
    AND COALESCE(sa.cantidad, 0) <= c.stock_minimo
    AND GREATEST(c.stock_maximo - COALESCE(sa.cantidad, 0), 0) > 0
  ORDER BY p.nombre;
$$;

-- ============ 9. Helper de historial ============
CREATE OR REPLACE FUNCTION public.fn_log_solicitud_traspaso(
  p_solicitud_id uuid, p_empresa_id uuid, p_accion text, p_detalle jsonb DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text;
BEGIN
  SELECT nombre INTO v_nombre FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  INSERT INTO public.solicitud_traspaso_historial (empresa_id, solicitud_id, accion, user_id, user_nombre, detalle)
  VALUES (p_empresa_id, p_solicitud_id, p_accion, auth.uid(), v_nombre, p_detalle);
END; $$;

-- ============ 10. Enviar ============
CREATE OR REPLACE FUNCTION public.enviar_solicitud_traspaso(p_solicitud_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sol public.solicitudes_traspaso%ROWTYPE; v_lineas int;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status <> 'borrador' THEN RAISE EXCEPTION 'Solo se puede enviar una solicitud en borrador'; END IF;
  SELECT COUNT(*) INTO v_lineas FROM public.solicitud_traspaso_lineas
    WHERE solicitud_id = p_solicitud_id AND cantidad_solicitada > 0;
  IF v_lineas = 0 THEN RAISE EXCEPTION 'Agrega al menos un producto con cantidad mayor a cero'; END IF;
  IF v_sol.almacen_destino_id IS NULL OR v_sol.almacen_origen_id IS NULL THEN
    RAISE EXCEPTION 'Define el almacén origen y destino';
  END IF;

  UPDATE public.solicitudes_traspaso
     SET status = 'solicitada', enviado_at = now()
   WHERE id = p_solicitud_id;
  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'enviada', NULL);
END; $$;

-- ============ 11. Aprobar ============
-- p_lineas: [{"linea_id":"uuid","cantidad_aprobada":10}, ...]
CREATE OR REPLACE FUNCTION public.aprobar_solicitud_traspaso(p_solicitud_id uuid, p_lineas jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb; v_linea public.solicitud_traspaso_lineas%ROWTYPE;
  v_disp numeric; v_nombre text; v_total numeric;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status <> 'solicitada' THEN RAISE EXCEPTION 'Solo se puede aprobar una solicitud enviada'; END IF;

  IF p_lineas IS NOT NULL THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
      UPDATE public.solicitud_traspaso_lineas
         SET cantidad_aprobada = GREATEST((v_item->>'cantidad_aprobada')::numeric, 0)
       WHERE id = (v_item->>'linea_id')::uuid AND solicitud_id = p_solicitud_id;
    END LOOP;
  ELSE
    UPDATE public.solicitud_traspaso_lineas
       SET cantidad_aprobada = cantidad_solicitada
     WHERE solicitud_id = p_solicitud_id;
  END IF;

  -- Validar disponibilidad en el almacén origen
  FOR v_linea IN SELECT * FROM public.solicitud_traspaso_lineas
                  WHERE solicitud_id = p_solicitud_id AND cantidad_aprobada > 0 LOOP
    v_disp := public.fn_disponible_almacen(v_linea.producto_id, v_sol.almacen_origen_id);
    IF v_linea.cantidad_aprobada > v_disp THEN
      SELECT nombre INTO v_nombre FROM public.productos WHERE id = v_linea.producto_id;
      RAISE EXCEPTION 'Existencia disponible insuficiente en origen para "%". Disponible: %, aprobado: %',
        v_nombre, v_disp, v_linea.cantidad_aprobada;
    END IF;
  END LOOP;

  SELECT COALESCE(SUM(cantidad_aprobada),0) INTO v_total
    FROM public.solicitud_traspaso_lineas WHERE solicitud_id = p_solicitud_id;
  IF v_total <= 0 THEN RAISE EXCEPTION 'Debes aprobar al menos una cantidad mayor a cero'; END IF;

  UPDATE public.solicitudes_traspaso
     SET status = 'aprobada', aprobado_por = auth.uid(), aprobado_at = now()
   WHERE id = p_solicitud_id;
  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'aprobada', p_lineas);
END; $$;

-- ============ 12. Rechazar / Cancelar ============
CREATE OR REPLACE FUNCTION public.rechazar_solicitud_traspaso(p_solicitud_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sol public.solicitudes_traspaso%ROWTYPE;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status NOT IN ('solicitada','aprobada') THEN RAISE EXCEPTION 'Esta solicitud no se puede rechazar'; END IF;
  UPDATE public.solicitudes_traspaso
     SET status = 'rechazada', rechazado_por = auth.uid(), rechazado_at = now(), motivo_rechazo = p_motivo
   WHERE id = p_solicitud_id;
  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'rechazada', jsonb_build_object('motivo', p_motivo));
END; $$;

CREATE OR REPLACE FUNCTION public.cancelar_solicitud_traspaso(p_solicitud_id uuid, p_motivo text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_sol public.solicitudes_traspaso%ROWTYPE;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status IN ('surtida','cancelada') THEN RAISE EXCEPTION 'Esta solicitud no se puede cancelar'; END IF;
  UPDATE public.solicitudes_traspaso SET status = 'cancelada' WHERE id = p_solicitud_id;
  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'cancelada', jsonb_build_object('motivo', p_motivo));
END; $$;

-- ============ 13. Surtir (genera traspaso real y mueve inventario) ============
-- p_lineas: [{"linea_id":"uuid","cantidad":10}, ...]
CREATE OR REPLACE FUNCTION public.surtir_solicitud_traspaso(p_solicitud_id uuid, p_lineas jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_sol public.solicitudes_traspaso%ROWTYPE;
  v_item jsonb; v_linea public.solicitud_traspaso_lineas%ROWTYPE;
  v_cant numeric; v_pend numeric; v_nombre text;
  v_traspaso_id uuid; v_traspaso_linea_id uuid;
  v_maneja_lote boolean; v_restante numeric; v_lote RECORD; v_toma numeric;
  v_total_aprobado numeric; v_total_surtido numeric; v_algo boolean := false;
BEGIN
  SELECT * INTO v_sol FROM public.solicitudes_traspaso WHERE id = p_solicitud_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Solicitud no encontrada'; END IF;
  IF NOT (v_sol.empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  IF v_sol.status NOT IN ('aprobada','parcialmente_surtida') THEN
    RAISE EXCEPTION 'Solo se puede surtir una solicitud aprobada';
  END IF;
  IF v_sol.almacen_origen_id IS NULL OR v_sol.almacen_destino_id IS NULL THEN
    RAISE EXCEPTION 'La solicitud no tiene almacén origen o destino';
  END IF;

  v_traspaso_id := gen_random_uuid();
  INSERT INTO public.traspasos (id, empresa_id, tipo, status, almacen_origen_id, almacen_destino_id, fecha, notas, user_id)
  VALUES (v_traspaso_id, v_sol.empresa_id, 'almacen_almacen'::public.tipo_traspaso, 'borrador'::public.status_traspaso,
          v_sol.almacen_origen_id, v_sol.almacen_destino_id, CURRENT_DATE,
          'Surtido de solicitud ' || COALESCE(v_sol.folio,''), COALESCE(auth.uid(), v_sol.solicitante_user_id));

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_lineas) LOOP
    SELECT * INTO v_linea FROM public.solicitud_traspaso_lineas
      WHERE id = (v_item->>'linea_id')::uuid AND solicitud_id = p_solicitud_id FOR UPDATE;
    CONTINUE WHEN NOT FOUND;

    v_cant := GREATEST(COALESCE((v_item->>'cantidad')::numeric, 0), 0);
    CONTINUE WHEN v_cant <= 0;

    v_pend := v_linea.cantidad_aprobada - v_linea.cantidad_surtida;
    IF v_cant > v_pend THEN
      SELECT nombre INTO v_nombre FROM public.productos WHERE id = v_linea.producto_id;
      RAISE EXCEPTION 'La cantidad a surtir de "%" excede lo pendiente. Pendiente: %, solicitado: %', v_nombre, v_pend, v_cant;
    END IF;

    v_traspaso_linea_id := gen_random_uuid();
    INSERT INTO public.traspaso_lineas (id, traspaso_id, producto_id, cantidad)
    VALUES (v_traspaso_linea_id, v_traspaso_id, v_linea.producto_id, v_cant);

    SELECT COALESCE(maneja_lote,false) INTO v_maneja_lote FROM public.productos WHERE id = v_linea.producto_id;
    IF v_maneja_lote THEN
      v_restante := v_cant;
      FOR v_lote IN
        SELECT sl.lote_id, sl.cantidad, l.fecha_caducidad
        FROM public.stock_lotes sl
        JOIN public.lotes l ON l.id = sl.lote_id
        WHERE sl.empresa_id = v_sol.empresa_id AND sl.almacen_id = v_sol.almacen_origen_id
          AND sl.producto_id = v_linea.producto_id AND sl.cantidad > 0
        ORDER BY l.fecha_caducidad NULLS LAST, l.created_at
      LOOP
        EXIT WHEN v_restante <= 0;
        v_toma := LEAST(v_restante, v_lote.cantidad);
        INSERT INTO public.traspaso_linea_lotes (empresa_id, traspaso_id, traspaso_linea_id, producto_id, lote_id, cantidad)
        VALUES (v_sol.empresa_id, v_traspaso_id, v_traspaso_linea_id, v_linea.producto_id, v_lote.lote_id, v_toma);
        v_restante := v_restante - v_toma;
      END LOOP;
      IF v_restante > 0 THEN
        SELECT nombre INTO v_nombre FROM public.productos WHERE id = v_linea.producto_id;
        RAISE EXCEPTION 'No hay lotes suficientes en el almacén origen para "%". Faltan: %', v_nombre, v_restante;
      END IF;
    END IF;

    UPDATE public.solicitud_traspaso_lineas
       SET cantidad_surtida = cantidad_surtida + v_cant
     WHERE id = v_linea.id;
    v_algo := true;
  END LOOP;

  IF NOT v_algo THEN RAISE EXCEPTION 'No hay cantidades por surtir'; END IF;

  PERFORM public.confirmar_traspaso(v_traspaso_id, COALESCE(auth.uid(), v_sol.solicitante_user_id));

  INSERT INTO public.solicitud_traspaso_surtidos (empresa_id, solicitud_id, traspaso_id, surtido_por)
  VALUES (v_sol.empresa_id, p_solicitud_id, v_traspaso_id, auth.uid());

  SELECT COALESCE(SUM(cantidad_aprobada),0), COALESCE(SUM(cantidad_surtida),0)
    INTO v_total_aprobado, v_total_surtido
    FROM public.solicitud_traspaso_lineas WHERE solicitud_id = p_solicitud_id;

  UPDATE public.solicitudes_traspaso
     SET status = CASE WHEN v_total_surtido >= v_total_aprobado THEN 'surtida'::public.status_solicitud_traspaso
                       ELSE 'parcialmente_surtida'::public.status_solicitud_traspaso END
   WHERE id = p_solicitud_id;

  PERFORM public.fn_log_solicitud_traspaso(p_solicitud_id, v_sol.empresa_id, 'surtida',
    jsonb_build_object('traspaso_id', v_traspaso_id, 'lineas', p_lineas));

  RETURN v_traspaso_id;
END; $$;