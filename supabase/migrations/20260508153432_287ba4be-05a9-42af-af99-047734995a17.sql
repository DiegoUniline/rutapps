DO $$
DECLARE v_empresa uuid := '2deead6d-4118-4a59-a34c-a3f898292d77';
BEGIN
  CREATE TEMP TABLE _dup_extra AS
  WITH ranked AS (
    SELECT id, almacen_destino_id, producto_id, cantidad,
      ROW_NUMBER() OVER (PARTITION BY referencia_id, producto_id ORDER BY created_at) AS rn
    FROM movimientos_inventario
    WHERE empresa_id = v_empresa
      AND referencia_tipo = 'entrega'
      AND notas = 'Carga masiva a ubicación'
      AND created_at >= '2026-05-07' AND created_at < '2026-05-08'
  )
  SELECT id, almacen_destino_id, producto_id, cantidad FROM ranked WHERE rn > 1;

  UPDATE stock_almacen sa
  SET cantidad = GREATEST(0, sa.cantidad - agg.total_extra), updated_at = now()
  FROM (
    SELECT almacen_destino_id, producto_id, SUM(cantidad) AS total_extra
    FROM _dup_extra GROUP BY almacen_destino_id, producto_id
  ) agg
  WHERE sa.empresa_id = v_empresa
    AND sa.almacen_id = agg.almacen_destino_id
    AND sa.producto_id = agg.producto_id;

  DELETE FROM movimientos_inventario WHERE id IN (SELECT id FROM _dup_extra);
  DROP TABLE _dup_extra;
END $$;