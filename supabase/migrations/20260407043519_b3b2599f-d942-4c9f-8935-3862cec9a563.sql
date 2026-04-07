UPDATE ventas
SET saldo_pendiente = total
WHERE saldo_pendiente = 0
  AND status != 'cancelado'
  AND total > 0
  AND id NOT IN (
    SELECT DISTINCT ca.venta_id FROM cobro_aplicaciones ca
    JOIN cobros c ON c.id = ca.cobro_id
    WHERE c.status != 'cancelado'
  );