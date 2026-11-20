-- Pago a proveedor en UNA transacción, con el saldo calculado en la BD.
-- Antes Saldos de proveedor y Aplicar pagos (proveedor) insertaban pago por pago y escribían a mano
-- compras.saldo_pendiente calculado en el navegador: si fallaba a la mitad quedaba medio aplicado y
-- dos personas pagando a la vez podían pisarse el saldo.
-- p_aplicaciones: [{ "compra_id": uuid, "monto": numeric }]

CREATE OR REPLACE FUNCTION public.aplicar_pago_proveedor(
  p_proveedor_id uuid,
  p_metodo text,
  p_referencia text,
  p_notas text,
  p_fecha date,
  p_aplicaciones jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   uuid := auth.uid();
  v_emp   uuid := public.get_my_empresa_id();
  a       jsonb;
  v_c     record;
  v_monto numeric;
  v_nuevo numeric;
  v_total numeric := 0;
  v_n     int := 0;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE = '42501';
  END IF;
  IF p_aplicaciones IS NULL OR jsonb_typeof(p_aplicaciones) <> 'array' OR jsonb_array_length(p_aplicaciones) = 0 THEN
    RAISE EXCEPTION 'Distribuye el monto a al menos una compra' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.proveedores WHERE id = p_proveedor_id AND empresa_id = v_emp) THEN
    RAISE EXCEPTION 'Proveedor no encontrado' USING ERRCODE = '42501';
  END IF;

  FOR a IN SELECT * FROM jsonb_array_elements(p_aplicaciones) LOOP
    v_monto := round(COALESCE((a->>'monto')::numeric, 0), 2);
    IF v_monto <= 0 THEN CONTINUE; END IF;
    SELECT id, folio, saldo_pendiente, proveedor_id, empresa_id INTO v_c
      FROM public.compras WHERE id = NULLIF(a->>'compra_id', '')::uuid FOR UPDATE;
    IF NOT FOUND OR v_c.empresa_id IS DISTINCT FROM v_emp OR v_c.proveedor_id IS DISTINCT FROM p_proveedor_id THEN
      RAISE EXCEPTION 'Compra no válida para este proveedor' USING ERRCODE = '22023';
    END IF;
    IF v_monto > COALESCE(v_c.saldo_pendiente, 0) + 0.01 THEN
      RAISE EXCEPTION 'El pago a % (%) excede su saldo (%)', COALESCE(v_c.folio, 'la compra'), v_monto, COALESCE(v_c.saldo_pendiente, 0)
        USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.pago_compras (empresa_id, compra_id, proveedor_id, user_id, monto, metodo_pago, referencia, notas, fecha)
    VALUES (v_emp, v_c.id, p_proveedor_id, v_uid, v_monto, COALESCE(p_metodo, 'efectivo'),
            NULLIF(btrim(COALESCE(p_referencia, '')), ''), NULLIF(btrim(COALESCE(p_notas, '')), ''), COALESCE(p_fecha, CURRENT_DATE));

    v_nuevo := GREATEST(0, round(COALESCE(v_c.saldo_pendiente, 0) - v_monto, 2));
    UPDATE public.compras
       SET saldo_pendiente = v_nuevo,
           status = CASE WHEN v_nuevo <= 0.01 THEN 'pagada' ELSE status END
     WHERE id = v_c.id;
    v_total := v_total + v_monto;
    v_n := v_n + 1;
  END LOOP;

  IF v_n = 0 THEN
    RAISE EXCEPTION 'El monto a distribuir debe ser mayor a 0' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('compras', v_n, 'total', v_total);
END;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_pago_proveedor(uuid, text, text, text, date, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_pago_proveedor(uuid, text, text, text, date, jsonb) TO authenticated;
