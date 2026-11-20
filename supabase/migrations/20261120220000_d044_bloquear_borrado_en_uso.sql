-- D-044 (segunda parte, aprobada por el dueño: «Sí, bloquear en la BD»).
-- Blindaje en BD: un DELETE de un maestro (producto, cliente, proveedor, almacén, lista de precios,
-- tarifa, vehículo, marca, categoría, unidad, lista, zona) que siga en uso en documentos/historial
-- se rechaza con un mensaje claro, aunque venga directo por API. No cambia FKs ni borra datos.
--
-- Excepciones para no romper la depuración de empresas completas:
--   * delete_empresa_cascade pone la bandera de transacción app.borrando_empresa = '1'.
--   * Si la empresa del registro ya no existe (borrado de `empresas` con cascada, p. ej. limpieza
--     de demos en la edge function demo-login), el borrado sigue.

-- 1) Conteo interno (sin auth.uid): lo usan la función pública y el trigger.
create or replace function public._usos_de_registros_ids(p_tabla text, p_ids uuid[])
returns table(registro_id uuid, tabla text, usos bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r record;
  v_extra text;
begin
  if p_tabla not in ('productos','clientes','proveedores','lista_precios','tarifas','almacenes',
                     'vehiculos','marcas','clasificaciones','unidades','listas','zonas') then
    raise exception 'Tabla no permitida: %', p_tabla using errcode = '22023';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 then
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
    using p_ids;
  end loop;
end;
$$;

revoke all on function public._usos_de_registros_ids(text, uuid[]) from public, anon, authenticated;

-- 2) La función pública (front) filtra a la empresa del usuario y delega el conteo.
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
  return query select u.registro_id, u.tabla, u.usos from public._usos_de_registros_ids(p_tabla, v_ids) u;
end;
$$;

revoke all on function public.usos_de_registros(text, uuid[]) from public, anon;
grant execute on function public.usos_de_registros(text, uuid[]) to authenticated;

-- 3) Trigger BEFORE DELETE.
create or replace function public.trg_bloquear_borrado_en_uso()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_detalle text;
begin
  if coalesce(current_setting('app.borrando_empresa', true), '') = '1' then
    return old;
  end if;
  -- Borrado de la empresa completa (cascada desde `empresas`): no se bloquea.
  if not exists (select 1 from public.empresas e where e.id = old.empresa_id) then
    return old;
  end if;

  select string_agg(u.usos || ' ' || replace(u.tabla, '_', ' '), ', ' order by u.usos desc)
    into v_detalle
  from public._usos_de_registros_ids(tg_table_name, array[old.id]) u
  where u.usos > 0;

  if v_detalle is not null then
    raise exception 'Está en uso (%); no se puede eliminar. Márcalo Inactivo en su lugar.', v_detalle
      using hint = 'D-044: los registros con historial se desactivan, no se borran.';
  end if;
  return old;
end;
$$;

revoke all on function public.trg_bloquear_borrado_en_uso() from public, anon, authenticated;

do $do$
declare
  t text;
begin
  foreach t in array array['productos','clientes','proveedores','lista_precios','tarifas','almacenes',
                           'vehiculos','marcas','clasificaciones','unidades','listas','zonas'] loop
    execute format('drop trigger if exists trg_bloquear_borrado_en_uso on public.%I', t);
    execute format('create trigger trg_bloquear_borrado_en_uso before delete on public.%I
                    for each row execute function public.trg_bloquear_borrado_en_uso()', t);
  end loop;
end
$do$;

-- 4) delete_empresa_cascade: mismo cuerpo, solo pone/quita la bandera app.borrando_empresa.
CREATE OR REPLACE FUNCTION public.delete_empresa_cascade(p_empresa_id uuid, p_deleted_by uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_owner_email text;
  v_owner_phone text;
  v_empresa_nombre text;
  v_user_ids uuid[];
BEGIN
  -- D-044: los triggers que bloquean borrar maestros en uso respetan esta bandera
  -- (solo vive en esta transacción) para poder depurar la empresa completa.
  PERFORM set_config('app.borrando_empresa', '1', true);

  -- Get empresa info
  SELECT nombre INTO v_empresa_nombre FROM empresas WHERE id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;

  -- Get all user_ids for this empresa
  SELECT array_agg(user_id) INTO v_user_ids FROM profiles WHERE empresa_id = p_empresa_id;

  -- Get owner info for blacklist
  SELECT u.email, u.phone INTO v_owner_email, v_owner_phone
  FROM auth.users u
  JOIN empresas e ON e.owner_user_id = u.id
  WHERE e.id = p_empresa_id;

  -- Add to blacklist
  IF v_owner_email IS NOT NULL THEN
    INSERT INTO trial_blacklist (email, telefono, empresa_nombre, bloqueado_por)
    VALUES (v_owner_email, v_owner_phone, v_empresa_nombre, p_deleted_by);
  END IF;

  -- Also blacklist all other users of this empresa
  INSERT INTO trial_blacklist (email, empresa_nombre, bloqueado_por)
  SELECT u.email, v_empresa_nombre, p_deleted_by
  FROM auth.users u
  JOIN profiles p ON p.user_id = u.id
  WHERE p.empresa_id = p_empresa_id
    AND u.id IS DISTINCT FROM (SELECT owner_user_id FROM empresas WHERE id = p_empresa_id)
    AND u.email IS NOT NULL;

  -- Delete all related data (order matters for FK constraints)
  DELETE FROM auditoria_escaneos WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = p_empresa_id);
  DELETE FROM auditoria_entradas WHERE auditoria_linea_id IN (SELECT id FROM auditoria_lineas WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = p_empresa_id));
  DELETE FROM auditoria_lineas WHERE auditoria_id IN (SELECT id FROM auditorias WHERE empresa_id = p_empresa_id);
  DELETE FROM auditorias WHERE empresa_id = p_empresa_id;

  DELETE FROM conteo_entradas WHERE conteo_linea_id IN (SELECT id FROM conteo_lineas WHERE conteo_id IN (SELECT id FROM conteos_fisicos WHERE empresa_id = p_empresa_id));
  DELETE FROM conteo_lineas WHERE conteo_id IN (SELECT id FROM conteos_fisicos WHERE empresa_id = p_empresa_id);
  DELETE FROM conteos_fisicos WHERE empresa_id = p_empresa_id;

  DELETE FROM cfdi_lineas WHERE cfdi_id IN (SELECT id FROM cfdis WHERE empresa_id = p_empresa_id);
  DELETE FROM cfdis WHERE empresa_id = p_empresa_id;

  DELETE FROM entrega_lineas WHERE entrega_id IN (SELECT id FROM entregas WHERE empresa_id = p_empresa_id);
  DELETE FROM entregas WHERE empresa_id = p_empresa_id;

  DELETE FROM descarga_ruta_lineas WHERE descarga_id IN (SELECT id FROM descarga_ruta WHERE empresa_id = p_empresa_id);
  DELETE FROM descarga_ruta WHERE empresa_id = p_empresa_id;

  DELETE FROM cobro_aplicaciones WHERE cobro_id IN (SELECT id FROM cobros WHERE empresa_id = p_empresa_id);
  DELETE FROM cobros WHERE empresa_id = p_empresa_id;

  DELETE FROM venta_lineas WHERE venta_id IN (SELECT id FROM ventas WHERE empresa_id = p_empresa_id);
  DELETE FROM carga_pedidos WHERE carga_id IN (SELECT id FROM cargas WHERE empresa_id = p_empresa_id);
  DELETE FROM ventas WHERE empresa_id = p_empresa_id;

  DELETE FROM devoluciones WHERE empresa_id = p_empresa_id;

  DELETE FROM carga_lineas WHERE carga_id IN (SELECT id FROM cargas WHERE empresa_id = p_empresa_id);
  DELETE FROM cargas WHERE empresa_id = p_empresa_id;

  DELETE FROM compra_lineas WHERE compra_id IN (SELECT id FROM compras WHERE empresa_id = p_empresa_id);
  DELETE FROM compras WHERE empresa_id = p_empresa_id;

  DELETE FROM traspaso_lineas WHERE traspaso_id IN (SELECT id FROM traspasos WHERE empresa_id = p_empresa_id);
  DELETE FROM traspasos WHERE empresa_id = p_empresa_id;

  DELETE FROM movimientos_inventario WHERE empresa_id = p_empresa_id;
  DELETE FROM stock_almacen WHERE empresa_id = p_empresa_id;
  DELETE FROM ajustes_inventario WHERE empresa_id = p_empresa_id;

  DELETE FROM cliente_pedido_sugerido WHERE cliente_id IN (SELECT id FROM clientes WHERE empresa_id = p_empresa_id);
  DELETE FROM visitas WHERE empresa_id = p_empresa_id;
  DELETE FROM clientes WHERE empresa_id = p_empresa_id;

  DELETE FROM producto_proveedores WHERE producto_id IN (SELECT id FROM productos WHERE empresa_id = p_empresa_id);
  DELETE FROM producto_precios WHERE producto_id IN (SELECT id FROM productos WHERE empresa_id = p_empresa_id);
  DELETE FROM productos WHERE empresa_id = p_empresa_id;

  DELETE FROM proveedores WHERE empresa_id = p_empresa_id;
  DELETE FROM clasificaciones WHERE empresa_id = p_empresa_id;
  DELETE FROM marcas WHERE empresa_id = p_empresa_id;
  DELETE FROM unidades WHERE empresa_id = p_empresa_id;
  DELETE FROM tasas_iva WHERE empresa_id = p_empresa_id;
  DELETE FROM tasas_ieps WHERE empresa_id = p_empresa_id;
  DELETE FROM tarifa_lineas WHERE tarifa_id IN (SELECT id FROM tarifas WHERE empresa_id = p_empresa_id);
  DELETE FROM tarifas WHERE empresa_id = p_empresa_id;
  DELETE FROM lista_precios WHERE empresa_id = p_empresa_id;
  DELETE FROM listas WHERE empresa_id = p_empresa_id;
  DELETE FROM zonas WHERE empresa_id = p_empresa_id;
  DELETE FROM cobradores WHERE empresa_id = p_empresa_id;
  DELETE FROM vendedores WHERE empresa_id = p_empresa_id;
  DELETE FROM almacenes WHERE empresa_id = p_empresa_id;
  DELETE FROM gastos WHERE empresa_id = p_empresa_id;
  DELETE FROM promociones WHERE empresa_id = p_empresa_id;

  DELETE FROM timbres_movimientos WHERE empresa_id = p_empresa_id;
  DELETE FROM timbres_saldo WHERE empresa_id = p_empresa_id;
  DELETE FROM facturas WHERE empresa_id = p_empresa_id;
  DELETE FROM emisor_fiscal WHERE empresa_id = p_empresa_id;

  DELETE FROM cancellation_requests WHERE empresa_id = p_empresa_id;
  DELETE FROM subscriptions WHERE empresa_id = p_empresa_id;

  DELETE FROM role_permisos WHERE role_id IN (SELECT id FROM roles WHERE empresa_id = p_empresa_id);
  DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE empresa_id = p_empresa_id);
  DELETE FROM roles WHERE empresa_id = p_empresa_id;

  -- Delete profiles
  DELETE FROM profiles WHERE empresa_id = p_empresa_id;

  -- Delete empresa
  DELETE FROM empresas WHERE id = p_empresa_id;

  -- Delete auth users (last, after all FK references are gone)
  IF v_user_ids IS NOT NULL THEN
    FOR i IN 1..array_length(v_user_ids, 1) LOOP
      -- Only delete if user has no other empresa profile
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = v_user_ids[i]) THEN
        DELETE FROM auth.users WHERE id = v_user_ids[i];
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('app.borrando_empresa', '', true);
END;
$$;
