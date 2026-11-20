-- D-035: eliminar ventas en UNA operación de la BD y solo cuando no hay historia que proteger.
-- Se permite eliminar: BORRADOR, o CANCELADA sin pagos activos aplicados, sin facturas (CFDI)
-- y sin comisiones pagadas. Todo lo demás se cancela, no se borra.
-- Antes «Eliminar varias» en la lista borraba pagos aplicados e historial sin revisar nada.

CREATE OR REPLACE FUNCTION public.eliminar_ventas(p_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_emp   uuid := public.get_my_empresa_id();
  v       record;
  v_ok    int := 0;
  v_rech  jsonb := '[]'::jsonb;
  v_motivo text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
    RETURN jsonb_build_object('eliminadas', 0, 'rechazadas', v_rech);
  END IF;
  -- Permiso ventas · eliminar (dueño, super admin y usuario sin rol: acceso total, como la app).
  IF NOT public.is_super_admin(v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.empresas e WHERE e.id = v_emp AND e.owner_user_id = v_uid)
     AND EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = v_uid)
     AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.role_permisos rp ON rp.role_id = ur.role_id
                      WHERE ur.user_id = v_uid AND rp.modulo = 'ventas' AND rp.accion = 'eliminar' AND rp.permitido)
  THEN
    RAISE EXCEPTION 'No tienes permiso para eliminar ventas' USING ERRCODE = '42501';
  END IF;

  FOR v IN
    SELECT id, folio, status::text AS status, empresa_id
      FROM public.ventas
     WHERE id = ANY(p_ids)
     ORDER BY folio
     FOR UPDATE
  LOOP
    v_motivo := NULL;
    IF v.empresa_id IS DISTINCT FROM v_emp AND NOT public.is_super_admin(v_uid) THEN
      v_motivo := 'Sin acceso';
    ELSIF v.status NOT IN ('borrador', 'cancelado') THEN
      v_motivo := 'Solo se eliminan borradores o ventas canceladas; cancélala primero';
    ELSIF EXISTS (SELECT 1 FROM public.cobro_aplicaciones ca JOIN public.cobros c ON c.id = ca.cobro_id
                   WHERE ca.venta_id = v.id AND COALESCE(c.status, 'activo') <> 'cancelado') THEN
      v_motivo := 'Tiene pagos aplicados';
    ELSIF EXISTS (SELECT 1 FROM public.cfdis WHERE venta_id = v.id)
       OR EXISTS (SELECT 1 FROM public.cfdi_lineas cl JOIN public.venta_lineas vl ON vl.id = cl.venta_linea_id
                   WHERE vl.venta_id = v.id) THEN
      v_motivo := 'Tiene facturas';
    ELSIF EXISTS (SELECT 1 FROM public.venta_comisiones WHERE venta_id = v.id AND (pagada OR pago_comision_id IS NOT NULL)) THEN
      v_motivo := 'Tiene comisiones pagadas';
    ELSIF EXISTS (SELECT 1 FROM public.entregas WHERE pedido_id = v.id AND status::text <> 'cancelado') THEN
      v_motivo := 'Tiene entregas activas';
    END IF;

    IF v_motivo IS NOT NULL THEN
      v_rech := v_rech || jsonb_build_object('id', v.id, 'folio', v.folio, 'motivo', v_motivo);
      CONTINUE;
    END IF;

    BEGIN
      -- Aplicaciones de cobros ya cancelados (no hay dinero vivo), entregas canceladas y la venta.
      DELETE FROM public.cobro_aplicaciones
       WHERE venta_id = v.id
         AND cobro_id IN (SELECT id FROM public.cobros WHERE status = 'cancelado');
      DELETE FROM public.entrega_lineas WHERE entrega_id IN (SELECT id FROM public.entregas WHERE pedido_id = v.id);
      DELETE FROM public.entregas WHERE pedido_id = v.id;
      DELETE FROM public.ventas WHERE id = v.id;   -- líneas, promociones, comisiones, historial: en cascada
      v_ok := v_ok + 1;
    EXCEPTION WHEN OTHERS THEN
      v_rech := v_rech || jsonb_build_object('id', v.id, 'folio', v.folio, 'motivo', SQLERRM);
    END;
  END LOOP;

  RETURN jsonb_build_object('eliminadas', v_ok, 'rechazadas', v_rech);
END;
$function$;

REVOKE ALL ON FUNCTION public.eliminar_ventas(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_ventas(uuid[]) TO authenticated;
