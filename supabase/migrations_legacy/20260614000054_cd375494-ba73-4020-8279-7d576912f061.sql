
DO $$
DECLARE
  r record;
  set_null_tables text[] := ARRAY[
    'movimientos_inventario','ajustes_inventario','venta_lineas','compra_lineas',
    'entrega_lineas','devolucion_lineas','merma_lineas','conteo_lineas',
    'traspaso_lineas','carga_lineas','descarga_ruta_lineas','cfdi_lineas',
    'auditoria_lineas','promocion_aplicada','cliente_pedido_sugerido'
  ];
  cascade_tables text[] := ARRAY[
    'stock_almacen','stock_camion','producto_presentaciones','producto_equivalencias',
    'producto_proveedores','tarifa_lineas','lista_precios_lineas'
  ];
BEGIN
  FOR r IN
    SELECT c.relname AS tbl, con.conname, a.attname AS col
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_class rc ON rc.oid = con.confrelid
    JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
    WHERE n.nspname='public' AND con.contype='f' AND rc.relname='productos'
      AND array_length(con.conkey,1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', r.tbl, r.conname);
    IF r.tbl = ANY(set_null_tables) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.tbl, r.col);
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.productos(id) ON DELETE SET NULL', r.tbl, r.conname, r.col);
    ELSIF r.tbl = ANY(cascade_tables) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.productos(id) ON DELETE CASCADE', r.tbl, r.conname, r.col);
    ELSE
      -- default: SET NULL if nullable allowed, else CASCADE
      BEGIN
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP NOT NULL', r.tbl, r.col);
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.productos(id) ON DELETE SET NULL', r.tbl, r.conname, r.col);
      EXCEPTION WHEN OTHERS THEN
        EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.productos(id) ON DELETE CASCADE', r.tbl, r.conname, r.col);
      END;
    END IF;
  END LOOP;
END $$;
