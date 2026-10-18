-- Checkout confiable de tienda en línea:
-- - una llave idempotente impide pedidos duplicados en reintentos;
-- - encabezado y líneas se guardan en una sola transacción;
-- - cada intento queda auditable sin guardar tokens ni datos de tarjeta.

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS tienda_checkout_request_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS ventas_tienda_checkout_request_uidx
  ON public.ventas (empresa_id, tienda_checkout_request_id)
  WHERE tienda_checkout_request_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.tienda_checkout_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  empresa_id uuid REFERENCES public.empresas(id) ON DELETE CASCADE,
  cliente_id uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  tienda_cliente_id uuid REFERENCES public.tienda_clientes(id) ON DELETE SET NULL,
  slug text NOT NULL,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'succeeded', 'failed')),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  venta_id uuid REFERENCES public.ventas(id) ON DELETE SET NULL,
  folio text,
  error_code text,
  error_message text,
  http_status integer,
  first_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_attempt_at timestamptz NOT NULL DEFAULT now(),
  succeeded_at timestamptz,
  UNIQUE (slug, request_id)
);

CREATE INDEX IF NOT EXISTS tienda_checkout_attempts_empresa_fecha_idx
  ON public.tienda_checkout_attempts (empresa_id, last_attempt_at DESC);
CREATE INDEX IF NOT EXISTS tienda_checkout_attempts_fallidos_idx
  ON public.tienda_checkout_attempts (last_attempt_at DESC)
  WHERE status = 'failed';

GRANT SELECT ON public.tienda_checkout_attempts TO authenticated;
GRANT ALL ON public.tienda_checkout_attempts TO service_role;

ALTER TABLE public.tienda_checkout_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "empresa ve intentos checkout" ON public.tienda_checkout_attempts;
CREATE POLICY "empresa ve intentos checkout"
  ON public.tienda_checkout_attempts
  FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.record_tienda_checkout_failure(
  p_request_id uuid,
  p_slug text,
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_tienda_cliente_id uuid,
  p_item_count integer,
  p_error_code text,
  p_error_message text,
  p_http_status integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_request_id IS NULL OR COALESCE(trim(p_slug), '') = '' THEN RETURN; END IF;

  INSERT INTO public.tienda_checkout_attempts (
    request_id, empresa_id, cliente_id, tienda_cliente_id, slug, status,
    attempt_count, item_count, error_code, error_message, http_status, last_attempt_at
  ) VALUES (
    p_request_id, p_empresa_id, p_cliente_id, p_tienda_cliente_id, p_slug, 'failed',
    1, GREATEST(COALESCE(p_item_count, 0), 0), left(p_error_code, 100),
    left(p_error_message, 1000), p_http_status, now()
  )
  ON CONFLICT (slug, request_id) DO UPDATE SET
    empresa_id = COALESCE(EXCLUDED.empresa_id, public.tienda_checkout_attempts.empresa_id),
    cliente_id = COALESCE(EXCLUDED.cliente_id, public.tienda_checkout_attempts.cliente_id),
    tienda_cliente_id = COALESCE(EXCLUDED.tienda_cliente_id, public.tienda_checkout_attempts.tienda_cliente_id),
    status = CASE
      WHEN public.tienda_checkout_attempts.status = 'succeeded' THEN 'succeeded'
      ELSE 'failed'
    END,
    attempt_count = public.tienda_checkout_attempts.attempt_count + 1,
    item_count = EXCLUDED.item_count,
    error_code = CASE
      WHEN public.tienda_checkout_attempts.status = 'succeeded' THEN NULL
      ELSE EXCLUDED.error_code
    END,
    error_message = CASE
      WHEN public.tienda_checkout_attempts.status = 'succeeded' THEN NULL
      ELSE EXCLUDED.error_message
    END,
    http_status = CASE
      WHEN public.tienda_checkout_attempts.status = 'succeeded' THEN 200
      ELSE EXCLUDED.http_status
    END,
    last_attempt_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.record_tienda_checkout_failure(
  uuid, text, uuid, uuid, uuid, integer, text, text, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_tienda_checkout_failure(
  uuid, text, uuid, uuid, uuid, integer, text, text, integer
) TO service_role;

CREATE OR REPLACE FUNCTION public.create_tienda_order_atomic(
  p_request_id uuid,
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_tienda_cliente_id uuid,
  p_slug text,
  p_almacen_id uuid,
  p_tarifa_id uuid,
  p_fecha_entrega date,
  p_notas text,
  p_subtotal numeric,
  p_iva_total numeric,
  p_ieps_total numeric,
  p_total numeric,
  p_lineas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_venta public.ventas%ROWTYPE;
  v_line_count integer;
  v_error_message text;
  v_error_detail text;
  v_error_hint text;
BEGIN
  INSERT INTO public.tienda_checkout_attempts (
    request_id, empresa_id, cliente_id, tienda_cliente_id, slug,
    status, item_count, attempt_count, last_attempt_at
  ) VALUES (
    p_request_id, p_empresa_id, p_cliente_id, p_tienda_cliente_id, p_slug,
    'processing', CASE WHEN jsonb_typeof(p_lineas) = 'array' THEN jsonb_array_length(p_lineas) ELSE 0 END, 1, now()
  )
  ON CONFLICT (slug, request_id) DO UPDATE SET
    attempt_count = public.tienda_checkout_attempts.attempt_count + 1,
    last_attempt_at = now();

  SELECT * INTO v_venta
  FROM public.ventas
  WHERE empresa_id = p_empresa_id
    AND cliente_id = p_cliente_id
    AND tienda_checkout_request_id = p_request_id;

  IF FOUND THEN
    UPDATE public.tienda_checkout_attempts
       SET status = 'succeeded', venta_id = v_venta.id, folio = v_venta.folio,
           error_code = NULL, error_message = NULL, http_status = 200,
           succeeded_at = COALESCE(succeeded_at, now()), last_attempt_at = now()
     WHERE slug = p_slug AND request_id = p_request_id;
    RETURN jsonb_build_object(
      'ok', true, 'venta_id', v_venta.id, 'folio', v_venta.folio, 'duplicate', true
    );
  END IF;

  BEGIN
    IF p_request_id IS NULL OR p_empresa_id IS NULL OR p_cliente_id IS NULL
       OR p_tienda_cliente_id IS NULL OR COALESCE(trim(p_slug), '') = '' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Identificación incompleta del pedido';
    END IF;
    IF p_lineas IS NULL OR jsonb_typeof(p_lineas) <> 'array'
       OR jsonb_array_length(p_lineas) = 0 OR jsonb_array_length(p_lineas) > 200 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'El pedido debe contener entre 1 y 200 renglones';
    END IF;
    IF COALESCE(p_total, 0) < 0 OR COALESCE(p_subtotal, 0) < 0
       OR COALESCE(p_iva_total, 0) < 0 OR COALESCE(p_ieps_total, 0) < 0 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Los totales del pedido no son válidos';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.clientes c
      WHERE c.id = p_cliente_id AND c.empresa_id = p_empresa_id AND c.status = 'activo'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'El cliente no está activo en esta empresa';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.tienda_clientes tc
      WHERE tc.id = p_tienda_cliente_id AND tc.empresa_id = p_empresa_id
        AND tc.cliente_id = p_cliente_id AND tc.verificado = true
        AND tc.password_hash <> 'BLOCKED$NO_LOGIN'
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'La cuenta de tienda no está activa';
    END IF;
    IF p_almacen_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.almacenes a
      WHERE a.id = p_almacen_id AND a.empresa_id = p_empresa_id AND a.activo = true
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'El almacén de la tienda no es válido';
    END IF;

    SELECT count(*) INTO v_line_count
    FROM jsonb_to_recordset(p_lineas) AS l(
      producto_id uuid, descripcion text, cantidad numeric, precio_unitario numeric,
      descuento_pct numeric, subtotal numeric, iva_pct numeric, iva_monto numeric,
      ieps_pct numeric, ieps_monto numeric, total numeric, presentacion_id uuid,
      presentacion_nombre text, presentacion_factor numeric, paquetes numeric,
      lista_precio_id uuid, precio_unitario_sin_redondeo numeric
    )
    JOIN public.productos p ON p.id = l.producto_id AND p.empresa_id = p_empresa_id
    WHERE l.cantidad > 0 AND l.precio_unitario >= 0 AND l.subtotal >= 0 AND l.total >= 0
      AND p.status = 'activo' AND COALESCE(p.se_puede_vender, true) = true;

    IF v_line_count <> jsonb_array_length(p_lineas) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Uno o más productos ya no están disponibles';
    END IF;

    INSERT INTO public.ventas (
      empresa_id, folio, tipo, status, cliente_id, vendedor_id, almacen_id,
      tarifa_id, condicion_pago, fecha, fecha_entrega, entrega_inmediata, notas,
      subtotal, iva_total, ieps_total, descuento_total, total, saldo_pendiente,
      origen, requiere_factura, tienda_checkout_request_id
    ) VALUES (
      p_empresa_id, NULL, 'pedido', 'borrador', p_cliente_id, NULL, p_almacen_id,
      p_tarifa_id, 'contado', CURRENT_DATE, p_fecha_entrega, false,
      concat_ws(E'\n', NULLIF(trim(COALESCE(p_notas, '')), ''), '[Pedido recibido desde Tienda en Línea]'),
      round(p_subtotal, 2), round(p_iva_total, 2), round(p_ieps_total, 2), 0,
      round(p_total, 2), round(p_total, 2), 'tienda_web', false, p_request_id
    )
    RETURNING * INTO v_venta;

    INSERT INTO public.venta_lineas (
      venta_id, empresa_id, almacen_id, producto_id, descripcion, cantidad,
      precio_unitario, precio_unitario_sin_redondeo, descuento_pct, subtotal,
      iva_pct, iva_monto, ieps_pct, ieps_monto, total, presentacion_id,
      presentacion_nombre, presentacion_factor, paquetes, lista_precio_id
    )
    SELECT
      v_venta.id, p_empresa_id, p_almacen_id, l.producto_id, l.descripcion,
      l.cantidad, l.precio_unitario, l.precio_unitario_sin_redondeo,
      COALESCE(l.descuento_pct, 0), l.subtotal, COALESCE(l.iva_pct, 0),
      COALESCE(l.iva_monto, 0), COALESCE(l.ieps_pct, 0), COALESCE(l.ieps_monto, 0),
      l.total, l.presentacion_id, l.presentacion_nombre, l.presentacion_factor,
      l.paquetes, l.lista_precio_id
    FROM jsonb_to_recordset(p_lineas) AS l(
      producto_id uuid, descripcion text, cantidad numeric, precio_unitario numeric,
      descuento_pct numeric, subtotal numeric, iva_pct numeric, iva_monto numeric,
      ieps_pct numeric, ieps_monto numeric, total numeric, presentacion_id uuid,
      presentacion_nombre text, presentacion_factor numeric, paquetes numeric,
      lista_precio_id uuid, precio_unitario_sin_redondeo numeric
    );

    UPDATE public.tienda_checkout_attempts
       SET status = 'succeeded', venta_id = v_venta.id, folio = v_venta.folio,
           error_code = NULL, error_message = NULL, http_status = 200,
           succeeded_at = now(), last_attempt_at = now()
     WHERE slug = p_slug AND request_id = p_request_id;

    RETURN jsonb_build_object(
      'ok', true, 'venta_id', v_venta.id, 'folio', v_venta.folio, 'duplicate', false
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO v_venta
    FROM public.ventas
    WHERE empresa_id = p_empresa_id
      AND cliente_id = p_cliente_id
      AND tienda_checkout_request_id = p_request_id;
    IF FOUND THEN
      UPDATE public.tienda_checkout_attempts
         SET status = 'succeeded', venta_id = v_venta.id, folio = v_venta.folio,
             error_code = NULL, error_message = NULL, http_status = 200,
             succeeded_at = COALESCE(succeeded_at, now()), last_attempt_at = now()
       WHERE slug = p_slug AND request_id = p_request_id;
      RETURN jsonb_build_object(
        'ok', true, 'venta_id', v_venta.id, 'folio', v_venta.folio, 'duplicate', true
      );
    END IF;
    RAISE;
  WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS
      v_error_message = MESSAGE_TEXT,
      v_error_detail = PG_EXCEPTION_DETAIL,
      v_error_hint = PG_EXCEPTION_HINT;
    UPDATE public.tienda_checkout_attempts
       SET status = 'failed', error_code = SQLSTATE,
           error_message = left(concat_ws(' · ', v_error_message, NULLIF(v_error_detail, ''), NULLIF(v_error_hint, '')), 1000),
           http_status = CASE WHEN SQLSTATE IN ('22023', '23503') THEN 400 ELSE 500 END,
           last_attempt_at = now()
     WHERE slug = p_slug AND request_id = p_request_id;
    RETURN jsonb_build_object(
      'ok', false,
      'code', CASE WHEN SQLSTATE IN ('22023', '23503') THEN 'invalid_order' ELSE 'database_error' END,
      'error', CASE
        WHEN SQLSTATE IN ('22023', '23503') THEN v_error_message
        ELSE 'No fue posible guardar el pedido. Intenta nuevamente.'
      END
    );
  END;
END;
$$;

REVOKE ALL ON FUNCTION public.create_tienda_order_atomic(
  uuid, uuid, uuid, uuid, text, uuid, uuid, date, text,
  numeric, numeric, numeric, numeric, jsonb
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_tienda_order_atomic(
  uuid, uuid, uuid, uuid, text, uuid, uuid, date, text,
  numeric, numeric, numeric, numeric, jsonb
) TO service_role;
