CREATE OR REPLACE FUNCTION public.registrar_saldo_inicial(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT CURRENT_DATE,
  p_concepto text DEFAULT 'Saldo anterior',
  p_user_id uuid DEFAULT NULL,
  p_fecha_vencimiento date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_venta_id uuid;
  v_folio text;
BEGIN
  SELECT 'SAL-' || LPAD((COALESCE(MAX(
    CASE WHEN folio ~ '^SAL-[0-9]+$'
      THEN CAST(SUBSTRING(folio FROM 5) AS INT)
      ELSE 0
    END
  ), 0) + 1)::TEXT, 4, '0')
  INTO v_folio
  FROM public.ventas
  WHERE empresa_id = p_empresa_id;

  INSERT INTO public.ventas (
    empresa_id, cliente_id, total, saldo_pendiente,
    subtotal, iva_total, ieps_total,
    tipo, es_saldo_inicial, fecha, concepto,
    status, condicion_pago, folio, vendedor_id, fecha_vencimiento
  ) VALUES (
    p_empresa_id, p_cliente_id, p_monto, p_monto,
    p_monto, 0, 0,
    'saldo_inicial', true, p_fecha, p_concepto,
    'confirmado', 'credito', v_folio, NULL, p_fecha_vencimiento
  ) RETURNING id INTO v_venta_id;

  RETURN v_venta_id;
END;
$$;