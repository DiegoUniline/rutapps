ALTER TABLE public.compra_lineas ADD COLUMN IF NOT EXISTS piezas_loteadas numeric NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.compra_linea_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  compra_id uuid NOT NULL REFERENCES public.compras(id) ON DELETE CASCADE,
  compra_linea_id uuid NOT NULL REFERENCES public.compra_lineas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL,
  lote_id uuid NOT NULL REFERENCES public.lotes(id),
  almacen_id uuid,
  piezas numeric NOT NULL CHECK (piezas > 0),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cll_empresa ON public.compra_linea_lotes(empresa_id);
CREATE INDEX IF NOT EXISTS idx_cll_compra ON public.compra_linea_lotes(compra_id);
CREATE INDEX IF NOT EXISTS idx_cll_linea ON public.compra_linea_lotes(compra_linea_id);
CREATE INDEX IF NOT EXISTS idx_cll_lote ON public.compra_linea_lotes(lote_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compra_linea_lotes TO authenticated;
GRANT ALL ON public.compra_linea_lotes TO service_role;

ALTER TABLE public.compra_linea_lotes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cll_select_empresa" ON public.compra_linea_lotes FOR SELECT TO authenticated
USING (empresa_id IN (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()));
CREATE POLICY "cll_insert_empresa" ON public.compra_linea_lotes FOR INSERT TO authenticated
WITH CHECK (empresa_id IN (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()));
CREATE POLICY "cll_update_empresa" ON public.compra_linea_lotes FOR UPDATE TO authenticated
USING (empresa_id IN (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()))
WITH CHECK (empresa_id IN (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()));
CREATE POLICY "cll_delete_empresa" ON public.compra_linea_lotes FOR DELETE TO authenticated
USING (empresa_id IN (SELECT p.empresa_id FROM public.profiles p WHERE p.id = auth.uid()));

CREATE OR REPLACE FUNCTION public.fn_compra_linea_lote_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rec record;
  v_delta numeric;
  v_linea record;
  v_total numeric;
  v_loteado numeric;
  v_sa_id uuid; v_sa_qty numeric;
  v_sl_id uuid; v_sl_qty numeric;
  v_pendiente numeric;
  v_folio text;
BEGIN
  IF TG_OP = 'INSERT' THEN v_rec := NEW; v_delta := NEW.piezas;
  ELSE v_rec := OLD; v_delta := -OLD.piezas;
  END IF;

  SELECT cl.*, (cl.cantidad * COALESCE(NULLIF(cl.factor_conversion,0),1)) AS total_piezas
    INTO v_linea
  FROM compra_lineas cl WHERE cl.id = v_rec.compra_linea_id FOR UPDATE;

  IF v_linea IS NULL THEN RETURN v_rec; END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT EXISTS (SELECT 1 FROM lotes l WHERE l.id = NEW.lote_id AND l.producto_id = v_linea.producto_id) THEN
      RAISE EXCEPTION 'El lote no corresponde al producto de la línea';
    END IF;
    v_total := v_linea.total_piezas;
    v_loteado := COALESCE(v_linea.piezas_loteadas, 0);
    IF v_loteado + NEW.piezas > v_total + 0.0001 THEN
      RAISE EXCEPTION 'No puedes lotear más piezas de las compradas (pendiente: %)', GREATEST(0, v_total - v_loteado);
    END IF;
  END IF;

  IF v_rec.almacen_id IS NOT NULL THEN
    SELECT id, cantidad INTO v_sa_id, v_sa_qty
    FROM stock_almacen WHERE almacen_id = v_rec.almacen_id AND producto_id = v_linea.producto_id FOR UPDATE;
    IF v_sa_id IS NOT NULL THEN
      UPDATE stock_almacen SET cantidad = COALESCE(v_sa_qty,0) + v_delta, updated_at = now() WHERE id = v_sa_id;
    ELSIF v_delta > 0 THEN
      INSERT INTO stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
      VALUES (v_rec.empresa_id, v_rec.almacen_id, v_linea.producto_id, v_delta);
    END IF;

    SELECT id, cantidad INTO v_sl_id, v_sl_qty
    FROM stock_lotes WHERE almacen_id = v_rec.almacen_id AND lote_id = v_rec.lote_id FOR UPDATE;
    IF v_sl_id IS NOT NULL THEN
      UPDATE stock_lotes SET cantidad = COALESCE(v_sl_qty,0) + v_delta, updated_at = now() WHERE id = v_sl_id;
    ELSIF v_delta > 0 THEN
      INSERT INTO stock_lotes (empresa_id, almacen_id, producto_id, lote_id, cantidad)
      VALUES (v_rec.empresa_id, v_rec.almacen_id, v_linea.producto_id, v_rec.lote_id, v_delta);
    END IF;
  END IF;

  SELECT folio INTO v_folio FROM compras WHERE id = v_rec.compra_id;

  INSERT INTO movimientos_inventario (empresa_id, tipo, producto_id, cantidad,
    almacen_destino_id, almacen_origen_id, referencia_tipo, referencia_id, user_id, fecha, notas, lote_id)
  VALUES (v_rec.empresa_id,
    CASE WHEN v_delta > 0 THEN 'entrada' ELSE 'salida' END,
    v_linea.producto_id, ABS(v_delta),
    CASE WHEN v_delta > 0 THEN v_rec.almacen_id ELSE NULL END,
    CASE WHEN v_delta < 0 THEN v_rec.almacen_id ELSE NULL END,
    'compra', v_rec.compra_id, v_rec.user_id, current_date,
    concat('Compra ', COALESCE(v_folio, v_rec.compra_id::text),
           CASE WHEN v_delta > 0 THEN ' loteo/recepción' ELSE ' reversa de loteo' END),
    v_rec.lote_id);

  UPDATE compra_lineas
     SET piezas_loteadas = GREATEST(0, COALESCE(piezas_loteadas,0) + v_delta),
         cantidad_recibida = GREATEST(0, COALESCE(cantidad_recibida,0) + v_delta)
   WHERE id = v_rec.compra_linea_id;

  SELECT COALESCE(SUM(GREATEST(0, cantidad * COALESCE(NULLIF(factor_conversion,0),1) - COALESCE(cantidad_recibida,0))), 0)
    INTO v_pendiente
  FROM compra_lineas WHERE compra_id = v_rec.compra_id;

  IF v_pendiente = 0 THEN
    UPDATE compras SET status = 'recibida'
     WHERE id = v_rec.compra_id AND status NOT IN ('recibida','pagada','cancelada');
  END IF;

  RETURN v_rec;
END;
$$;

DROP TRIGGER IF EXISTS trg_compra_linea_lote_stock ON public.compra_linea_lotes;
CREATE TRIGGER trg_compra_linea_lote_stock
AFTER INSERT OR DELETE ON public.compra_linea_lotes
FOR EACH ROW EXECUTE FUNCTION public.fn_compra_linea_lote_stock();