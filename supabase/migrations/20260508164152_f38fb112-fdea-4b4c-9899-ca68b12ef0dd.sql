DO $$
DECLARE
  v_emp uuid;
BEGIN
  SELECT id INTO v_emp FROM empresas WHERE nombre ILIKE '%distribuidora mg%' LIMIT 1;
  IF v_emp IS NULL THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;

  CREATE TEMP TABLE _dupes ON COMMIT DROP AS
  WITH ranked AS (
    SELECT id, pedido_id,
      ROW_NUMBER() OVER (PARTITION BY pedido_id ORDER BY created_at ASC) AS rn,
      COUNT(*) OVER (PARTITION BY pedido_id) AS c
    FROM entregas
    WHERE empresa_id = v_emp AND pedido_id IS NOT NULL AND status <> 'cancelado'
  )
  SELECT id FROM ranked WHERE c > 1 AND rn > 1;

  DELETE FROM movimientos_inventario
  WHERE referencia_tipo = 'entrega' AND referencia_id IN (SELECT id FROM _dupes);

  DELETE FROM entrega_lineas WHERE entrega_id IN (SELECT id FROM _dupes);

  DELETE FROM entregas WHERE id IN (SELECT id FROM _dupes);
END $$;