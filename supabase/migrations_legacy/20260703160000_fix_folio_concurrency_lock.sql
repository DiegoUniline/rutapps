-- ============================================================================
-- Fix: folios de venta duplicados bajo concurrencia (p. ej. varios VTA-4210)
-- ----------------------------------------------------------------------------
-- Causa: next_folio() y la rama 'saldo_inicial' calculaban el folio con
--   SELECT MAX(folio)+1  SIN ningún lock, y la tabla `ventas` no tiene un
--   índice único en (empresa_id, folio). Cuando varias ventas se insertan a la
--   vez (varios vendedores vendiendo simultáneamente, o el flush de la cola
--   offline de distintos dispositivos al reconectar), todas las transacciones
--   leen el mismo MAX antes de que cualquiera haga commit y reciben el MISMO
--   folio. Nada lo impedía, así que quedaban duplicados silenciosos.
--
-- Solución: tomar un advisory lock a nivel de transacción por (prefijo,
--   empresa) ANTES de calcular el consecutivo. Así la generación de folio se
--   serializa: la segunda transacción espera a que la primera confirme y
--   entonces lee el MAX ya actualizado. El lock se libera solo al terminar la
--   transacción. No mueve datos ni cambia la forma del folio.
-- ============================================================================

-- 1) next_folio: cubre VTA, PED, CLI, PROD
CREATE OR REPLACE FUNCTION public.next_folio(prefix text, p_empresa_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  next_num INT;
  pattern TEXT := '^' || prefix || '-[0-9]+$';
BEGIN
  -- Serializa la numeración por (prefijo, empresa) durante la transacción.
  PERFORM pg_advisory_xact_lock(hashtext('folio:' || prefix), hashtext(p_empresa_id::text));

  IF prefix IN ('VTA', 'PED') THEN
    SELECT COALESCE(MAX(
      CASE WHEN folio ~ pattern
        THEN CAST(SUBSTRING(folio FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.ventas
    WHERE empresa_id = p_empresa_id
      AND folio ~ pattern;
  ELSIF prefix = 'CLI' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ pattern
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.clientes
    WHERE empresa_id = p_empresa_id;
  ELSIF prefix = 'PROD' THEN
    SELECT COALESCE(MAX(
      CASE WHEN codigo ~ pattern
        THEN CAST(SUBSTRING(codigo FROM LENGTH(prefix) + 2) AS INT)
        ELSE 0
      END
    ), 0) + 1 INTO next_num
    FROM public.productos
    WHERE empresa_id = p_empresa_id;
  ELSE
    next_num := 1;
  END IF;

  RETURN prefix || '-' || LPAD(next_num::TEXT, 4, '0');
END;
$function$;

-- 2) auto_folio_venta: misma protección para la rama 'saldo_inicial' (SAL),
--    que genera el folio inline (no pasa por next_folio).
CREATE OR REPLACE FUNCTION public.auto_folio_venta()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.folio IS NULL OR NEW.folio = '' THEN
    IF NEW.tipo = 'saldo_inicial' THEN
      PERFORM pg_advisory_xact_lock(hashtext('folio:SAL'), hashtext(NEW.empresa_id::text));
      SELECT 'SAL-' || LPAD((COALESCE(MAX(
        CASE WHEN folio ~ '^SAL-[0-9]+$'
          THEN CAST(SUBSTRING(folio FROM 5) AS INT)
          ELSE 0
        END
      ), 0) + 1)::TEXT, 4, '0')
      INTO NEW.folio
      FROM public.ventas
      WHERE empresa_id = NEW.empresa_id;
    ELSE
      NEW.folio := next_folio(
        CASE WHEN NEW.tipo = 'pedido' THEN 'PED' ELSE 'VTA' END,
        NEW.empresa_id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 3) registrar_saldo_inicial: misma protección (import de saldos en lote).
CREATE OR REPLACE FUNCTION public.registrar_saldo_inicial(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_monto numeric,
  p_fecha date DEFAULT CURRENT_DATE,
  p_concepto text DEFAULT 'Saldo anterior',
  p_user_id uuid DEFAULT NULL
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
  PERFORM pg_advisory_xact_lock(hashtext('folio:SAL'), hashtext(p_empresa_id::text));

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
    status, condicion_pago, folio, vendedor_id
  ) VALUES (
    p_empresa_id, p_cliente_id, p_monto, p_monto,
    p_monto, 0, 0,
    'saldo_inicial', true, p_fecha, p_concepto,
    'confirmado', 'credito', v_folio, NULL
  ) RETURNING id INTO v_venta_id;

  RETURN v_venta_id;
END;
$$;
