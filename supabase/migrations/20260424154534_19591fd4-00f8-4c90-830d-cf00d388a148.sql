
-- 1) Feature flag por empresa
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS pos_turnos_habilitado boolean NOT NULL DEFAULT false;

-- 2) Tabla de turnos de caja
CREATE TABLE IF NOT EXISTS public.caja_turnos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  cajero_id uuid NOT NULL, -- profiles.id
  caja_nombre text NOT NULL DEFAULT 'Caja Principal',

  -- Apertura
  abierto_at timestamptz NOT NULL DEFAULT now(),
  fondo_inicial numeric NOT NULL DEFAULT 0,
  notas_apertura text,

  -- Cierre
  cerrado_at timestamptz,
  cerrado_por uuid, -- profiles.id

  -- Esperado al cierre (calculado en app)
  total_efectivo_esperado numeric DEFAULT 0,
  total_tarjeta_esperado numeric DEFAULT 0,
  total_transferencia_esperado numeric DEFAULT 0,
  total_otros_esperado numeric DEFAULT 0,

  -- Contado al cierre
  total_efectivo_contado numeric DEFAULT 0,
  total_tarjeta_contado numeric DEFAULT 0,
  total_transferencia_contado numeric DEFAULT 0,
  total_otros_contado numeric DEFAULT 0,

  diferencia numeric DEFAULT 0, -- positivo = sobrante, negativo = faltante
  notas_cierre text,
  arqueo_denominaciones jsonb, -- {"1000":2,"500":3,...}

  status text NOT NULL DEFAULT 'abierto' CHECK (status IN ('abierto','cerrado')),

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_turnos_empresa ON public.caja_turnos(empresa_id);
CREATE INDEX IF NOT EXISTS idx_caja_turnos_cajero ON public.caja_turnos(cajero_id);
CREATE INDEX IF NOT EXISTS idx_caja_turnos_status ON public.caja_turnos(status);

-- Solo un turno abierto por cajero a la vez
CREATE UNIQUE INDEX IF NOT EXISTS uq_caja_turno_abierto_por_cajero
  ON public.caja_turnos(cajero_id) WHERE status = 'abierto';

-- 3) Movimientos de caja (retiros / depósitos / gastos)
CREATE TABLE IF NOT EXISTS public.caja_movimientos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  turno_id uuid NOT NULL REFERENCES public.caja_turnos(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('retiro','deposito','gasto')),
  monto numeric NOT NULL CHECK (monto > 0),
  motivo text,
  user_id uuid NOT NULL, -- profiles.id quien lo registra
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_caja_mov_turno ON public.caja_movimientos(turno_id);
CREATE INDEX IF NOT EXISTS idx_caja_mov_empresa ON public.caja_movimientos(empresa_id);

-- 4) Trigger updated_at
CREATE TRIGGER trg_caja_turnos_updated_at
BEFORE UPDATE ON public.caja_turnos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) RLS
ALTER TABLE public.caja_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.caja_movimientos ENABLE ROW LEVEL SECURITY;

-- caja_turnos: empresa-scoped
CREATE POLICY "caja_turnos_select_empresa"
  ON public.caja_turnos FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "caja_turnos_insert_empresa"
  ON public.caja_turnos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "caja_turnos_update_empresa"
  ON public.caja_turnos FOR UPDATE TO authenticated
  USING (empresa_id = public.get_my_empresa_id())
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "caja_turnos_delete_empresa"
  ON public.caja_turnos FOR DELETE TO authenticated
  USING (empresa_id = public.get_my_empresa_id());

-- caja_movimientos: empresa-scoped
CREATE POLICY "caja_mov_select_empresa"
  ON public.caja_movimientos FOR SELECT TO authenticated
  USING (empresa_id = public.get_my_empresa_id() OR public.is_super_admin(auth.uid()));

CREATE POLICY "caja_mov_insert_empresa"
  ON public.caja_movimientos FOR INSERT TO authenticated
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "caja_mov_update_empresa"
  ON public.caja_movimientos FOR UPDATE TO authenticated
  USING (empresa_id = public.get_my_empresa_id())
  WITH CHECK (empresa_id = public.get_my_empresa_id());

CREATE POLICY "caja_mov_delete_empresa"
  ON public.caja_movimientos FOR DELETE TO authenticated
  USING (empresa_id = public.get_my_empresa_id());
