-- ============================================================================
-- LOTES · Fase 0 — Cimientos (schema + interruptores)
--
-- INERTE por diseño: con los flags apagados NADA cambia. Esta migración solo
-- crea columnas y tablas para el manejo por lotes; ninguna lógica existente las
-- usa todavía. Se libera empresa por empresa con `empresas.maneja_lotes` y
-- producto por producto con `productos.maneja_lote`.
--
-- Modelo:
--   - stock_almacen  → SIGUE siendo el total por (almacén, producto). No se toca.
--   - stock_lotes    → desglose por lote SOLO para productos con maneja_lote.
--   Invariante (fases siguientes): para un producto por lote,
--     SUM(stock_lotes.cantidad) por (almacén, producto) = stock_almacen.cantidad
-- ============================================================================

-- 1) Interruptor MAESTRO por empresa. Solo difasur lo tendrá en true.
ALTER TABLE public.empresas
  ADD COLUMN IF NOT EXISTS maneja_lotes boolean NOT NULL DEFAULT false;

-- 2) Interruptor por producto: cuáles se manejan por lote y cuáles no.
ALTER TABLE public.productos
  ADD COLUMN IF NOT EXISTS maneja_lote boolean NOT NULL DEFAULT false;

-- 3) Catálogo de lotes: aquí "nacen".
CREATE TABLE IF NOT EXISTS public.lotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  producto_id UUID NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  codigo TEXT NOT NULL,
  fecha_caducidad DATE NULL,
  fecha_fabricacion DATE NULL,
  costo NUMERIC(14,4) NULL,
  notas TEXT NULL,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_lote_codigo UNIQUE (empresa_id, producto_id, codigo)
);
CREATE INDEX IF NOT EXISTS idx_lotes_empresa   ON public.lotes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_lotes_producto  ON public.lotes(producto_id);
-- Para FEFO (surtir lo que caduca primero):
CREATE INDEX IF NOT EXISTS idx_lotes_caducidad ON public.lotes(producto_id, fecha_caducidad);

-- 4) Stock por lote y almacén. Desglose; NO reemplaza stock_almacen.
CREATE TABLE IF NOT EXISTS public.stock_lotes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  empresa_id UUID NOT NULL,
  almacen_id UUID NOT NULL,
  producto_id UUID NOT NULL,
  lote_id UUID NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  cantidad NUMERIC(16,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_stock_lote UNIQUE (almacen_id, lote_id)
);
CREATE INDEX IF NOT EXISTS idx_stock_lotes_empresa    ON public.stock_lotes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_stock_lotes_prod_alm   ON public.stock_lotes(producto_id, almacen_id);
CREATE INDEX IF NOT EXISTS idx_stock_lotes_lote       ON public.stock_lotes(lote_id);

-- 5) Trazabilidad: lote en cada movimiento de inventario.
ALTER TABLE public.movimientos_inventario
  ADD COLUMN IF NOT EXISTS lote_id UUID NULL;

-- 6) RLS (mismo patrón por empresa que el resto de tablas).
ALTER TABLE public.lotes       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_lotes ENABLE ROW LEVEL SECURITY;

-- lotes
DROP POLICY IF EXISTS "lotes_select" ON public.lotes;
CREATE POLICY "lotes_select" ON public.lotes FOR SELECT
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "lotes_insert" ON public.lotes;
CREATE POLICY "lotes_insert" ON public.lotes FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "lotes_update" ON public.lotes;
CREATE POLICY "lotes_update" ON public.lotes FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "lotes_delete" ON public.lotes;
CREATE POLICY "lotes_delete" ON public.lotes FOR DELETE
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

-- stock_lotes
DROP POLICY IF EXISTS "stock_lotes_select" ON public.stock_lotes;
CREATE POLICY "stock_lotes_select" ON public.stock_lotes FOR SELECT
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "stock_lotes_insert" ON public.stock_lotes;
CREATE POLICY "stock_lotes_insert" ON public.stock_lotes FOR INSERT
  WITH CHECK (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "stock_lotes_update" ON public.stock_lotes;
CREATE POLICY "stock_lotes_update" ON public.stock_lotes FOR UPDATE
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));
DROP POLICY IF EXISTS "stock_lotes_delete" ON public.stock_lotes;
CREATE POLICY "stock_lotes_delete" ON public.stock_lotes FOR DELETE
  USING (empresa_id IN (SELECT empresa_id FROM public.profiles WHERE id = auth.uid()));

-- 7) updated_at automático.
DROP TRIGGER IF EXISTS trg_lotes_updated ON public.lotes;
CREATE TRIGGER trg_lotes_updated BEFORE UPDATE ON public.lotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_stock_lotes_updated ON public.stock_lotes;
CREATE TRIGGER trg_stock_lotes_updated BEFORE UPDATE ON public.stock_lotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- Para HABILITAR en difasur (correr aparte cuando quieras encender el módulo):
--   UPDATE public.empresas SET maneja_lotes = true WHERE nombre ILIKE '%difasur%';
-- Y por producto, conforme los vayas marcando:
--   UPDATE public.productos SET maneja_lote = true WHERE id = '<producto_id>';
-- ============================================================================
