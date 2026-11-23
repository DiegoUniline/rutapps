-- D-062 · Convertir un pedido en venta directa (botón «Convertir a venta directa»).
-- Dueño: «solo pon el botón de convertir pedido en venta directa y ahí descuente y ellos que hagan
-- lo que quieran». Solo AGREGA una función; no cambia tablas, triggers ni otras funciones.
--
-- public.fn_convertir_pedido_a_venta(p_venta_id, p_almacen_id) → jsonb, en UNA transacción:
--   Valida: sesión con acceso a la empresa (fn_assert_empresa) y permiso de editar ventas (mismo
--   criterio que editar_venta: super admin, dueño, usuario sin roles o rol con ventas·editar);
--   tipo='pedido'; status borrador/confirmado; no cerrado a lo entregado; sin entregas no
--   canceladas («Este pedido tiene entregas; termínalo desde Entregas»); con productos; almacén
--   activo de la misma empresa; lotes ya asignados (venta_linea_lotes) del mismo almacén.
--   Hace: tipo='venta_directa', entrega_inmediata=true, almacen_id=p_almacen_id,
--   status='confirmado' (el borrador se confirma: en la BD no hay más validaciones de confirmar;
--   el stock NO se valida, puede quedar negativo como pidió el dueño), libera el apartado
--   (stock_apartado) del pedido, descuenta inventario con fn_sync_venta_inventario (por delta e
--   idempotente; con tipo venta_directa + entrega_inmediata + confirmado el sync SÍ aplica y la
--   regla «pedido con entregas» ya no lo omite), recalcula saldo_pendiente (fn_recalc_venta_saldo:
--   una venta directa debe el total menos lo cobrado) y registra venta_historial
--   'convertido_a_venta_directa' con el almacén.
--   Conserva folio, fecha, líneas, precios, cobros y condición de pago.
--   Repetir la llamada sobre un pedido ya convertido no hace nada (ya_convertido=true).
--   Los triggers DEFERRED de ventas vuelven a llamar al sync al confirmar la transacción: no
--   duplica (delta).
--
-- Reversión: DROP FUNCTION public.fn_convertir_pedido_a_venta(uuid, uuid);  (las ventas ya
-- convertidas se quedan como venta directa; para deshacer una, cancelarla y capturarla de nuevo).

BEGIN;

CREATE OR REPLACE FUNCTION public.fn_convertir_pedido_a_venta(p_venta_id uuid, p_almacen_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid       uuid := auth.uid();
  v_venta     public.ventas%ROWTYPE;
  v_almacen   public.almacenes%ROWTYPE;
  v_entregas  text;
  v_lotes     text;
  v_apartado  numeric := 0;
BEGIN
  IF p_venta_id IS NULL OR p_almacen_id IS NULL THEN
    RAISE EXCEPTION 'Indica el pedido y el almacén de salida.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pedido no encontrado' USING ERRCODE = 'P0002';
  END IF;

  -- Empresa del usuario (o super admin). Sin sesión: solo backend/service_role.
  PERFORM public.fn_assert_empresa(v_venta.empresa_id);

  -- Permiso: el mismo que editar una venta (editar_venta).
  IF v_uid IS NOT NULL
     AND NOT public.is_super_admin(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = v_venta.empresa_id AND e.owner_user_id = v_uid)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid)
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
       JOIN public.role_permisos rp ON rp.role_id = ur.role_id
       WHERE ur.user_id = v_uid AND rp.modulo = 'ventas' AND rp.accion = 'editar' AND rp.permitido)
  THEN
    RAISE EXCEPTION 'No tienes permiso para convertir pedidos en venta' USING ERRCODE = '42501';
  END IF;

  -- Repetición (doble toque, reintento tras perder la respuesta): ya convertido → no hace nada.
  IF v_venta.tipo::text = 'venta_directa'
     AND EXISTS (SELECT 1 FROM public.venta_historial h
                 WHERE h.venta_id = p_venta_id AND h.accion = 'convertido_a_venta_directa') THEN
    RETURN jsonb_build_object(
      'venta_id', v_venta.id, 'folio', v_venta.folio, 'tipo', v_venta.tipo, 'status', v_venta.status,
      'almacen_id', v_venta.almacen_id, 'total', v_venta.total,
      'saldo_pendiente', v_venta.saldo_pendiente, 'ya_convertido', true);
  END IF;

  IF v_venta.tipo::text <> 'pedido' OR COALESCE(v_venta.es_saldo_inicial, false) THEN
    RAISE EXCEPTION 'Solo se pueden convertir pedidos.' USING ERRCODE = 'P0001';
  END IF;
  IF v_venta.status::text NOT IN ('borrador', 'confirmado') THEN
    RAISE EXCEPTION 'Solo se convierten pedidos en borrador o confirmados (este está %).', v_venta.status
      USING ERRCODE = 'P0001';
  END IF;
  IF v_venta.cerrado_at IS NOT NULL THEN
    RAISE EXCEPTION 'El pedido está cerrado a lo entregado; no se puede convertir.' USING ERRCODE = 'P0001';
  END IF;

  SELECT string_agg(COALESCE(e.folio, e.id::text), ', ' ORDER BY e.folio) INTO v_entregas
    FROM public.entregas e
   WHERE e.pedido_id = p_venta_id AND e.status::text <> 'cancelado';
  IF v_entregas IS NOT NULL THEN
    RAISE EXCEPTION 'Este pedido tiene entregas; termínalo desde Entregas'
      USING ERRCODE = 'P0001', DETAIL = 'Entregas: ' || v_entregas;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.venta_lineas vl
                  WHERE vl.venta_id = p_venta_id AND vl.producto_id IS NOT NULL AND COALESCE(vl.cantidad, 0) > 0) THEN
    RAISE EXCEPTION 'El pedido no tiene productos.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_almacen FROM public.almacenes WHERE id = p_almacen_id;
  IF NOT FOUND OR v_almacen.empresa_id IS DISTINCT FROM v_venta.empresa_id THEN
    RAISE EXCEPTION 'El almacén no pertenece a la empresa' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE(v_almacen.activo, false) THEN
    RAISE EXCEPTION 'El almacén % está inactivo.', v_almacen.nombre USING ERRCODE = 'P0001';
  END IF;

  -- Lotes ya repartidos en otro almacén: el sync los sacaría del almacén elegido.
  SELECT string_agg(DISTINCT a.nombre, ', ') INTO v_lotes
    FROM public.venta_linea_lotes d
    LEFT JOIN public.almacenes a ON a.id = d.almacen_id
   WHERE d.venta_id = p_venta_id AND d.almacen_id IS NOT NULL AND d.almacen_id <> p_almacen_id;
  IF v_lotes IS NOT NULL THEN
    RAISE EXCEPTION 'Los lotes del pedido están asignados en otro almacén (%). Elige ese almacén.', v_lotes
      USING ERRCODE = 'P0001';
  END IF;

  -- El apartado es de pedidos: al volverse venta lo reemplaza el descuento real.
  SELECT COALESCE(SUM(cantidad), 0) INTO v_apartado FROM public.stock_apartado WHERE venta_id = p_venta_id;
  DELETE FROM public.stock_apartado WHERE venta_id = p_venta_id;

  UPDATE public.ventas
     SET tipo = 'venta_directa',
         entrega_inmediata = true,
         almacen_id = p_almacen_id,
         status = 'confirmado'
   WHERE id = p_venta_id;

  -- Inventario: el mismo motor por delta (idempotente). El trigger DEFERRED lo repite sin efecto.
  PERFORM public.fn_sync_venta_inventario(p_venta_id);
  -- Saldo: venta directa debe el total menos lo cobrado (un pedido «por entregado» debía 0).
  PERFORM public.fn_recalc_venta_saldo(p_venta_id);

  PERFORM public.log_venta_historial(p_venta_id, v_venta.empresa_id, 'convertido_a_venta_directa',
    jsonb_build_object(
      'almacen_id', p_almacen_id,
      'almacen_nombre', v_almacen.nombre,
      'almacen_anterior_id', v_venta.almacen_id,
      'status_anterior', v_venta.status::text,
      'entrega_inmediata_anterior', COALESCE(v_venta.entrega_inmediata, false),
      'apartado_liberado', v_apartado));

  SELECT * INTO v_venta FROM public.ventas WHERE id = p_venta_id;
  RETURN jsonb_build_object(
    'venta_id', v_venta.id, 'folio', v_venta.folio, 'tipo', v_venta.tipo, 'status', v_venta.status,
    'almacen_id', v_venta.almacen_id, 'total', v_venta.total,
    'saldo_pendiente', v_venta.saldo_pendiente, 'ya_convertido', false);
END
$function$;

COMMENT ON FUNCTION public.fn_convertir_pedido_a_venta(uuid, uuid) IS
  'D-062: convierte un pedido (borrador/confirmado, sin entregas activas) en venta directa con entrega inmediata desde p_almacen_id; descuenta inventario con fn_sync_venta_inventario, recalcula saldo y registra venta_historial. Idempotente.';

REVOKE ALL ON FUNCTION public.fn_convertir_pedido_a_venta(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_convertir_pedido_a_venta(uuid, uuid) TO authenticated, service_role;

COMMIT;
