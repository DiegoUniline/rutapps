-- RutApp · Quitar 17 índices duplicados (2026-10-20). Lo ejecuta el dueño (D-002).
-- Por cada par se borra uno SOLO si su definición es idéntica a la del que se queda
-- (mismo tipo, columnas, condición), no respalda una constraint y no pierde UNIQUE.
-- Si algo no cuadra, aborta sin borrar nada (todo o nada).
DO $$
DECLARE
  r record;
  v_drop text; v_keep text;
  pares text[][] := array[
    ['idx_venta_lineas_logistica_venta_producto','idx_venta_lineas_venta_producto'],
    ['idx_movimientos_inventario_empresa_created','idx_mov_inv_empresa_created_at'],
    ['idx_venta_lineas_empresa_venta_inteligencia','idx_venta_lineas_empresa_venta'],
    ['idx_cobro_aplicaciones_cobro','idx_cobro_aplicaciones_cobro_id'],
    ['idx_cobro_aplicaciones_venta','idx_cobro_aplicaciones_venta_id'],
    ['idx_entrega_lineas_logistica_entrega_id','idx_entrega_lineas_entrega_id'],
    ['idx_ventas_empresa_fecha_inteligencia','idx_ventas_empresa_fecha'],
    ['idx_clientes_portal_token','clientes_portal_token_key'],
    ['idx_entregas_logistica_empresa_fecha','idx_entregas_empresa_fecha'],
    ['idx_profiles_user_id','profiles_user_id_key'],
    ['idx_unsubscribe_tokens_token','email_unsubscribe_tokens_token_key'],
    ['idx_partners_user_id','partners_user_id_key'],
    ['idx_tienda_config_slug','tienda_config_slug_key'],
    ['idx_feature_flags_clave','feature_flags_clave_key'],
    ['idx_tienda_clientes_empresa_email','tienda_clientes_empresa_id_email_key'],
    ['idx_partners_ref_slug','partners_ref_slug_key'],
    ['idx_suppressed_emails_email','suppressed_emails_email_key']
  ];
  i int;
BEGIN
  IF to_regclass('public.stock_almacen') IS NULL THEN
    RAISE EXCEPTION 'Proyecto equivocado: esto no es rutapp';
  END IF;
  SET LOCAL lock_timeout = '5s';
  FOR i IN 1..array_length(pares,1) LOOP
    v_drop := pares[i][1]; v_keep := pares[i][2];
    SELECT d.oid AS d_oid, k.oid AS k_oid,
           regexp_replace(pg_get_indexdef(d.oid), '^CREATE (UNIQUE )?INDEX \S+ ', 'CREATE INDEX x ') AS d_def,
           regexp_replace(pg_get_indexdef(k.oid), '^CREATE (UNIQUE )?INDEX \S+ ', 'CREATE INDEX x ') AS k_def,
           x.indisunique AS d_unique, xk.indisunique AS k_unique
      INTO r
      FROM pg_class d
      JOIN pg_index x ON x.indexrelid = d.oid
      JOIN pg_namespace n ON n.oid = d.relnamespace AND n.nspname = 'public'
      JOIN pg_class k ON k.relname = v_keep AND k.relnamespace = n.oid
      JOIN pg_index xk ON xk.indexrelid = k.oid AND xk.indrelid = x.indrelid
     WHERE d.relname = v_drop;
    IF r.d_oid IS NULL THEN
      RAISE NOTICE 'ya no existe (o falta %): %, se omite', v_keep, v_drop;
      CONTINUE;
    END IF;
    IF r.d_def <> r.k_def THEN
      RAISE EXCEPTION 'No son idénticos, no se borra nada: % <> %', r.d_def, r.k_def;
    END IF;
    IF r.d_unique AND NOT r.k_unique THEN
      RAISE EXCEPTION '% es UNIQUE y % no; no se borra nada', v_drop, v_keep;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = r.d_oid) THEN
      RAISE EXCEPTION '% respalda una constraint, no se borra nada', v_drop;
    END IF;
    EXECUTE format('DROP INDEX public.%I', v_drop);
    RAISE NOTICE 'borrado % (se queda %)', v_drop, v_keep;
  END LOOP;
END $$;

-- Verificación: debe salir 0 filas
select t.relname tabla, array_agg(i.relname) indices
from pg_index x
join pg_class i on i.oid = x.indexrelid
join pg_class t on t.oid = x.indrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
group by t.relname, x.indkey::text, coalesce(x.indexprs::text,''), coalesce(x.indpred::text,'')
having count(*) > 1;
