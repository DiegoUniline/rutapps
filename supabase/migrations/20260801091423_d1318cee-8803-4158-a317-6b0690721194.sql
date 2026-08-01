DO $$
DECLARE v_emp uuid;
BEGIN
  SELECT id INTO v_emp FROM empresas WHERE licencia = '43129204';

  CREATE TEMP TABLE tmp_fix ON COMMIT DROP AS
  WITH p AS (
    SELECT pr.id AS pid, pr.nombre AS pnom, pr.empresa_id, pr.cantidad_minima, pr.cantidad_gratis,
           pr.created_at, pr.vigencia_inicio, pr.vigencia_fin, pr.cliente_ids, pr.dias_semana,
           unnest(pr.producto_ids)::uuid AS producto_id
    FROM promociones pr
    WHERE pr.activa AND pr.tipo = 'producto_gratis' AND pr.cantidad_minima > 1
      AND pr.producto_gratis_id IS NULL AND pr.empresa_id = v_emp
  ), cand AS (
    SELECT vl.id AS linea_id, vl.venta_id, vl.cantidad, vl.importe_bruto, p.pid, p.pnom,
           round(floor(vl.cantidad / p.cantidad_minima) * p.cantidad_gratis * vl.precio_lista_unitario, 2) AS desc_monto,
           row_number() OVER (PARTITION BY vl.id ORDER BY floor(vl.cantidad / p.cantidad_minima) * p.cantidad_gratis * vl.precio_lista_unitario DESC) AS rn
    FROM venta_lineas vl
    JOIN ventas v ON v.id = vl.venta_id AND v.status <> 'cancelado' AND v.empresa_id = v_emp
    JOIN p ON p.producto_id = vl.producto_id
    WHERE vl.cantidad >= p.cantidad_minima
      AND COALESCE(vl.descuento_promocion_monto, 0) = 0
      AND COALESCE(vl.iva_monto, 0) = 0 AND COALESCE(vl.ieps_monto, 0) = 0
      AND v.created_at >= p.created_at
      AND (p.vigencia_inicio IS NULL OR v.fecha >= p.vigencia_inicio)
      AND (p.vigencia_fin IS NULL OR v.fecha <= p.vigencia_fin)
      AND (p.cliente_ids IS NULL OR array_length(p.cliente_ids,1) IS NULL OR v.cliente_id = ANY(p.cliente_ids))
      AND (p.dias_semana IS NULL OR array_length(p.dias_semana,1) IS NULL OR EXTRACT(DOW FROM v.fecha)::int::text = ANY(p.dias_semana))
  )
  SELECT linea_id, venta_id, cantidad, importe_bruto, pid, pnom, desc_monto
  FROM cand WHERE rn = 1 AND desc_monto > 0 AND desc_monto < importe_bruto;

  UPDATE venta_lineas vl
  SET descuento_promocion_monto = f.desc_monto,
      descuento_total_monto = COALESCE(vl.descuento_total_monto, 0) + f.desc_monto,
      subtotal = f.importe_bruto - f.desc_monto,
      total = f.importe_bruto - f.desc_monto,
      precio_unitario = round((f.importe_bruto - f.desc_monto) / f.cantidad, 6),
      precio_unitario_sin_redondeo = (f.importe_bruto - f.desc_monto) / f.cantidad,
      promocion_id = COALESCE(vl.promocion_id, f.pid),
      promocion_nombre = COALESCE(vl.promocion_nombre, f.pnom)
  FROM tmp_fix f WHERE vl.id = f.linea_id;

  INSERT INTO promocion_aplicada (venta_id, venta_linea_id, promocion_id, descripcion, descuento_aplicado)
  SELECT f.venta_id, f.linea_id, f.pid, f.pnom, f.desc_monto
  FROM tmp_fix f
  WHERE NOT EXISTS (
    SELECT 1 FROM promocion_aplicada pa WHERE pa.venta_linea_id = f.linea_id AND pa.promocion_id = f.pid
  );

  UPDATE ventas v
  SET subtotal = GREATEST(COALESCE(v.subtotal,0) - agg.d, 0),
      descuento_total = COALESCE(v.descuento_total, 0) + agg.d,
      total = GREATEST(v.total - agg.d, 0)
  FROM (SELECT venta_id, sum(desc_monto) AS d FROM tmp_fix GROUP BY venta_id) agg
  WHERE v.id = agg.venta_id;

  UPDATE ventas v
  SET saldo_pendiente = GREATEST(v.total - COALESCE((
        SELECT sum(ca.monto_aplicado) FROM cobro_aplicaciones ca
        JOIN cobros c ON c.id = ca.cobro_id AND c.status = 'activo'
        WHERE ca.venta_id = v.id), 0), 0)
  WHERE v.id IN (SELECT DISTINCT venta_id FROM tmp_fix);
END $$;