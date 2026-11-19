-- 1. Trigger to recalc when cobros.status changes (cancellation/reactivation)
CREATE OR REPLACE FUNCTION public.recalc_ventas_on_cobro_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  UPDATE public.ventas v
  SET saldo_pendiente = GREATEST(0, COALESCE(v.total,0) - COALESCE((
    SELECT SUM(ca2.monto_aplicado)
    FROM public.cobro_aplicaciones ca2
    JOIN public.cobros c2 ON c2.id = ca2.cobro_id
    WHERE ca2.venta_id = v.id AND c2.status <> 'cancelado'
  ), 0))
  WHERE v.id IN (
    SELECT venta_id FROM public.cobro_aplicaciones
    WHERE cobro_id = COALESCE(NEW.id, OLD.id)
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_cobros_status_recalc ON public.cobros;
CREATE TRIGGER trg_cobros_status_recalc
AFTER UPDATE OR DELETE ON public.cobros
FOR EACH ROW EXECUTE FUNCTION public.recalc_ventas_on_cobro_status();

-- 2. Reconciliation functions
CREATE OR REPLACE FUNCTION public.reconciliar_saldos_cliente(p_cliente_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  WITH agg AS (
    SELECT v.id,
      GREATEST(0, COALESCE(v.total,0) - COALESCE(SUM(ca.monto_aplicado) FILTER (WHERE c.status <> 'cancelado'), 0)) AS nuevo
    FROM public.ventas v
    LEFT JOIN public.cobro_aplicaciones ca ON ca.venta_id = v.id
    LEFT JOIN public.cobros c ON c.id = ca.cobro_id
    WHERE v.cliente_id = p_cliente_id AND v.status <> 'cancelado'
    GROUP BY v.id
  )
  UPDATE public.ventas v SET saldo_pendiente = a.nuevo
  FROM agg a
  WHERE a.id = v.id AND v.saldo_pendiente IS DISTINCT FROM a.nuevo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION public.reconciliar_saldos_empresa(p_empresa_id uuid)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE n int;
BEGIN
  WITH agg AS (
    SELECT v.id,
      GREATEST(0, COALESCE(v.total,0) - COALESCE(SUM(ca.monto_aplicado) FILTER (WHERE c.status <> 'cancelado'), 0)) AS nuevo
    FROM public.ventas v
    LEFT JOIN public.cobro_aplicaciones ca ON ca.venta_id = v.id
    LEFT JOIN public.cobros c ON c.id = ca.cobro_id
    WHERE v.empresa_id = p_empresa_id AND v.status <> 'cancelado'
    GROUP BY v.id
  )
  UPDATE public.ventas v SET saldo_pendiente = a.nuevo
  FROM agg a
  WHERE a.id = v.id AND v.saldo_pendiente IS DISTINCT FROM a.nuevo;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

-- 3. RPC to apply a cobro atomically (cobro + N aplicaciones in one transaction)
CREATE OR REPLACE FUNCTION public.aplicar_cobro(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text,
  p_fecha date,
  p_aplicaciones jsonb,
  p_notas text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cobro_id uuid;
  v_app jsonb;
  v_total_app numeric := 0;
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto del cobro debe ser mayor a 0';
  END IF;

  -- Validate sum of applications <= cobro amount (with 0.01 tolerance)
  FOR v_app IN SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb)) LOOP
    v_total_app := v_total_app + COALESCE((v_app->>'monto_aplicado')::numeric, 0);
  END LOOP;

  IF v_total_app > p_monto + 0.01 THEN
    RAISE EXCEPTION 'Suma de aplicaciones (%) excede monto del cobro (%)', v_total_app, p_monto;
  END IF;

  INSERT INTO public.cobros (empresa_id, cliente_id, user_id, monto, metodo_pago, referencia, fecha, notas, status)
  VALUES (p_empresa_id, p_cliente_id, COALESCE(p_user_id, auth.uid()), p_monto, p_metodo, p_referencia, p_fecha, p_notas, 'activo')
  RETURNING id INTO v_cobro_id;

  FOR v_app IN SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb)) LOOP
    IF COALESCE((v_app->>'monto_aplicado')::numeric, 0) > 0 THEN
      INSERT INTO public.cobro_aplicaciones (cobro_id, venta_id, monto_aplicado)
      VALUES (v_cobro_id, (v_app->>'venta_id')::uuid, (v_app->>'monto_aplicado')::numeric);
    END IF;
  END LOOP;

  RETURN v_cobro_id;
END $$;

-- 4. Reconcile ALL companies right now
DO $$
DECLARE r record; total int := 0; per int;
BEGIN
  FOR r IN SELECT id FROM public.empresas LOOP
    per := public.reconciliar_saldos_empresa(r.id);
    total := total + per;
  END LOOP;
  RAISE NOTICE 'Reconciliados % saldos en total', total;
END $$;