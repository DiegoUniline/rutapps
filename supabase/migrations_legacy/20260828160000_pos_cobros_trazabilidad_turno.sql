-- Trazabilidad inequívoca para cobros originados en Punto de Venta.
-- No se realiza ningún backfill: los registros históricos permanecen intactos.

ALTER TABLE public.cobros
  ADD COLUMN IF NOT EXISTS turno_id uuid,
  ADD COLUMN IF NOT EXISTS origen text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'cobros_turno_id_fkey'
      AND conrelid = 'public.cobros'::regclass
  ) THEN
    ALTER TABLE public.cobros
      ADD CONSTRAINT cobros_turno_id_fkey
      FOREIGN KEY (turno_id)
      REFERENCES public.caja_turnos(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cobros_turno_id
  ON public.cobros(turno_id)
  WHERE turno_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cobros_turno_origen
  ON public.cobros(turno_id, origen)
  WHERE turno_id IS NOT NULL;

-- Protege también inserciones directas: un cobro marcado como POS nunca puede
-- quedar huérfano ni vincularse a otro turno/empresa/cajero.
CREATE OR REPLACE FUNCTION public.validar_cobro_pos_turno()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_origen text;
BEGIN
  v_origen := NULLIF(lower(btrim(NEW.origen)), '');
  NEW.origen := v_origen;

  -- Cancelar/reactivar o editar datos ajenos a la trazabilidad debe seguir
  -- funcionando aunque el turno ya esté cerrado.
  IF TG_OP = 'UPDATE'
     AND NEW.turno_id IS NOT DISTINCT FROM OLD.turno_id
     AND NEW.origen IS NOT DISTINCT FROM OLD.origen
     AND NEW.empresa_id IS NOT DISTINCT FROM OLD.empresa_id
     AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF v_origen = 'pos' THEN
    IF NEW.turno_id IS NULL THEN
      RAISE EXCEPTION 'Un cobro POS requiere un turno activo';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.caja_turnos t
      WHERE t.id = NEW.turno_id
        AND t.empresa_id = NEW.empresa_id
        AND t.cajero_id = NEW.user_id
        AND t.status = 'abierto'
    ) THEN
      RAISE EXCEPTION 'El turno POS no está abierto o no corresponde a la empresa y cajero';
    END IF;
  ELSIF NEW.turno_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo los cobros con origen POS pueden asociarse a un turno';
  END IF;

  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_validar_cobro_pos_turno ON public.cobros;
CREATE TRIGGER trg_validar_cobro_pos_turno
BEFORE INSERT OR UPDATE ON public.cobros
FOR EACH ROW EXECUTE FUNCTION public.validar_cobro_pos_turno();

-- Nueva firma POS. p_turno_id y p_origen son obligatorios en esta firma para
-- evitar ambigüedad con la firma histórica expuesta por PostgREST.
CREATE OR REPLACE FUNCTION public.aplicar_cobro(
  p_empresa_id uuid,
  p_cliente_id uuid,
  p_monto numeric,
  p_metodo text,
  p_referencia text,
  p_fecha date,
  p_aplicaciones jsonb,
  p_turno_id uuid,
  p_origen text,
  p_notas text DEFAULT NULL,
  p_user_id uuid DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cobro_id uuid;
  v_app jsonb;
  v_total_app numeric := 0;
  v_user_id uuid := COALESCE(p_user_id, auth.uid());
  v_origen text := NULLIF(lower(btrim(p_origen)), '');
BEGIN
  IF p_monto IS NULL OR p_monto <= 0 THEN
    RAISE EXCEPTION 'Monto del cobro debe ser mayor a 0';
  END IF;

  FOR v_app IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb))
  LOOP
    v_total_app := v_total_app + COALESCE((v_app->>'monto_aplicado')::numeric, 0);
  END LOOP;

  IF v_total_app > p_monto + 0.01 THEN
    RAISE EXCEPTION 'Suma de aplicaciones (%) excede monto del cobro (%)', v_total_app, p_monto;
  END IF;

  IF v_origen = 'pos' THEN
    IF p_turno_id IS NULL THEN
      RAISE EXCEPTION 'Un cobro POS requiere un turno activo';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.caja_turnos t
      WHERE t.id = p_turno_id
        AND t.empresa_id = p_empresa_id
        AND t.cajero_id = v_user_id
        AND t.status = 'abierto'
    ) THEN
      RAISE EXCEPTION 'El turno POS no está abierto o no corresponde a la empresa y cajero';
    END IF;
  ELSIF p_turno_id IS NOT NULL THEN
    RAISE EXCEPTION 'Sólo los cobros con origen POS pueden asociarse a un turno';
  END IF;

  INSERT INTO public.cobros (
    empresa_id,
    cliente_id,
    user_id,
    monto,
    metodo_pago,
    referencia,
    fecha,
    notas,
    status,
    turno_id,
    origen
  ) VALUES (
    p_empresa_id,
    p_cliente_id,
    v_user_id,
    p_monto,
    p_metodo,
    p_referencia,
    p_fecha,
    p_notas,
    'activo',
    p_turno_id,
    v_origen
  )
  RETURNING id INTO v_cobro_id;

  FOR v_app IN
    SELECT * FROM jsonb_array_elements(COALESCE(p_aplicaciones, '[]'::jsonb))
  LOOP
    IF COALESCE((v_app->>'monto_aplicado')::numeric, 0) > 0 THEN
      INSERT INTO public.cobro_aplicaciones (cobro_id, venta_id, monto_aplicado)
      VALUES (
        v_cobro_id,
        (v_app->>'venta_id')::uuid,
        (v_app->>'monto_aplicado')::numeric
      );
    END IF;
  END LOOP;

  RETURN v_cobro_id;
END;
$$;

-- Firma compatible para cartera, pagos de ventas anteriores, devoluciones y
-- demás consumidores existentes. Nunca etiqueta esos cobros como POS.
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
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.aplicar_cobro(
    p_empresa_id,
    p_cliente_id,
    p_monto,
    p_metodo,
    p_referencia,
    p_fecha,
    p_aplicaciones,
    NULL::uuid,
    NULL::text,
    p_notas,
    p_user_id
  );
END;
$$;
