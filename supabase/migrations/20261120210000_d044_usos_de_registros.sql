-- D-044: antes de borrar físicamente un maestro (producto, cliente, proveedor, lista de precios…)
-- el front pregunta si está en uso. Solo LECTURA: cuenta referencias por FK en las tablas que
-- lo usan (documentos e historial). No cambia FKs ni borra nada.
--
-- No cuentan como «uso» los hijos que son configuración propia del maestro (se borran con él):
-- precios por lista, presentaciones, equivalencias, config por almacén, proveedores del producto
-- (cuando se borra el producto), orden de ruta / pedido sugerido del cliente, renglones de tarifa.
-- Existencias solo cuentan si la cantidad es distinta de 0.

create or replace function public.usos_de_registros(p_tabla text, p_ids uuid[])
returns table(registro_id uuid, tabla text, usos bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_empresa uuid := public.get_my_empresa_id();
  v_ids uuid[];
  r record;
  v_extra text;
begin
  if p_tabla not in ('productos','clientes','proveedores','lista_precios','tarifas','almacenes',
                     'vehiculos','marcas','clasificaciones','unidades','listas','zonas') then
    raise exception 'Tabla no permitida: %', p_tabla using errcode = '22023';
  end if;
  if v_empresa is null or p_ids is null or cardinality(p_ids) = 0 then
    return;
  end if;

  -- Solo registros de la empresa del usuario (multiempresa).
  execute format('select coalesce(array_agg(id), ''{}''::uuid[]) from public.%I where id = any($1) and empresa_id = $2', p_tabla)
    into v_ids using p_ids, v_empresa;
  if cardinality(v_ids) = 0 then
    return;
  end if;

  for r in
    select c.conrelid::regclass::text as hijo, a.attname::text as col
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = format('public.%I', p_tabla)::regclass
      and c.conrelid <> c.confrelid
      and not (p_tabla, c.conrelid::regclass::text) in (
        ('productos','lista_precios_lineas'), ('productos','producto_almacen_config'),
        ('productos','producto_equivalencias'), ('productos','producto_presentaciones'),
        ('productos','producto_proveedores'), ('productos','cliente_pedido_sugerido'),
        ('clientes','cliente_orden_ruta'), ('clientes','cliente_pedido_sugerido'),
        ('lista_precios','lista_precios_lineas'),
        ('tarifas','tarifa_lineas'), ('tarifas','lista_precios'),
        ('almacenes','producto_almacen_config')
      )
  loop
    v_extra := case r.hijo
      when 'stock_almacen' then ' and cantidad <> 0'
      when 'stock_camion' then ' and cantidad_actual <> 0'
      else '' end;
    return query execute format(
      'select %1$I, %2$L::text, count(*)::bigint from public.%3$I where %1$I = any($1)%4$s group by 1',
      r.col, r.hijo, r.hijo, v_extra)
    using v_ids;
  end loop;
end;
$$;

revoke all on function public.usos_de_registros(text, uuid[]) from public, anon;
grant execute on function public.usos_de_registros(text, uuid[]) to authenticated;

comment on function public.usos_de_registros(text, uuid[]) is
  'D-044: cuántas referencias (documentos/historial) tiene cada maestro de la empresa actual antes de borrarlo físicamente.';
