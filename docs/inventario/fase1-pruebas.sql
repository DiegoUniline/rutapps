-- Casos de prueba de la Fase 1 (entregas, borrados, devoluciones, saldo, cierre parcial).
-- Se corrieron en Postgres 16 local con las funciones exportadas de producción
-- (2026-10-20): antes reproducen cada falla, después dan el valor esperado.
-- Ver supabase/migrations/20261020210000_inventario_fase1.sql
SET client_min_messages = notice;
CREATE OR REPLACE FUNCTION pg_temp.stk(a uuid, p uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT COALESCE((SELECT cantidad FROM stock_almacen WHERE almacen_id=a AND producto_id=p),0) $$;
CREATE OR REPLACE FUNCTION pg_temp.lot(a uuid, l uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT COALESCE((SELECT cantidad FROM stock_lotes WHERE almacen_id=a AND lote_id=l),0) $$;

DO $t$
DECLARE
  E uuid := gen_random_uuid(); B uuid := gen_random_uuid(); C uuid := gen_random_uuid();
  V uuid := gen_random_uuid(); P uuid := gen_random_uuid(); PL uuid := gen_random_uuid(); L1 uuid := gen_random_uuid();
  PED uuid; EN uuid; LN uuid; msg text;
BEGIN
  INSERT INTO empresas(id, nombre) VALUES (E, 'E');
  INSERT INTO almacenes(id, empresa_id, nombre) VALUES (B, E, 'Bodega'), (C, E, 'Camion');
  INSERT INTO profiles(id, user_id, empresa_id, almacen_id, nombre) VALUES (V, gen_random_uuid(), E, C, 'Vend');
  INSERT INTO productos(id, empresa_id, nombre, maneja_lote) VALUES (P, E, 'P', false), (PL, E, 'PL', true);
  INSERT INTO lotes(id, empresa_id, producto_id, codigo) VALUES (L1, E, PL, 'L1');
  INSERT INTO stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (E,B,P,100),(E,B,PL,50);
  INSERT INTO stock_lotes(empresa_id, almacen_id, producto_id, lote_id, cantidad) VALUES (E,B,PL,L1,50);
  INSERT INTO ventas(id, empresa_id, tipo, status, condicion_pago, total) VALUES (gen_random_uuid(), E, 'pedido', 'confirmado', 'credito', 100) RETURNING id INTO PED;

  -- ===== S1 Reabrir después de entregada (hecho → borrador)
  INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id) VALUES (gen_random_uuid(), E, PED, 'borrador', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida) VALUES (gen_random_uuid(), EN, P, 10) RETURNING id INTO LN;
  PERFORM surtir_linea_entrega(LN, P, B, 10, EN, E, V);
  UPDATE entregas SET status='surtido' WHERE id=EN;
  UPDATE entregas SET status='asignado' WHERE id=EN;
  UPDATE entregas SET status='cargado' WHERE id=EN;
  UPDATE entregas SET status='hecho' WHERE id=EN;
  RAISE NOTICE 'S1 entregada: bodega=% camion=% (esperado 90/0)', pg_temp.stk(B,P), pg_temp.stk(C,P);
  UPDATE entregas SET status='borrador' WHERE id=EN;
  UPDATE entrega_lineas SET hecho=false, cantidad_entregada=0 WHERE entrega_id=EN;
  RAISE NOTICE 'S1 reabrir: bodega=% camion=% (esperado 100/0)', pg_temp.stk(B,P), pg_temp.stk(C,P);

  -- reset
  UPDATE stock_almacen SET cantidad=100 WHERE almacen_id=B AND producto_id=P; UPDATE stock_almacen SET cantidad=0 WHERE almacen_id=C AND producto_id=P;

  -- ===== S1b Cancelar después de entregada (hecho → cancelado): queda en camión
  INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id) VALUES (gen_random_uuid(), E, PED, 'borrador', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida) VALUES (gen_random_uuid(), EN, P, 10) RETURNING id INTO LN;
  PERFORM surtir_linea_entrega(LN, P, B, 10, EN, E, V);
  UPDATE entregas SET status='asignado' WHERE id=EN; UPDATE entregas SET status='cargado' WHERE id=EN; UPDATE entregas SET status='hecho' WHERE id=EN;
  UPDATE entregas SET status='cancelado' WHERE id=EN;
  RAISE NOTICE 'S1b cancelar entregada: bodega=% camion=% (esperado 90/10)', pg_temp.stk(B,P), pg_temp.stk(C,P);

  -- ===== S3 Borrar entrega que movió stock
  BEGIN
    DELETE FROM entrega_lineas WHERE entrega_id=EN; DELETE FROM entregas WHERE id=EN;
    RAISE NOTICE 'S3 borrar entrega con stock: SE BORRÓ (esperado bloqueado)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'S3 borrar entrega con stock: bloqueado → %', SQLERRM;
  END;

  UPDATE stock_almacen SET cantidad=100 WHERE almacen_id=B AND producto_id=P; UPDATE stock_almacen SET cantidad=0 WHERE almacen_id=C AND producto_id=P;

  -- ===== S2 Cancelar en surtido
  INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id) VALUES (gen_random_uuid(), E, PED, 'borrador', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida) VALUES (gen_random_uuid(), EN, P, 10) RETURNING id INTO LN;
  PERFORM surtir_linea_entrega(LN, P, B, 10, EN, E, V);
  UPDATE entregas SET status='surtido' WHERE id=EN;
  UPDATE entregas SET status='cancelado' WHERE id=EN;
  RAISE NOTICE 'S2 cancelar surtida: bodega=% (esperado 100)', pg_temp.stk(B,P);
  BEGIN
    DELETE FROM entrega_lineas WHERE entrega_id=EN; DELETE FROM entregas WHERE id=EN;
    RAISE NOTICE 'S3b borrar entrega ya revertida: se borró (esperado permitido)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'S3b borrar entrega ya revertida: bloqueado → %', SQLERRM;
  END;

  -- ===== S4 Lotes: reprogramar entrega cargada (asignado → surtido)
  INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id) VALUES (gen_random_uuid(), E, PED, 'borrador', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id, lote_id)
    VALUES (gen_random_uuid(), EN, PL, 5, 5, true, B, L1) RETURNING id INTO LN;
  UPDATE stock_almacen SET cantidad=cantidad-5 WHERE almacen_id=B AND producto_id=PL;
  INSERT INTO movimientos_inventario(empresa_id,tipo,producto_id,cantidad,almacen_origen_id,lote_id,referencia_tipo,referencia_id,fecha,notas)
    VALUES (E,'salida',PL,5,B,L1,'entrega',EN,current_date,'Surtido de entrega');
  UPDATE entregas SET status='surtido' WHERE id=EN;
  UPDATE entregas SET status='asignado' WHERE id=EN;
  RAISE NOTICE 'S4 cargada: bodega=%/lote % camion=%/lote % (esperado 45/45 5/5)', pg_temp.stk(B,PL), pg_temp.lot(B,L1), pg_temp.stk(C,PL), pg_temp.lot(C,L1);
  BEGIN
    UPDATE entregas SET status='surtido' WHERE id=EN;
    RAISE NOTICE 'S4 reprogramar: bodega=%/lote % camion=%/lote % (esperado 45/45 0/0)', pg_temp.stk(B,PL), pg_temp.lot(B,L1), pg_temp.stk(C,PL), pg_temp.lot(C,L1);
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'S4 reprogramar: ERROR → %', SQLERRM;
  END;

  -- ===== S5 Devolución con producto repetido
  DECLARE D uuid := gen_random_uuid(); L_a uuid := gen_random_uuid(); L_b uuid := gen_random_uuid();
  BEGIN
    UPDATE stock_almacen SET cantidad=100 WHERE almacen_id=B AND producto_id=P;
    INSERT INTO devoluciones(id, empresa_id, user_id, almacen_destino_id) VALUES (D, E, V, B);
    INSERT INTO devolucion_lineas(id, devolucion_id, producto_id, cantidad, motivo) VALUES (L_a, D, P, 3, 'otro');
    INSERT INTO devolucion_lineas(id, devolucion_id, producto_id, cantidad, motivo) VALUES (L_b, D, P, 2, 'otro');
    RAISE NOTICE 'S5 devolución 3+2: bodega=% (esperado 105)', pg_temp.stk(B,P);
    DELETE FROM devolucion_lineas WHERE id=L_b;
    RAISE NOTICE 'S5 borrar renglón de 2: bodega=% (esperado 103)', pg_temp.stk(B,P);
  END;

  -- ===== S6 Saldo
  DECLARE VV uuid := gen_random_uuid(); CB uuid := gen_random_uuid(); s numeric;
  BEGIN
    INSERT INTO ventas(id, empresa_id, tipo, status, condicion_pago, total, saldo_pendiente) VALUES (VV, E, 'venta_directa', 'confirmado', 'credito', 100, 100);
    INSERT INTO cobros(id, empresa_id, monto, status) VALUES (CB, E, 100, 'activo');
    INSERT INTO cobro_aplicaciones(cobro_id, venta_id, monto_aplicado) VALUES (CB, VV, 100);
    UPDATE ventas SET total = 80 WHERE id=VV;
    SELECT saldo_pendiente INTO s FROM ventas WHERE id=VV;
    RAISE NOTICE 'S6 bajar total abajo de lo pagado: saldo=% (esperado 0, nunca negativo)', s;
  END;
END
$t$;
SET client_min_messages = notice;
CREATE OR REPLACE FUNCTION pg_temp.stk(a uuid, p uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT COALESCE((SELECT cantidad FROM stock_almacen WHERE almacen_id=a AND producto_id=p),0) $$;
CREATE OR REPLACE FUNCTION pg_temp.lot(a uuid, l uuid) RETURNS numeric LANGUAGE sql AS $$ SELECT COALESCE((SELECT cantidad FROM stock_lotes WHERE almacen_id=a AND lote_id=l),0) $$;
DO $t$
DECLARE
  E uuid := gen_random_uuid(); B uuid := gen_random_uuid(); C uuid := gen_random_uuid();
  V uuid := gen_random_uuid(); P uuid := gen_random_uuid(); PL uuid := gen_random_uuid(); L1 uuid := gen_random_uuid();
  PA uuid := gen_random_uuid(); PB uuid := gen_random_uuid(); EN uuid; LN uuid; x numeric; s numeric;
  CO uuid := gen_random_uuid(); CL uuid := gen_random_uuid();
BEGIN
  INSERT INTO empresas(id, nombre) VALUES (E, 'E');
  INSERT INTO almacenes(id, empresa_id, nombre) VALUES (B, E, 'Bodega'), (C, E, 'Camion');
  INSERT INTO profiles(id, user_id, empresa_id, almacen_id, nombre) VALUES (V, gen_random_uuid(), E, C, 'Vend');
  INSERT INTO productos(id, empresa_id, nombre, maneja_lote) VALUES (P, E, 'P', false), (PL, E, 'PL', true);
  INSERT INTO lotes(id, empresa_id, producto_id, codigo) VALUES (L1, E, PL, 'L1');
  INSERT INTO stock_almacen(empresa_id, almacen_id, producto_id, cantidad) VALUES (E,B,P,100),(E,B,PL,50);
  INSERT INTO stock_lotes(empresa_id, almacen_id, producto_id, lote_id, cantidad) VALUES (E,B,PL,L1,50);

  -- S7/S8 Pedido A (10 pzas, cobro por lo entregado) entrega 7; pedido B del mismo producto entrega 20
  INSERT INTO ventas(id, empresa_id, tipo, status, condicion_pago, politica_cobro, total, subtotal, saldo_pendiente)
    VALUES (PA, E, 'pedido', 'confirmado', 'credito', 'entregado', 100, 100, 100),
           (PB, E, 'pedido', 'confirmado', 'credito', 'entregado', 300, 300, 300);
  INSERT INTO venta_lineas(venta_id, producto_id, cantidad, subtotal, total) VALUES (PA, P, 10, 100, 100), (PB, P, 30, 300, 300);
  INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id) VALUES (gen_random_uuid(), E, PA, 'surtido', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho) VALUES (EN, P, 10, 7, true);
  INSERT INTO entregas(id, empresa_id, pedido_id, status, vendedor_id) VALUES (gen_random_uuid(), E, PB, 'surtido', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho) VALUES (EN, P, 30, 20, true);
  PERFORM fn_recalc_venta_saldo(PA);
  SELECT saldo_pendiente INTO s FROM ventas WHERE id=PA;
  RAISE NOTICE 'S8 saldo pedido A por entregado: % (esperado 70)', s;
  UPDATE ventas SET total = 100.00 + 0 , subtotal = 100 WHERE id=PA; -- toca total (dispara trigger)
  UPDATE ventas SET total = 90 WHERE id=PA; UPDATE ventas SET total = 100 WHERE id=PA;
  SELECT saldo_pendiente INTO s FROM ventas WHERE id=PA;
  RAISE NOTICE 'S8 saldo tras cambiar total: % (esperado 70, antes 100)', s;
  PERFORM cerrar_pedido_parcial(PA, V);
  SELECT cantidad INTO x FROM venta_lineas WHERE venta_id=PA;
  SELECT saldo_pendiente INTO s FROM ventas WHERE id=PA;
  RAISE NOTICE 'S7 cerrar parcial A: cantidad=% saldo=% (esperado 7 / 70)', x, s;

  -- S9 Compra: renglón recibido no se borra; con reversa sí
  INSERT INTO compras(id, empresa_id, almacen_id) VALUES (CO, E, B);
  INSERT INTO compra_lineas(id, compra_id, producto_id, cantidad) VALUES (CL, CO, P, 5);
  INSERT INTO movimientos_inventario(empresa_id,tipo,producto_id,cantidad,almacen_destino_id,referencia_tipo,referencia_id,fecha,notas)
    VALUES (E,'entrada',P,5,B,'compra',CO,current_date,'Compra');
  BEGIN DELETE FROM compra_lineas WHERE id=CL; RAISE NOTICE 'S9 borrar renglón recibido: SE BORRÓ (esperado bloqueado)';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'S9 borrar renglón recibido: bloqueado'; END;
  INSERT INTO movimientos_inventario(empresa_id,tipo,producto_id,cantidad,almacen_origen_id,referencia_tipo,referencia_id,fecha,notas)
    VALUES (E,'salida',P,5,B,'compra',CO,current_date,'Edición: renglón eliminado');
  BEGIN DELETE FROM compra_lineas WHERE id=CL; RAISE NOTICE 'S9 borrar renglón ya revertido (edición de compra): permitido';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'S9 borrar renglón ya revertido: BLOQUEADO (esperado permitido)'; END;

  -- S10 Servidor (service_role) exento
  INSERT INTO movimientos_inventario(empresa_id,tipo,producto_id,cantidad,almacen_destino_id,referencia_tipo,referencia_id,fecha,notas)
    VALUES (E,'entrada',P,5,B,'compra',CO,current_date,'Compra 2');
  PERFORM set_config('request.jwt.claim.role','service_role', true);
  BEGIN DELETE FROM compras WHERE id=CO; RAISE NOTICE 'S10 service_role borra: permitido';
  EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'S10 service_role borra: BLOQUEADO (esperado permitido)'; END;
  PERFORM set_config('request.jwt.claim.role','', true);

  -- S11 Reabrir entrega con lote (hecho → borrador)
  INSERT INTO entregas(id, empresa_id, status, vendedor_id) VALUES (gen_random_uuid(), E, 'borrador', V) RETURNING id INTO EN;
  INSERT INTO entrega_lineas(id, entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id, lote_id)
    VALUES (gen_random_uuid(), EN, PL, 5, 5, true, B, L1);
  UPDATE stock_almacen SET cantidad=cantidad-5 WHERE almacen_id=B AND producto_id=PL;
  INSERT INTO movimientos_inventario(empresa_id,tipo,producto_id,cantidad,almacen_origen_id,lote_id,referencia_tipo,referencia_id,fecha,notas)
    VALUES (E,'salida',PL,5,B,L1,'entrega',EN,current_date,'Surtido de entrega');
  UPDATE entregas SET status='surtido' WHERE id=EN; UPDATE entregas SET status='asignado' WHERE id=EN;
  UPDATE entregas SET status='cargado' WHERE id=EN; UPDATE entregas SET status='hecho' WHERE id=EN;
  RAISE NOTICE 'S11 entregada lote: bodega=%/lote % camion=%/lote % (esperado 45/45 0/0)', pg_temp.stk(B,PL), pg_temp.lot(B,L1), pg_temp.stk(C,PL), pg_temp.lot(C,L1);
  UPDATE entregas SET status='borrador' WHERE id=EN;
  RAISE NOTICE 'S11 reabrir lote: bodega=%/lote % camion=%/lote % (esperado 50/50 0/0)', pg_temp.stk(B,PL), pg_temp.lot(B,L1), pg_temp.stk(C,PL), pg_temp.lot(C,L1);
END
$t$;
