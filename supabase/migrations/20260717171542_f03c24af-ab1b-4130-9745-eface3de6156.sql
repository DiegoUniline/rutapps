
-- 1) Evitar doble movimiento en venta_directa/entrega_inmediata cuando el producto maneja lote.
--    apply_immediate_sale_inventory sigue deduciendo stock_almacen, pero omite el insert
--    de movimientos_inventario si el producto maneja lote (lo hace aplicar_lote_venta_inmediata).
CREATE OR REPLACE FUNCTION public.apply_immediate_sale_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_venta public.ventas%rowtype; v_stock_id uuid; v_stock_actual numeric := 0;
  v_new_qty numeric; v_vender_sin_stock boolean; v_prod_name text;
  v_almacen_id uuid; v_sin_stock boolean; v_maneja_lote boolean;
begin
  select * into v_venta from public.ventas where id = new.venta_id;
  if v_venta.id is null then return new; end if;
  if v_venta.tipo = 'saldo_inicial' then return new; end if;
  if v_venta.tipo <> 'venta_directa' or coalesce(v_venta.entrega_inmediata, false) is not true then return new; end if;
  select nombre, vender_sin_stock, coalesce(maneja_lote,false)
    into v_prod_name, v_vender_sin_stock, v_maneja_lote
    from productos where id = new.producto_id;
  v_almacen_id := coalesce(v_venta.almacen_id, (select almacen_id from public.profiles where id = v_venta.vendedor_id limit 1));
  if v_almacen_id is null then
    raise exception 'No se puede registrar la venta % sin almacén asignado.', coalesce(v_venta.folio, v_venta.id::text);
  end if;
  select id, cantidad into v_stock_id, v_stock_actual from public.stock_almacen
    where almacen_id = v_almacen_id and producto_id = new.producto_id for update;
  v_new_qty := coalesce(v_stock_actual, 0) - coalesce(new.cantidad, 0);
  v_sin_stock := (not coalesce(v_vender_sin_stock, false)) and v_new_qty < 0;
  if v_stock_id is not null then
    update public.stock_almacen set cantidad = v_new_qty, updated_at = now() where id = v_stock_id;
  else
    insert into public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
    values (v_venta.empresa_id, v_almacen_id, new.producto_id, v_new_qty);
  end if;

  -- Si el producto maneja lote, el movimiento (con lote_id) lo inserta aplicar_lote_venta_inmediata.
  -- Evita duplicar el asiento en el kardex.
  if v_maneja_lote then
    return new;
  end if;

  insert into public.movimientos_inventario
    (id, empresa_id, tipo, producto_id, cantidad, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, created_at, notas, lote_id)
  values
    (gen_random_uuid(), v_venta.empresa_id, 'salida', new.producto_id, new.cantidad,
     v_almacen_id, 'venta', v_venta.id, coalesce(v_venta.vendedor_id, v_venta.cliente_id),
     coalesce(v_venta.fecha, current_date), now(),
     concat('Venta POS ', coalesce(v_venta.folio, v_venta.id::text),
            case when v_sin_stock then ' · SIN STOCK SUFICIENTE (revisar)' else '' end),
     new.lote_id);
  return new;
end; $function$;

-- 2) Al borrar una venta, revertir stock y limpiar movimientos de inventario asociados.
CREATE OR REPLACE FUNCTION public.cleanup_venta_inventory_on_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  m RECORD;
  v_stock_id uuid; v_stock_actual numeric;
BEGIN
  -- Recorre todos los movimientos ligados a la venta (venta, venta_lote, cancelacion_venta, reverso_borrador)
  -- y revierte su efecto en stock_almacen y stock_lotes, luego los elimina.
  FOR m IN
    SELECT * FROM public.movimientos_inventario
    WHERE referencia_id = OLD.id
      AND referencia_tipo IN ('venta','venta_lote','cancelacion_venta','reverso_borrador')
  LOOP
    -- Revertir stock_almacen
    IF m.almacen_origen_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_stock_id, v_stock_actual
        FROM public.stock_almacen
        WHERE almacen_id = m.almacen_origen_id AND producto_id = m.producto_id
        FOR UPDATE;
      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen
           SET cantidad = COALESCE(v_stock_actual,0) + COALESCE(m.cantidad,0), updated_at = now()
         WHERE id = v_stock_id;
      END IF;
    END IF;
    IF m.almacen_destino_id IS NOT NULL THEN
      SELECT id, cantidad INTO v_stock_id, v_stock_actual
        FROM public.stock_almacen
        WHERE almacen_id = m.almacen_destino_id AND producto_id = m.producto_id
        FOR UPDATE;
      IF v_stock_id IS NOT NULL THEN
        UPDATE public.stock_almacen
           SET cantidad = COALESCE(v_stock_actual,0) - COALESCE(m.cantidad,0), updated_at = now()
         WHERE id = v_stock_id;
      END IF;
    END IF;
    -- Revertir stock_lotes
    IF m.lote_id IS NOT NULL THEN
      IF m.almacen_origen_id IS NOT NULL THEN
        PERFORM public._aplica_stock_lote(m.empresa_id, m.almacen_origen_id, m.producto_id, m.lote_id, COALESCE(m.cantidad,0));
      END IF;
      IF m.almacen_destino_id IS NOT NULL THEN
        PERFORM public._aplica_stock_lote(m.empresa_id, m.almacen_destino_id, m.producto_id, m.lote_id, -COALESCE(m.cantidad,0));
      END IF;
    END IF;
  END LOOP;

  DELETE FROM public.movimientos_inventario
   WHERE referencia_id = OLD.id
     AND referencia_tipo IN ('venta','venta_lote','cancelacion_venta','reverso_borrador');

  -- Limpia stock apartado ligado a la venta si existe
  DELETE FROM public.stock_apartado WHERE venta_id = OLD.id;

  RETURN OLD;
END; $function$;

DROP TRIGGER IF EXISTS trg_cleanup_venta_inventory_on_delete ON public.ventas;
CREATE TRIGGER trg_cleanup_venta_inventory_on_delete
BEFORE DELETE ON public.ventas
FOR EACH ROW EXECUTE FUNCTION public.cleanup_venta_inventory_on_delete();
