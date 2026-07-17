
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT cl.producto_id
    FROM compra_lineas cl
    JOIN compras c ON c.id = cl.compra_id
    WHERE c.status IN ('recibida', 'pagada')
  LOOP
    PERFORM public.recalc_producto_costo(r.producto_id);
  END LOOP;
END $$;
