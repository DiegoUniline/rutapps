
DO $$
DECLARE v_id uuid := '52f21684-f18e-4707-b7a6-bf2b9d54b210';
        v_pagado numeric;
BEGIN
  UPDATE venta_lineas SET precio_unitario = 99.074074074074074, subtotal = 99.07, ieps_monto = 7.93, total = 107.00
  WHERE venta_id = v_id AND descripcion = 'MAZAPAN ORIGINAL C30';

  UPDATE venta_lineas SET precio_unitario = 117.592592592592593, subtotal = 117.59, ieps_monto = 9.41, total = 127.00
  WHERE venta_id = v_id AND descripcion = 'MAZAPAN GIGANTE C20';

  SELECT COALESCE(SUM(ca.monto_aplicado),0) INTO v_pagado
  FROM cobro_aplicaciones ca JOIN cobros c ON c.id = ca.cobro_id
  WHERE ca.venta_id = v_id AND COALESCE(c.status,'activo') <> 'cancelado';

  UPDATE ventas v SET
    subtotal = l.sub, ieps_total = l.ieps, iva_total = l.iva,
    total = l.sub + l.ieps + l.iva - COALESCE(v.descuento_total,0),
    saldo_pendiente = GREATEST(l.sub + l.ieps + l.iva - COALESCE(v.descuento_total,0) - v_pagado, 0)
  FROM (SELECT SUM(subtotal) sub, SUM(ieps_monto) ieps, SUM(iva_monto) iva
        FROM venta_lineas WHERE venta_id = v_id) l
  WHERE v.id = v_id;
END $$;
