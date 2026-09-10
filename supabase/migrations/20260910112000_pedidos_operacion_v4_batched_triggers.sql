-- Refina los triggers del resumen operacional para que una inserción/actualización
-- masiva refresque cada pedido afectado una sola vez por sentencia.

DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_venta_linea ON public.venta_lineas;
DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_entrega ON public.entregas;
DROP TRIGGER IF EXISTS trg_logistica_pedido_resumen_entrega_linea ON public.entrega_lineas;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_vl_insert_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT venta_id FROM new_rows WHERE venta_id IS NOT NULL LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.venta_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_vl_update_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT venta_id FROM new_rows WHERE venta_id IS NOT NULL
    UNION
    SELECT venta_id FROM old_rows WHERE venta_id IS NOT NULL
  LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.venta_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_vl_delete_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT venta_id FROM old_rows WHERE venta_id IS NOT NULL LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.venta_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_logistica_pedido_resumen_vl_insert
AFTER INSERT ON public.venta_lineas
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_vl_insert_stmt();

CREATE TRIGGER trg_logistica_pedido_resumen_vl_update
AFTER UPDATE ON public.venta_lineas
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_vl_update_stmt();

CREATE TRIGGER trg_logistica_pedido_resumen_vl_delete
AFTER DELETE ON public.venta_lineas
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_vl_delete_stmt();


CREATE OR REPLACE FUNCTION public.trg_log_resumen_entrega_insert_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT pedido_id FROM new_rows WHERE pedido_id IS NOT NULL LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.pedido_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_entrega_update_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pedido_id FROM new_rows WHERE pedido_id IS NOT NULL
    UNION
    SELECT pedido_id FROM old_rows WHERE pedido_id IS NOT NULL
  LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.pedido_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_entrega_delete_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT pedido_id FROM old_rows WHERE pedido_id IS NOT NULL LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.pedido_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_logistica_pedido_resumen_entrega_insert
AFTER INSERT ON public.entregas
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_entrega_insert_stmt();

CREATE TRIGGER trg_logistica_pedido_resumen_entrega_update
AFTER UPDATE ON public.entregas
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_entrega_update_stmt();

CREATE TRIGGER trg_logistica_pedido_resumen_entrega_delete
AFTER DELETE ON public.entregas
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_entrega_delete_stmt();


CREATE OR REPLACE FUNCTION public.trg_log_resumen_el_insert_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.pedido_id
    FROM public.entregas e
    INNER JOIN (SELECT DISTINCT entrega_id FROM new_rows WHERE entrega_id IS NOT NULL) x ON x.entrega_id = e.id
    WHERE e.pedido_id IS NOT NULL
  LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.pedido_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_el_update_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.pedido_id
    FROM public.entregas e
    INNER JOIN (
      SELECT entrega_id FROM new_rows WHERE entrega_id IS NOT NULL
      UNION
      SELECT entrega_id FROM old_rows WHERE entrega_id IS NOT NULL
    ) x ON x.entrega_id = e.id
    WHERE e.pedido_id IS NOT NULL
  LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.pedido_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_log_resumen_el_delete_stmt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT e.pedido_id
    FROM public.entregas e
    INNER JOIN (SELECT DISTINCT entrega_id FROM old_rows WHERE entrega_id IS NOT NULL) x ON x.entrega_id = e.id
    WHERE e.pedido_id IS NOT NULL
  LOOP
    PERFORM public.fn_refresh_logistica_pedido_resumen(r.pedido_id);
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_logistica_pedido_resumen_el_insert
AFTER INSERT ON public.entrega_lineas
REFERENCING NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_el_insert_stmt();

CREATE TRIGGER trg_logistica_pedido_resumen_el_update
AFTER UPDATE ON public.entrega_lineas
REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_el_update_stmt();

CREATE TRIGGER trg_logistica_pedido_resumen_el_delete
AFTER DELETE ON public.entrega_lineas
REFERENCING OLD TABLE AS old_rows
FOR EACH STATEMENT
EXECUTE FUNCTION public.trg_log_resumen_el_delete_stmt();

REVOKE ALL ON FUNCTION public.trg_log_resumen_vl_insert_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_vl_update_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_vl_delete_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_entrega_insert_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_entrega_update_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_entrega_delete_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_el_insert_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_el_update_stmt() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_log_resumen_el_delete_stmt() FROM PUBLIC, anon, authenticated;
