-- Bug: al cancelar (o regresar a borrador) una venta que ya tuvo devoluciones, se regresaba al
-- almacén TODO lo vendido aunque el cliente ya había regresado parte por la devolución (que entra
-- con su propio movimiento 'devolucion_aplicada'). Resultado: inventario inflado (VTA-0001: +5).
--
-- Corrección en fn_sync_venta_inventario: cuando la venta deja de aplicar inventario, lo ya devuelto
-- (tope: lo que tiene la línea y solo si la venta llegó a sacar ese producto) se queda como "salido"
-- de la venta; así solo regresa la diferencia. La devolución conserva su propio movimiento
-- (vendible o mermas), por lo que el total físico cuadra.
--
-- Se aplica sobre la definición vigente reemplazando un punto fijo; si no lo encuentra, falla.

DO $mig$
DECLARE
  v_def    text := pg_get_functiondef('public.fn_sync_venta_inventario(uuid)'::regprocedure);
  v_anchor text := E'  FOR p IN\n    SELECT producto_id,\n           SUM(des) AS deseado_total,';
  v_bloque text := E'  -- Devoluciones (fix 2026-11-19): al cancelar/regresar a borrador no se vuelve a regresar\n'
                || E'  -- lo que el cliente ya devolvió; ese producto ya entró por su propio movimiento.\n'
                || E'  IF NOT v_aplica THEN\n'
                || E'    INSERT INTO _sync_des (producto_id, lote_id, cant)\n'
                || E'    SELECT dv.producto_id, NULL::uuid, LEAST(dv.devuelto, ln.cant)\n'
                || E'      FROM (SELECT dl.producto_id, SUM(COALESCE(dl.cantidad,0)) AS devuelto\n'
                || E'              FROM public.devolucion_lineas dl\n'
                || E'              JOIN public.devoluciones d ON d.id = dl.devolucion_id\n'
                || E'             WHERE d.venta_id = p_venta_id\n'
                || E'             GROUP BY dl.producto_id) dv\n'
                || E'      JOIN (SELECT vl.producto_id, SUM(COALESCE(vl.cantidad,0)) AS cant\n'
                || E'              FROM public.venta_lineas vl\n'
                || E'             WHERE vl.venta_id = p_venta_id\n'
                || E'             GROUP BY vl.producto_id) ln ON ln.producto_id = dv.producto_id\n'
                || E'     WHERE dv.devuelto > 0\n'
                || E'       AND EXISTS (SELECT 1 FROM public.movimientos_inventario mi\n'
                || E'                    WHERE mi.referencia_id = p_venta_id\n'
                || E'                      AND mi.referencia_tipo IN (''venta'',''venta_lote'')\n'
                || E'                      AND mi.tipo::text = ''salida''\n'
                || E'                      AND mi.producto_id = dv.producto_id);\n'
                || E'  END IF;\n\n';
BEGIN
  IF position(v_anchor IN v_def) = 0 THEN
    RAISE EXCEPTION 'fn_sync_venta_inventario cambió: no se encontró el punto de inserción';
  END IF;
  IF position('Devoluciones (fix 2026-11-19)' IN v_def) > 0 THEN
    RETURN; -- ya aplicado
  END IF;
  EXECUTE replace(v_def, v_anchor, v_bloque || v_anchor);
END
$mig$;

-- Recalcular las ventas canceladas que ya tenían devoluciones (en esta base: VTA-0001).
DO $fix$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT v.id
      FROM public.ventas v
      JOIN public.devoluciones d ON d.venta_id = v.id
     WHERE v.status::text IN ('cancelado', 'borrador')
  LOOP
    PERFORM public.fn_sync_venta_inventario(r.id);
  END LOOP;
END
$fix$;
