-- ============================================================================
-- POLÍTICA DE COBRO — Fase 0 (RIESGO CERO: solo agrega campos, no cambia lógica)
-- ----------------------------------------------------------------------------
-- 'pedido'    = se cobra el total del pedido (comportamiento ACTUAL).
-- 'entregado' = se cobra solo lo entregado (se activará en la Fase 1).
--
-- Default 'pedido' en empresas => NADA cambia para nadie hasta que una empresa
-- lo prenda a mano. Ningún código lee estas columnas todavía.
-- ============================================================================

-- Config por empresa
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS politica_cobro text NOT NULL DEFAULT 'pedido';

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'empresas_politica_cobro_chk') THEN
    ALTER TABLE public.empresas
      ADD CONSTRAINT empresas_politica_cobro_chk
      CHECK (politica_cobro IN ('pedido','entregado'));
  END IF;
END $$;

-- Snapshot por pedido (se congela al crear el pedido en la Fase 1).
-- NULL = tratar como 'pedido' → los pedidos existentes NO cambian.
ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS politica_cobro text;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ventas_politica_cobro_chk') THEN
    ALTER TABLE public.ventas
      ADD CONSTRAINT ventas_politica_cobro_chk
      CHECK (politica_cobro IS NULL OR politica_cobro IN ('pedido','entregado'));
  END IF;
END $$;
