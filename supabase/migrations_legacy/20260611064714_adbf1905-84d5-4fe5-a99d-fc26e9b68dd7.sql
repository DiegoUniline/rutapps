DO $$
DECLARE
  eid uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
BEGIN
  DELETE FROM public.visitas WHERE empresa_id = eid;
  DELETE FROM public.cobro_aplicaciones WHERE cobro_id IN (SELECT id FROM public.cobros WHERE empresa_id = eid);
  DELETE FROM public.cobros WHERE empresa_id = eid;
  DELETE FROM public.venta_historial WHERE venta_id IN (SELECT id FROM public.ventas WHERE empresa_id = eid);
  DELETE FROM public.venta_comisiones WHERE venta_id IN (SELECT id FROM public.ventas WHERE empresa_id = eid);
  DELETE FROM public.promocion_aplicada WHERE venta_id IN (SELECT id FROM public.ventas WHERE empresa_id = eid);
  DELETE FROM public.venta_lineas WHERE venta_id IN (SELECT id FROM public.ventas WHERE empresa_id = eid);
  DELETE FROM public.devolucion_lineas WHERE devolucion_id IN (SELECT id FROM public.devoluciones WHERE empresa_id = eid);
  DELETE FROM public.devoluciones WHERE empresa_id = eid;
  DELETE FROM public.entrega_lineas WHERE entrega_id IN (SELECT id FROM public.entregas WHERE empresa_id = eid);
  DELETE FROM public.entregas WHERE empresa_id = eid;
  DELETE FROM public.ventas WHERE empresa_id = eid;

  DELETE FROM public.carga_lineas WHERE carga_id IN (SELECT id FROM public.cargas WHERE empresa_id = eid);
  DELETE FROM public.carga_pedidos WHERE carga_id IN (SELECT id FROM public.cargas WHERE empresa_id = eid);
  DELETE FROM public.cargas WHERE empresa_id = eid;
  DELETE FROM public.descarga_ruta_lineas WHERE descarga_id IN (SELECT id FROM public.descarga_ruta WHERE empresa_id = eid);
  DELETE FROM public.descarga_ruta WHERE empresa_id = eid;
  DELETE FROM public.stock_camion WHERE empresa_id = eid;
  DELETE FROM public.ruta_sesiones WHERE empresa_id = eid;
  DELETE FROM public.cliente_orden_ruta WHERE empresa_id = eid;
  DELETE FROM public.cliente_pedido_sugerido WHERE cliente_id IN (SELECT id FROM public.clientes WHERE empresa_id = eid);

  DELETE FROM public.pago_compras WHERE compra_id IN (SELECT id FROM public.compras WHERE empresa_id = eid);
  DELETE FROM public.compra_lineas WHERE compra_id IN (SELECT id FROM public.compras WHERE empresa_id = eid);
  DELETE FROM public.compras WHERE empresa_id = eid;

  DELETE FROM public.movimientos_inventario WHERE empresa_id = eid;
  DELETE FROM public.ajustes_inventario WHERE empresa_id = eid;
  DELETE FROM public.traspaso_lineas WHERE traspaso_id IN (SELECT id FROM public.traspasos WHERE empresa_id = eid);
  DELETE FROM public.traspasos WHERE empresa_id = eid;
  DELETE FROM public.merma_lineas WHERE merma_id IN (SELECT id FROM public.mermas WHERE empresa_id = eid);
  DELETE FROM public.mermas WHERE empresa_id = eid;
  DELETE FROM public.conteo_entradas WHERE conteo_linea_id IN (
    SELECT cl.id FROM public.conteo_lineas cl
    JOIN public.conteos_fisicos cf ON cf.id = cl.conteo_id
    WHERE cf.empresa_id = eid
  );
  DELETE FROM public.conteo_lineas WHERE conteo_id IN (SELECT id FROM public.conteos_fisicos WHERE empresa_id = eid);
  DELETE FROM public.conteos_fisicos WHERE empresa_id = eid;
  DELETE FROM public.stock_almacen WHERE producto_id IN (SELECT id FROM public.productos WHERE empresa_id = eid);

  DELETE FROM public.caja_movimientos WHERE turno_id IN (SELECT id FROM public.caja_turnos WHERE empresa_id = eid);
  DELETE FROM public.caja_turnos WHERE empresa_id = eid;
  DELETE FROM public.gastos WHERE empresa_id = eid;

  DELETE FROM public.cfdi_lineas WHERE cfdi_id IN (SELECT id FROM public.cfdis WHERE empresa_id = eid);
  DELETE FROM public.cfdis WHERE empresa_id = eid;
  DELETE FROM public.facturas WHERE empresa_id = eid;

  DELETE FROM public.producto_equivalencias WHERE producto_id IN (SELECT id FROM public.productos WHERE empresa_id = eid);
  DELETE FROM public.producto_presentaciones WHERE producto_id IN (SELECT id FROM public.productos WHERE empresa_id = eid);
  DELETE FROM public.producto_proveedores WHERE producto_id IN (SELECT id FROM public.productos WHERE empresa_id = eid);
  DELETE FROM public.tarifa_lineas WHERE tarifa_id IN (SELECT id FROM public.tarifas WHERE empresa_id = eid);
  DELETE FROM public.productos WHERE empresa_id = eid;
  DELETE FROM public.clientes WHERE empresa_id = eid;

  UPDATE public.empresas SET onboarding_completado = false WHERE id = eid;
END $$;