-- D-065 · Verificar reenvío idempotente de cobro_aplicaciones SIN dejar nada (termina con RAISE).
-- Esperado tras la migración: «D-065 OK (3/3)». Antes de la migración el caso 1 falla (reproduce el bug).
DO $v$
DECLARE
  r public.cobro_aplicaciones%ROWTYPE; v_ok int := 0; v_log text := ''; v_n0 bigint; v_n1 bigint; v_msg text;
BEGIN
  PERFORM set_config('request.jwt.claims', '', true);
  -- Una aplicación vigente de una venta ya saldada (el caso de los reintentos).
  SELECT ca.* INTO r FROM public.cobro_aplicaciones ca
    JOIN public.ventas v ON v.id = ca.venta_id JOIN public.cobros c ON c.id = ca.cobro_id
   WHERE v.saldo_pendiente = 0 AND COALESCE(c.status,'activo') <> 'cancelado' AND ca.monto_aplicado > 0
     AND NOT public.cobro_tiene_rep_vigente(ca.cobro_id)
   ORDER BY ca.created_at DESC LIMIT 1;
  SELECT count(*) INTO v_n0 FROM public.cobro_aplicaciones;

  -- 1. Reenvío de la MISMA fila (upsert ignoreDuplicates del celular) → se ignora sin error.
  BEGIN
    INSERT INTO public.cobro_aplicaciones SELECT r.* ON CONFLICT (id) DO NOTHING;
    v_ok := v_ok + 1; v_log := v_log || '1 reenvío ignorado ✓ ';
  EXCEPTION WHEN check_violation THEN v_log := v_log || '1 reenvío ✗ (' || SQLERRM || ') ';
  END;

  -- 2. Aplicación NUEVA (otro id) por el mismo monto sobre la venta saldada → sigue rechazada.
  BEGIN
    INSERT INTO public.cobro_aplicaciones SELECT (jsonb_populate_record(r, jsonb_build_object('id', gen_random_uuid()))).*;
    v_msg := 'sin error';
  EXCEPTION WHEN check_violation THEN v_msg := 'rechazada';
  END;
  IF v_msg = 'rechazada' THEN v_ok := v_ok + 1; v_log := v_log || '2 pago nuevo excedido rechazado ✓ ';
  ELSE v_log := v_log || '2 pago nuevo ✗ (' || v_msg || ') '; END IF;

  -- 3. No cambió el número de aplicaciones.
  SELECT count(*) INTO v_n1 FROM public.cobro_aplicaciones;
  IF v_n1 = v_n0 THEN v_ok := v_ok + 1; v_log := v_log || '3 sin filas nuevas ✓ ';
  ELSE v_log := v_log || format('3 filas ✗ (%s→%s) ', v_n0, v_n1); END IF;

  RAISE EXCEPTION 'D-065 %/3: % — todo se deshizo', v_ok, v_log;
END
$v$;
