DO $$
DECLARE
  eid uuid := '6d849e12-6437-4b24-917d-a89cc9b2fa88';
BEGIN
  -- CFDIs
  DELETE FROM cfdi_lineas WHERE cfdi_id IN (SELECT id FROM cfdis WHERE empresa_id = eid);
  DELETE FROM cfdis WHERE empresa_id = eid;

  -- Cobros
  DELETE FROM cobro_aplicaciones WHERE cobro_id IN (SELECT id FROM cobros WHERE empresa_id = eid);
  DELETE FROM cobros WHERE empresa_id = eid;

  -- Devoluciones
  DELETE FROM devolucion_lineas WHERE devolucion_id IN (SELECT id FROM devoluciones WHERE empresa_id = eid);
  DELETE FROM devoluciones WHERE empresa_id = eid;

  -- Entregas
  DELETE FROM entrega_lineas WHERE entrega_id IN (SELECT id FROM entregas WHERE empresa_id = eid);
  DELETE FROM entregas WHERE empresa_id = eid;

  -- Visitas (references ventas)
  DELETE FROM visitas WHERE empresa_id = eid;

  -- Ventas
  DELETE FROM venta_historial WHERE empresa_id = eid;
  DELETE FROM venta_lineas WHERE venta_id IN (SELECT id FROM ventas WHERE empresa_id = eid);
  DELETE FROM ventas WHERE empresa_id = eid;

  -- Compras
  DELETE FROM compra_lineas WHERE compra_id IN (SELECT id FROM compras WHERE empresa_id = eid);
  DELETE FROM compras WHERE empresa_id = eid;

  -- Traspasos
  DELETE FROM traspaso_lineas WHERE traspaso_id IN (SELECT id FROM traspasos WHERE empresa_id = eid);
  DELETE FROM traspasos WHERE empresa_id = eid;

  -- Cargas
  DELETE FROM carga_pedidos WHERE carga_id IN (SELECT id FROM cargas WHERE empresa_id = eid);
  DELETE FROM carga_lineas WHERE carga_id IN (SELECT id FROM cargas WHERE empresa_id = eid);
  DELETE FROM cargas WHERE empresa_id = eid;

  -- Descargas
  DELETE FROM descarga_ruta_lineas WHERE descarga_id IN (SELECT id FROM descarga_ruta WHERE empresa_id = eid);
  DELETE FROM descarga_ruta WHERE empresa_id = eid;

  -- Auditorías
  DELETE FROM auditoria_escaneos WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = eid);
  DELETE FROM auditoria_entradas WHERE auditoria_linea_id IN (SELECT al.id FROM auditoria_lineas al JOIN auditorias a ON a.id = al.auditoria_id WHERE a.empresa_id = eid);
  DELETE FROM auditoria_lineas WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = eid);
  DELETE FROM auditorias WHERE empresa_id = eid;

  -- Conteos físicos
  DELETE FROM conteo_entradas WHERE conteo_linea_id IN (SELECT cl.id FROM conteo_lineas cl JOIN conteos_fisicos cf ON cf.id = cl.conteo_id WHERE cf.empresa_id = eid);
  DELETE FROM conteo_lineas WHERE conteo_id IN (SELECT id FROM conteos_fisicos WHERE empresa_id = eid);
  DELETE FROM conteos_fisicos WHERE empresa_id = eid;

  -- Ajustes inventario
  DELETE FROM ajustes_inventario WHERE empresa_id = eid;

  -- Gastos
  DELETE FROM gastos WHERE empresa_id = eid;

  -- Movimientos de inventario
  DELETE FROM movimientos_inventario WHERE empresa_id = eid;

  -- Stock
  DELETE FROM stock_almacen WHERE empresa_id = eid;
  DELETE FROM stock_camion WHERE empresa_id = eid;

  -- Reset producto cantidades a 0
  UPDATE productos SET cantidad = 0 WHERE empresa_id = eid;
END;
$$;