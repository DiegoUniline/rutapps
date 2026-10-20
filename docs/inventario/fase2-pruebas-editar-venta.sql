-- Casos de prueba de editar_venta (Fase 2). Postgres 16 local con funciones de producción
-- (venta_lineas/ventas/comisiones/lotes con md5 igual a producción). Ver 20261021120000_editar_venta.sql
\set QUIET on
\pset tuples_only on
\pset format unaligned
SET client_min_messages = notice;
-- datos
SELECT set_config('t.E', gen_random_uuid()::text, false), set_config('t.B', gen_random_uuid()::text, false),
       set_config('t.P1', gen_random_uuid()::text, false), set_config('t.P2', gen_random_uuid()::text, false),
       set_config('t.PL', gen_random_uuid()::text, false), set_config('t.L1', gen_random_uuid()::text, false),
       set_config('t.O', gen_random_uuid()::text, false), set_config('t.U1', gen_random_uuid()::text, false),
       set_config('t.U2', gen_random_uuid()::text, false), set_config('t.V', gen_random_uuid()::text, false),
       set_config('t.R1', gen_random_uuid()::text, false), set_config('t.R2', gen_random_uuid()::text, false),
       set_config('t.X', gen_random_uuid()::text, false) \gset
CREATE OR REPLACE FUNCTION pg_temp.g(k text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('t.'||k)::uuid $$;
CREATE OR REPLACE FUNCTION pg_temp.stk(p text) RETURNS numeric LANGUAGE sql AS $$ SELECT COALESCE((SELECT cantidad FROM stock_almacen WHERE almacen_id=pg_temp.g('B') AND producto_id=pg_temp.g(p)),0) $$;
CREATE OR REPLACE FUNCTION pg_temp.as_user(k text) RETURNS void LANGUAGE sql AS $$ SELECT set_config('request.jwt.claim.sub', current_setting('t.'||k), false), set_config('request.jwt.claim.role','authenticated', false) $$;
CREATE OR REPLACE FUNCTION pg_temp.ver() RETURNS timestamptz LANGUAGE sql AS $$ SELECT updated_at FROM ventas WHERE id=pg_temp.g('V') $$;
CREATE OR REPLACE FUNCTION pg_temp.lid(p text) RETURNS uuid LANGUAGE sql AS $$ SELECT id FROM venta_lineas WHERE venta_id=pg_temp.g('V') AND producto_id=pg_temp.g(p) LIMIT 1 $$;
CREATE OR REPLACE FUNCTION pg_temp.linea(p text, cant numeric, precio numeric, id uuid DEFAULT NULL) RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object('id', id, 'producto_id', pg_temp.g(p), 'cantidad', cant, 'precio_unitario', precio,
         'subtotal', cant*precio, 'iva_pct', 0, 'ieps_pct', 0, 'iva_monto', 0, 'ieps_monto', 0, 'total', cant*precio, 'descuento_pct', 0)) $$;
CREATE OR REPLACE FUNCTION pg_temp.edit(lineas jsonb, ver timestamptz DEFAULT NULL) RETURNS text LANGUAGE plpgsql AS $$
BEGIN PERFORM editar_venta(pg_temp.g('V'), lineas, COALESCE(ver, pg_temp.ver())); RETURN 'ok';
EXCEPTION WHEN OTHERS THEN RETURN 'ERROR: '||SQLERRM; END $$;
CREATE OR REPLACE FUNCTION pg_temp.lote() RETURNS numeric LANGUAGE sql VOLATILE AS $$ SELECT cantidad FROM stock_lotes WHERE lote_id=pg_temp.g('L1') $$;
CREATE OR REPLACE FUNCTION pg_temp.com() RETURNS text LANGUAGE sql VOLATILE AS $$ SELECT COALESCE((SELECT comision_monto||'/pagada='||pagada FROM venta_comisiones WHERE venta_linea_id=pg_temp.lid('PL')),'sin comisión') $$;
CREATE OR REPLACE FUNCTION pg_temp.estado() RETURNS text LANGUAGE sql AS $$
  SELECT format('P1=%s P2=%s PL=%s | total=%s saldo=%s | renglones=%s', pg_temp.stk('P1'), pg_temp.stk('P2'), pg_temp.stk('PL'),
     (SELECT total FROM ventas WHERE id=pg_temp.g('V')), (SELECT saldo_pendiente FROM ventas WHERE id=pg_temp.g('V')),
     (SELECT string_agg((SELECT nombre FROM productos WHERE id=producto_id)||'x'||cantidad, ',' ORDER BY producto_id) FROM venta_lineas WHERE venta_id=pg_temp.g('V'))) $$;

INSERT INTO empresas(id, nombre, owner_user_id) VALUES (pg_temp.g('E'), 'E', pg_temp.g('O'));
INSERT INTO almacenes(id, empresa_id, nombre) VALUES (pg_temp.g('B'), pg_temp.g('E'), 'Bodega');
INSERT INTO profiles(id, user_id, empresa_id, nombre) VALUES (gen_random_uuid(), pg_temp.g('O'), pg_temp.g('E'), 'Dueño'),
  (gen_random_uuid(), pg_temp.g('U1'), pg_temp.g('E'), 'SinPermiso'), (gen_random_uuid(), pg_temp.g('U2'), pg_temp.g('E'), 'ConPermiso'),
  (gen_random_uuid(), pg_temp.g('X'), gen_random_uuid(), 'OtraEmpresa');
INSERT INTO user_roles(user_id, role_id) VALUES (pg_temp.g('U1'), pg_temp.g('R1')), (pg_temp.g('U2'), pg_temp.g('R2'));
INSERT INTO role_permisos(role_id, modulo, accion, permitido) VALUES (pg_temp.g('R1'),'ventas','ver',true), (pg_temp.g('R2'),'ventas','editar',true);
INSERT INTO productos(id, empresa_id, nombre, maneja_lote) VALUES (pg_temp.g('P1'), pg_temp.g('E'), 'P1', false), (pg_temp.g('P2'), pg_temp.g('E'), 'P2', false), (pg_temp.g('PL'), pg_temp.g('E'), 'PL', true);
INSERT INTO lotes(id, empresa_id, producto_id, codigo) VALUES (pg_temp.g('L1'), pg_temp.g('E'), pg_temp.g('PL'), 'L1');
INSERT INTO stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('P1'),100),(pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('P2'),50),(pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('PL'),20);
INSERT INTO stock_lotes(empresa_id, almacen_id, producto_id, lote_id, cantidad) VALUES (pg_temp.g('E'),pg_temp.g('B'),pg_temp.g('PL'),pg_temp.g('L1'),20);
INSERT INTO ventas(id, empresa_id, tipo, status, condicion_pago, almacen_id, entrega_inmediata, vendedor_id, total)
  VALUES (pg_temp.g('V'), pg_temp.g('E'), 'venta_directa', 'borrador', 'credito', pg_temp.g('B'), true, pg_temp.g('U2'), 0);
INSERT INTO venta_lineas(venta_id, producto_id, cantidad, precio_unitario, subtotal, total, iva_monto, ieps_monto) VALUES (pg_temp.g('V'), pg_temp.g('P1'), 10, 10, 100, 100, 0, 0);
UPDATE ventas SET status='confirmado' WHERE id=pg_temp.g('V');
SELECT 'T0 venta confirmada: '||pg_temp.estado()||'   (esperado P1=90 total=100)';

SELECT pg_temp.as_user('U2');
SELECT 'T1 agregar P2x5: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P1',10,10,pg_temp.lid('P1')), pg_temp.linea('P2',5,20)))||' → '||pg_temp.estado()||'   (esperado P1=90 P2=45 total=200)';
SELECT 'T2 P1 10→7: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P1',7,10,pg_temp.lid('P1')), pg_temp.linea('P2',5,20,pg_temp.lid('P2'))))||' → '||pg_temp.estado()||'   (esperado P1=93 total=170)';
SELECT 'T3 quitar P2: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P1',7,10,pg_temp.lid('P1'))))||' → '||pg_temp.estado()||'   (esperado P2=50 total=70)';
SELECT 'T4 cambiar P1 por P2 en el renglón: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',7,10,pg_temp.lid('P1'))))||' → '||pg_temp.estado()||'   (esperado P1=100 P2=43)';
SELECT 'T5 lote: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',7,10,pg_temp.lid('P2')), pg_temp.linea('PL',3,5) || jsonb_build_object('lotes', jsonb_build_array(jsonb_build_object('lote_id', pg_temp.g('L1'), 'cantidad', 3)))))
  ||' → '||pg_temp.estado()||' loteL1='||pg_temp.lote()||'   (esperado PL=17 loteL1=17)';
SELECT 'T6 versión vieja: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',1,10,pg_temp.lid('P2'))), now() - interval '1 day')||' → '||pg_temp.estado();
SELECT pg_temp.as_user('U1');
SELECT 'T7 sin permiso: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',1,10,pg_temp.lid('P2'))))||' → '||pg_temp.estado();
SELECT pg_temp.as_user('X');
SELECT 'T11 otra empresa: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',1,10,pg_temp.lid('P2'))));
SELECT pg_temp.as_user('O');
UPDATE venta_comisiones SET pagada = true WHERE venta_linea_id = pg_temp.lid('PL');
SELECT 'T9 quitar renglón con comisión pagada: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',7,10,pg_temp.lid('P2'))))||' → '||pg_temp.estado()||'   (esperado ERROR)';
SELECT 'T9b comisión pagada intacta al cambiar cantidad: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',7,10,pg_temp.lid('P2')), pg_temp.linea('PL',4,5,pg_temp.lid('PL'))))
  ||' comisión='||pg_temp.com()||' → '||pg_temp.estado()||' loteL1='||pg_temp.lote()||'   (esperado comisión 1.50/true, PL=16 loteL1=16)';
INSERT INTO cobros(id, empresa_id, monto, status) VALUES (pg_temp.g('R1'), pg_temp.g('E'), 80, 'activo');
INSERT INTO cobro_aplicaciones(cobro_id, venta_id, monto_aplicado) VALUES (pg_temp.g('R1'), pg_temp.g('V'), 80);
SELECT pg_temp.as_user('O');
SELECT 'T8 bajar total abajo de lo pagado (80): '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',2,10,pg_temp.lid('P2'))))||' → '||pg_temp.estado()||'   (esperado ERROR y nada cambia: P2=43 PL=17)';
SELECT 'T8b total abajo de lo pagado conservando el renglón con comisión: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',1,10,pg_temp.lid('P2')), pg_temp.linea('PL',4,5,pg_temp.lid('PL'))))||' → '||pg_temp.estado()||'   (esperado ERROR de pago; P2=43 sin cambio)';
SELECT 'T12 reparto que no cuadra: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',7,10,pg_temp.lid('P2')), pg_temp.linea('PL',4,5,pg_temp.lid('PL')) || jsonb_build_object('lotes', jsonb_build_array(jsonb_build_object('lote_id', pg_temp.g('L1'), 'cantidad', 2)))))||'   (esperado ERROR)';
UPDATE ventas SET status='facturado' WHERE id=pg_temp.g('V');
SELECT 'T10 facturada: '||pg_temp.edit(jsonb_build_array(pg_temp.linea('P2',7,10,pg_temp.lid('P2'))));
