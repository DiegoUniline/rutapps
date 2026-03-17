
-- Table to track timbre/stamp balance per empresa
CREATE TABLE public.timbres_saldo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE UNIQUE,
  saldo integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timbres_saldo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their empresa saldo"
  ON public.timbres_saldo FOR SELECT
  TO authenticated
  USING (empresa_id = get_my_empresa_id());

CREATE POLICY "Super admins manage all saldos"
  ON public.timbres_saldo FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Transaction log for timbre purchases and usage
CREATE TABLE public.timbres_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  tipo text NOT NULL DEFAULT 'compra', -- 'compra' or 'uso'
  cantidad integer NOT NULL DEFAULT 0,
  saldo_anterior integer NOT NULL DEFAULT 0,
  saldo_nuevo integer NOT NULL DEFAULT 0,
  referencia_id uuid NULL, -- cfdi_id when tipo='uso'
  notas text NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.timbres_movimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their empresa movimientos"
  ON public.timbres_movimientos FOR SELECT
  TO authenticated
  USING (empresa_id = get_my_empresa_id());

CREATE POLICY "Super admins manage all movimientos"
  ON public.timbres_movimientos FOR ALL
  TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- Function to deduct a timbre (called from edge function via service role)
CREATE OR REPLACE FUNCTION public.deduct_timbre(p_empresa_id uuid, p_cfdi_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_actual integer;
BEGIN
  -- Lock row for update
  SELECT saldo INTO v_saldo_actual
  FROM timbres_saldo
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  IF v_saldo_actual IS NULL OR v_saldo_actual < 1 THEN
    RETURN false;
  END IF;

  -- Deduct
  UPDATE timbres_saldo
  SET saldo = saldo - 1, updated_at = now()
  WHERE empresa_id = p_empresa_id;

  -- Log movement
  INSERT INTO timbres_movimientos (empresa_id, tipo, cantidad, saldo_anterior, saldo_nuevo, referencia_id, user_id, notas)
  VALUES (p_empresa_id, 'uso', -1, v_saldo_actual, v_saldo_actual - 1, p_cfdi_id, p_user_id, 'Timbre usado para CFDI');

  RETURN true;
END;
$$;

-- Function to add timbres (admin use)
CREATE OR REPLACE FUNCTION public.add_timbres(p_empresa_id uuid, p_cantidad integer, p_user_id uuid, p_notas text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo_actual integer;
  v_saldo_nuevo integer;
BEGIN
  -- Upsert saldo
  INSERT INTO timbres_saldo (empresa_id, saldo)
  VALUES (p_empresa_id, 0)
  ON CONFLICT (empresa_id) DO NOTHING;

  SELECT saldo INTO v_saldo_actual
  FROM timbres_saldo
  WHERE empresa_id = p_empresa_id
  FOR UPDATE;

  v_saldo_nuevo := v_saldo_actual + p_cantidad;

  UPDATE timbres_saldo
  SET saldo = v_saldo_nuevo, updated_at = now()
  WHERE empresa_id = p_empresa_id;

  INSERT INTO timbres_movimientos (empresa_id, tipo, cantidad, saldo_anterior, saldo_nuevo, user_id, notas)
  VALUES (p_empresa_id, 'compra', p_cantidad, v_saldo_actual, v_saldo_nuevo, p_user_id, COALESCE(p_notas, 'Recarga de timbres'));

  RETURN v_saldo_nuevo;
END;
$$;
