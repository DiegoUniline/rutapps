-- Eliminar empresa (dueño: «corrige lo de eliminar empresa»).
-- delete_empresa_cascade fallaba: borraba tablas que ya no existen (producto_precios, emisor_fiscal)
-- y no cubría tablas nuevas con FK NO ACTION a empresas (lista_precios, venta_historial, …), por lo
-- que tampoco funcionaban fn_admin_trial_crm_delete_candidate ni delete_empresas_bulk.
--
-- Ahora el borrado se arma desde el catálogo: todas las tablas de `public` con columna empresa_id
-- (más sus tablas hijas sin empresa_id), en pasadas hasta que no quede nada; el orden de FKs se
-- resuelve solo. No cambia FKs. Si al final queda algo, falla y no borra nada (una transacción).
--
-- Seguridad: la función se podía ejecutar por cualquier usuario autenticado sin validar nada.
-- Ahora solo super admin, service_role (procesos del servidor) o una sesión sin JWT (SQL directo).
--
-- Se conserva: bandera app.borrando_empresa (D-044), lista negra de correos (excepto empresas demo),
-- borrado de usuarios auth sin otra empresa y el registro admin_trial_crm_deletions (auditoría).

-- 1) Hijas sin empresa_id: se borran (recursivo) antes que su tabla padre.
create or replace function public._eliminar_empresa_dependientes(p_tabla text, p_cond text, p_nivel int)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_cond text;
begin
  if p_nivel > 6 then
    return;
  end if;
  for r in
    select hc.relname::text as hijo, ha.attname::text as col, pa.attname::text as refcol
    from pg_constraint c
    join pg_class hc on hc.oid = c.conrelid
    join pg_namespace hn on hn.oid = hc.relnamespace and hn.nspname = 'public'
    join pg_attribute ha on ha.attrelid = c.conrelid and ha.attnum = c.conkey[1]
    join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = format('public.%I', p_tabla)::regclass
      and c.conrelid <> c.confrelid
      and c.confdeltype in ('a', 'r', 'c')
      and not exists (select 1 from pg_attribute x
                      where x.attrelid = c.conrelid and x.attname = 'empresa_id' and not x.attisdropped)
  loop
    v_cond := format('%I IN (SELECT %I FROM public.%I WHERE %s)', r.col, r.refcol, p_tabla, p_cond);
    perform public._eliminar_empresa_dependientes(r.hijo, v_cond, p_nivel + 1);
    execute format('DELETE FROM public.%I WHERE %s', r.hijo, v_cond);
  end loop;
end;
$$;

revoke all on function public._eliminar_empresa_dependientes(text, text, int) from public, anon, authenticated;

-- 2) Candados de documentos: respetan la bandera app.borrando_empresa (solo al depurar una empresa).
CREATE OR REPLACE FUNCTION public.fn_bloquea_borrado_con_stock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc  uuid;
  v_prod uuid;
BEGIN
  -- Procesos del servidor (limpieza de cuentas) quedan exentos.
  IF COALESCE(auth.role(), '') = 'service_role' THEN RETURN OLD; END IF;
  -- Eliminación de la empresa completa (delete_empresa_cascade).
  IF COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN RETURN OLD; END IF;
  v_doc := (to_jsonb(OLD) ->> TG_ARGV[0])::uuid;
  IF TG_NARGS > 1 THEN v_prod := (to_jsonb(OLD) ->> TG_ARGV[1])::uuid; END IF;
  IF v_doc IS NOT NULL AND public.fn_doc_mueve_stock(v_doc, v_prod) THEN
    RAISE EXCEPTION 'No se puede borrar: ya movió inventario. Cancélalo en lugar de borrarlo.'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_cobro_aplicaciones_candado_rep()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Eliminación de la empresa completa (delete_empresa_cascade).
  IF TG_OP = 'DELETE' AND COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN RETURN OLD; END IF;
  IF (TG_OP <> 'INSERT' AND public.cobro_tiene_rep_vigente(OLD.cobro_id))
     OR (TG_OP <> 'DELETE' AND public.cobro_tiene_rep_vigente(NEW.cobro_id)) THEN
    RAISE EXCEPTION 'Este cobro tiene complemento de pago (REP) timbrado; cancela primero el complemento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_cobros_candado_rep()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Eliminación de la empresa completa (delete_empresa_cascade).
  IF TG_OP = 'DELETE' AND COALESCE(current_setting('app.borrando_empresa', true), '') = '1' THEN RETURN OLD; END IF;
  IF public.cobro_tiene_rep_vigente(OLD.id) AND (
       TG_OP = 'DELETE'
       OR NEW.monto IS DISTINCT FROM OLD.monto
       OR NEW.fecha IS DISTINCT FROM OLD.fecha
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.cliente_id IS DISTINCT FROM OLD.cliente_id
       OR NEW.metodo_pago IS DISTINCT FROM OLD.metodo_pago) THEN
    RAISE EXCEPTION 'Este cobro tiene complemento de pago (REP) timbrado; cancela primero el complemento.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 3) delete_empresa_cascade robusto.
CREATE OR REPLACE FUNCTION public.delete_empresa_cascade(p_empresa_id uuid, p_deleted_by uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_owner_email text;
  v_owner_phone text;
  v_empresa_nombre text;
  v_es_demo boolean;
  v_user_ids uuid[];
  v_tablas text[];
  t text;
  v_n bigint;
  v_hay boolean;
  v_pase int := 0;
  v_borro boolean;
  v_quedan text;
  v_ultimo_error text;
BEGIN
  -- Solo super admin, procesos del servidor (service_role) o SQL directo sin JWT.
  IF NOT (COALESCE(auth.role(), '') IN ('', 'service_role') OR public.is_super_admin(auth.uid())) THEN
    RAISE EXCEPTION 'Acceso denegado: se requieren permisos de super administrador' USING ERRCODE = '42501';
  END IF;

  -- D-044: los triggers que bloquean borrar maestros/documentos en uso respetan esta bandera
  -- (solo vive en esta transacción) para poder depurar la empresa completa.
  PERFORM set_config('app.borrando_empresa', '1', true);

  SELECT nombre, (demo_expires_at IS NOT NULL) INTO v_empresa_nombre, v_es_demo FROM empresas WHERE id = p_empresa_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Empresa no encontrada'; END IF;

  SELECT array_agg(user_id) INTO v_user_ids FROM profiles WHERE empresa_id = p_empresa_id AND user_id IS NOT NULL;

  -- Lista negra para que no vuelvan a abrir un trial (no aplica a empresas demo temporales).
  IF NOT COALESCE(v_es_demo, false) THEN
    SELECT u.email, u.phone INTO v_owner_email, v_owner_phone
    FROM auth.users u
    JOIN empresas e ON e.owner_user_id = u.id
    WHERE e.id = p_empresa_id;

    IF v_owner_email IS NOT NULL THEN
      INSERT INTO trial_blacklist (email, telefono, empresa_nombre, bloqueado_por)
      VALUES (v_owner_email, v_owner_phone, v_empresa_nombre, p_deleted_by);
    END IF;

    INSERT INTO trial_blacklist (email, empresa_nombre, bloqueado_por)
    SELECT u.email, v_empresa_nombre, p_deleted_by
    FROM auth.users u
    JOIN profiles p ON p.user_id = u.id
    WHERE p.empresa_id = p_empresa_id
      AND u.id IS DISTINCT FROM (SELECT owner_user_id FROM empresas WHERE id = p_empresa_id)
      AND u.email IS NOT NULL;
  END IF;

  -- Todas las tablas con empresa_id, salvo la auditoría de eliminaciones (debe sobrevivir).
  SELECT array_agg(c.relname::text ORDER BY c.relname) INTO v_tablas
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'empresa_id' AND NOT a.attisdropped
  WHERE c.relkind IN ('r', 'p')
    AND NOT c.relispartition
    AND c.relname NOT IN ('empresas', 'admin_trial_crm_deletions');

  -- Pasadas: lo que falla por FK se reintenta cuando sus dependientes ya no están.
  LOOP
    v_pase := v_pase + 1;
    v_borro := false;
    FOREACH t IN ARRAY v_tablas LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE empresa_id = $1)', t) INTO v_hay USING p_empresa_id;
      CONTINUE WHEN NOT v_hay;
      BEGIN
        PERFORM public._eliminar_empresa_dependientes(t, format('empresa_id = %L', p_empresa_id), 0);
        EXECUTE format('DELETE FROM public.%I WHERE empresa_id = $1', t) USING p_empresa_id;
        GET DIAGNOSTICS v_n = ROW_COUNT;
        IF v_n > 0 THEN v_borro := true; END IF;
      EXCEPTION WHEN foreign_key_violation OR restrict_violation THEN
        v_ultimo_error := SQLERRM;
      END;
    END LOOP;

    v_quedan := NULL;
    FOREACH t IN ARRAY v_tablas LOOP
      EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE empresa_id = $1)', t) INTO v_hay USING p_empresa_id;
      IF v_hay THEN v_quedan := concat_ws(', ', v_quedan, t); END IF;
    END LOOP;
    EXIT WHEN v_quedan IS NULL;
    IF NOT v_borro OR v_pase >= 20 THEN
      RAISE EXCEPTION 'No se pudo eliminar la empresa: quedan datos en % (%)', v_quedan, COALESCE(v_ultimo_error, 'sin detalle');
    END IF;
  END LOOP;

  PERFORM public._eliminar_empresa_dependientes('empresas', format('id = %L', p_empresa_id), 0);
  DELETE FROM empresas WHERE id = p_empresa_id;

  -- Usuarios auth sin otra empresa (al final, ya sin referencias). Si alguno sigue referenciado
  -- fuera de la empresa, se conserva el usuario en lugar de abortar la eliminación.
  IF v_user_ids IS NOT NULL THEN
    FOR i IN 1..array_length(v_user_ids, 1) LOOP
      IF NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = v_user_ids[i]) THEN
        BEGIN
          DELETE FROM auth.users WHERE id = v_user_ids[i];
        EXCEPTION WHEN foreign_key_violation THEN
          RAISE NOTICE 'Usuario % conservado: %', v_user_ids[i], SQLERRM;
        END;
      END IF;
    END LOOP;
  END IF;

  PERFORM set_config('app.borrando_empresa', '', true);
END;
$$;
