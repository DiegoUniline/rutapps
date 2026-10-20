-- Casos de prueba de ajustar_entrega (Fase 3a). Postgres 16 local con funciones de producción.
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET client_min_messages = warning;
SELECT set_config('t.E', gen_random_uuid()::text, false), set_config('t.B', gen_random_uuid()::text, false),
       set_config('t.C', gen_random_uuid()::text, false), set_config('t.P1', gen_random_uuid()::text, false),
       set_config('t.P2', gen_random_uuid()::text, false), set_config('t.O', gen_random_uuid()::text, false),
       set_config('t.VP', gen_random_uuid()::text, false), set_config('t.PED', gen_random_uuid()::text, false),
       set_config('t.EN', gen_random_uuid()::text, false), set_config('t.LN', gen_random_uuid()::text, false) \gset
CREATE OR REPLACE FUNCTION pg_temp.g(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.'||k)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.stk(a text, p text) RETURNS numeric LANGUAGE sql VOLATILE AS $$ SELECT COALESCE((SELECT cantidad FROM stock_almacen WHERE almacen_id=pg_temp.g(a) AND producto_id=pg_temp.g(p)),0)::numeric(12,2) $$;
CREATE OR REPLACE FUNCTION pg_temp.estado() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT format('bodega P1=%s P2=%s | camión P1=%s P2=%s | pedido %s total=%s saldo=%s', pg_temp.stk('B','P1'), pg_temp.stk('B','P2'), pg_temp.stk('C','P1'), pg_temp.stk('C','P2'),
    (SELECT string_agg((SELECT nombre FROM productos WHERE id=producto_id)||'x'||cantidad::numeric(10,0), ',' ORDER BY producto_id) FROM venta_lineas WHERE venta_id=pg_temp.g('PED')),
    (SELECT total FROM ventas WHERE id=pg_temp.g('PED')), (SELECT saldo_pendiente FROM ventas WHERE id=pg_temp.g('PED'))) $$;
CREATE OR REPLACE FUNCTION pg_temp.aj(lineas jsonb, destino text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM ajustar_entrega(pg_temp.g('EN'), lineas, destino, (SELECT updated_at FROM entregas WHERE id=pg_temp.g('EN'))); RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'ERROR: '||SQLERRM; END $$;
SELECT set_config('request.jwt.claim.sub', current_setting('t.O'), false), set_config('request.jwt.claim.role','authenticated', false) \gset

INSERT INTO empresas(id, nombre, owner_user_id) VALUES (pg_temp.g('E'), 'E', pg_temp.g('O'));
INSERT INTO almacenes(id, empresa_id, nombre) VALUES (pg_temp.g('B'), pg_temp.g('E'), 'Bodega'), (pg_temp.g('C'), pg_temp.g('E'), 'Camion');
INSERT INTO profiles(id, user_id, empresa_id, almacen_id, nombre) VALUES (pg_temp.g('VP'), gen_random_uuid(), pg_temp.g('E'), pg_temp.g('C'), 'Repartidor'),
  (gen_random_uuid(), pg_temp.g('O'), pg_temp.g('E'), NULL, 'Dueño');
INSERT INTO productos(id, empresa_id, nombre, maneja_lote) VALUES (pg_temp.g('P1'), pg_temp.g('E'), 'P1', false), (pg_temp.g('P2'), pg_temp.g('E'), 'P2', false);
INSERT INTO stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('P1'),100),(pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('P2'),50),
  (pg_temp.g('E'),pg_temp.g('C'),pg_temp.g('P2'),20);
INSERT INTO ventas(id, empresa_id, tipo, status, condicion_pago, politica_cobro, almacen_id, total) VALUES (pg_temp.g('PED'), pg_temp.g('E'), 'pedido', 'confirmado', 'credito', 'pedido', pg_temp.g('B'), 100);
INSERT INTO venta_lineas(venta_id, producto_id, cantidad, precio_unitario, subtotal, total, iva_monto, ieps_monto) VALUES (pg_temp.g('PED'), pg_temp.g('P1'), 10, 10, 100, 100, 0, 0);
INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id, almacen_id) VALUES (pg_temp.g('EN'), pg_temp.g('E'), pg_temp.g('PED'), 'borrador', pg_temp.g('VP'), pg_temp.g('B'));
INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida) VALUES (pg_temp.g('LN'), pg_temp.g('EN'), pg_temp.g('P1'), 10);
SELECT surtir_linea_entrega(pg_temp.g('LN'), pg_temp.g('P1'), pg_temp.g('B'), 10, pg_temp.g('EN'), pg_temp.g('E'), pg_temp.g('O')) \gset
UPDATE entregas SET status='surtido' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='asignado' WHERE id=pg_temp.g('EN');
UPDATE entregas SET status='cargado' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='hecho' WHERE id=pg_temp.g('EN');
SELECT 'A0 entregada 10: '||pg_temp.estado()||'   (esperado bodega P1=90, camión P1=0, pedido P1x10 total 100)';
SELECT 'A1 ajustar 10→8 al camión: '||pg_temp.aj(jsonb_build_array(jsonb_build_object('id', pg_temp.g('LN'), 'producto_id', pg_temp.g('P1'), 'cantidad_entregada', 8)), 'camion')||' → '||pg_temp.estado()||'   (esperado camión P1=2, pedido P1x8 total 80)';
SELECT 'A2 ajustar 8→10: '||pg_temp.aj(jsonb_build_array(jsonb_build_object('id', pg_temp.g('LN'), 'producto_id', pg_temp.g('P1'), 'cantidad_entregada', 10)), 'camion')||' → '||pg_temp.estado()||'   (esperado camión P1=0, pedido P1x10 total 100)';
SELECT 'A3 producto equivocado P1→P2 (10), sobrante a bodega: '||pg_temp.aj(jsonb_build_array(jsonb_build_object('id', pg_temp.g('LN'), 'producto_id', pg_temp.g('P2'), 'cantidad_entregada', 10,
   'venta_linea', jsonb_build_object('precio_unitario', 20, 'subtotal', 200, 'total', 200, 'iva_monto', 0, 'ieps_monto', 0, 'iva_pct', 0, 'ieps_pct', 0, 'descripcion', 'P2'))), 'bodega')
   ||' → '||pg_temp.estado()||'   (esperado bodega P1=100, camión P1=0 P2=10, pedido P2x10 total 200)';
SELECT 'A4 reabrir después del ajuste: '||(SELECT 'ok' FROM (SELECT 1) x WHERE (SELECT count(*) FROM entregas WHERE id=pg_temp.g('EN'))=1) \gset
UPDATE entregas SET status='borrador' WHERE id=pg_temp.g('EN');
SELECT 'A4 reabrir después del ajuste: '||pg_temp.estado()||'   (esperado bodega P1=100 P2=50, camión P1=0 P2=20: todo como antes de la entrega)';
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET client_min_messages = warning;
SELECT set_config('t.E', gen_random_uuid()::text, false), set_config('t.B', gen_random_uuid()::text, false),
       set_config('t.C', gen_random_uuid()::text, false), set_config('t.PL', gen_random_uuid()::text, false),
       set_config('t.L1', gen_random_uuid()::text, false), set_config('t.O', gen_random_uuid()::text, false),
       set_config('t.U', gen_random_uuid()::text, false), set_config('t.R', gen_random_uuid()::text, false),
       set_config('t.VP', gen_random_uuid()::text, false), set_config('t.PED', gen_random_uuid()::text, false),
       set_config('t.EN', gen_random_uuid()::text, false), set_config('t.LN', gen_random_uuid()::text, false),
       set_config('t.EN2', gen_random_uuid()::text, false) \gset
CREATE OR REPLACE FUNCTION pg_temp.g(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.'||k)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.stk(a text, p text) RETURNS numeric LANGUAGE sql VOLATILE AS $$ SELECT COALESCE((SELECT cantidad FROM stock_almacen WHERE almacen_id=pg_temp.g(a) AND producto_id=pg_temp.g(p)),0)::numeric(12,2) $$;
CREATE OR REPLACE FUNCTION pg_temp.lot(a text) RETURNS numeric LANGUAGE sql VOLATILE AS $$ SELECT COALESCE((SELECT cantidad FROM stock_lotes WHERE almacen_id=pg_temp.g(a) AND lote_id=pg_temp.g('L1')),0)::numeric(12,2) $$;
CREATE OR REPLACE FUNCTION pg_temp.est() RETURNS text LANGUAGE sql VOLATILE AS $$ SELECT format('bodega %s/lote %s | camión %s/lote %s', pg_temp.stk('B','PL'), pg_temp.lot('B'), pg_temp.stk('C','PL'), pg_temp.lot('C')) $$;
CREATE OR REPLACE FUNCTION pg_temp.aj(en text, qty numeric, destino text, ver timestamptz DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM ajustar_entrega(pg_temp.g(en), jsonb_build_array(jsonb_build_object('id', (SELECT id FROM entrega_lineas WHERE entrega_id=pg_temp.g(en) LIMIT 1), 'producto_id', pg_temp.g('PL'), 'cantidad_entregada', qty)), destino,
  COALESCE(ver, (SELECT updated_at FROM entregas WHERE id=pg_temp.g(en)))); RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'ERROR: '||SQLERRM; END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(k text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', current_setting('t.'||k), false), set_config('request.jwt.claim.role','authenticated', false) $$;
SELECT pg_temp.as_user('O') \gset

INSERT INTO empresas(id, nombre, owner_user_id) VALUES (pg_temp.g('E'), 'E', pg_temp.g('O'));
INSERT INTO almacenes(id, empresa_id, nombre) VALUES (pg_temp.g('B'), pg_temp.g('E'), 'Bodega'), (pg_temp.g('C'), pg_temp.g('E'), 'Camion');
INSERT INTO profiles(id, user_id, empresa_id, almacen_id, nombre) VALUES (pg_temp.g('VP'), gen_random_uuid(), pg_temp.g('E'), pg_temp.g('C'), 'Repartidor'),
  (gen_random_uuid(), pg_temp.g('O'), pg_temp.g('E'), NULL, 'Dueño'), (gen_random_uuid(), pg_temp.g('U'), pg_temp.g('E'), NULL, 'SinPermiso');
INSERT INTO user_roles(user_id, role_id) VALUES (pg_temp.g('U'), pg_temp.g('R'));
INSERT INTO role_permisos(role_id, modulo, accion, permitido) VALUES (pg_temp.g('R'),'ruta.editar_entrega','ver',false);
INSERT INTO productos(id, empresa_id, nombre, maneja_lote) VALUES (pg_temp.g('PL'), pg_temp.g('E'), 'PL', true);
INSERT INTO lotes(id, empresa_id, producto_id, codigo) VALUES (pg_temp.g('L1'), pg_temp.g('E'), pg_temp.g('PL'), 'L1');
INSERT INTO stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('PL'),50);
INSERT INTO stock_lotes(empresa_id, almacen_id, producto_id, lote_id, cantidad) VALUES (pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('PL'),pg_temp.g('L1'),50);
INSERT INTO ventas(id, empresa_id, tipo, status, condicion_pago, politica_cobro, almacen_id, total) VALUES (pg_temp.g('PED'), pg_temp.g('E'), 'pedido', 'confirmado', 'credito', 'pedido', pg_temp.g('B'), 50);
INSERT INTO venta_lineas(venta_id, producto_id, cantidad, precio_unitario, subtotal, total, iva_monto, ieps_monto) VALUES (pg_temp.g('PED'), pg_temp.g('PL'), 10, 5, 50, 50, 0, 0);

-- B: con lote, surtido con lote → cargado → entregado → ajustar 10→6 a bodega
INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id, almacen_id) VALUES (pg_temp.g('EN'), pg_temp.g('E'), pg_temp.g('PED'), 'borrador', pg_temp.g('VP'), pg_temp.g('B'));
INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id, lote_id) VALUES (pg_temp.g('LN'), pg_temp.g('EN'), pg_temp.g('PL'), 10, 10, true, pg_temp.g('B'), pg_temp.g('L1'));
UPDATE stock_almacen SET cantidad = cantidad - 10 WHERE almacen_id=pg_temp.g('B') AND producto_id=pg_temp.g('PL');
INSERT INTO movimientos_inventario(empresa_id,tipo,producto_id,cantidad,almacen_origen_id,lote_id,referencia_tipo,referencia_id,fecha,notas)
  VALUES (pg_temp.g('E'),'salida',pg_temp.g('PL'),10,pg_temp.g('B'),pg_temp.g('L1'),'entrega',pg_temp.g('EN'),current_date,'Surtido de entrega');
UPDATE entregas SET status='surtido' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='asignado' WHERE id=pg_temp.g('EN');
UPDATE entregas SET status='cargado' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='hecho' WHERE id=pg_temp.g('EN');
SELECT 'B0 entregada con lote: '||pg_temp.est()||'   (esperado bodega 40/40, camión 0/0)';
SELECT 'B1 ajustar 10→6 a bodega: '||pg_temp.aj('EN', 6, 'bodega')||' → '||pg_temp.est()||'   (esperado bodega 44/44, camión 0/0)';
SELECT 'B2 ajustar 6→5 al camión: '||pg_temp.aj('EN', 5, 'camion')||' → '||pg_temp.est()||'   (esperado bodega 44/44, camión 1/1)';
UPDATE entregas SET status='borrador' WHERE id=pg_temp.g('EN');
SELECT 'B3 reabrir: '||pg_temp.est()||'   (esperado bodega 50/50, camión 0/0)';

-- C: bloqueos
SELECT 'C1 no entregada: '||pg_temp.aj('EN', 3, 'camion');
UPDATE entregas SET status='surtido' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='asignado' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='cargado' WHERE id=pg_temp.g('EN'); UPDATE entregas SET status='hecho' WHERE id=pg_temp.g('EN');
SELECT 'C2 versión vieja: '||pg_temp.aj('EN', 3, 'camion', now() - interval '1 day');
SELECT pg_temp.as_user('U') \gset
SELECT 'C3 sin permiso: '||pg_temp.aj('EN', 3, 'camion');
SELECT pg_temp.as_user('O') \gset
UPDATE venta_lineas SET facturado = true WHERE venta_id=pg_temp.g('PED');
SELECT 'C4 pedido facturado: '||pg_temp.aj('EN', 3, 'camion');
