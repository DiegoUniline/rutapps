CREATE TABLE IF NOT EXISTS public.venta_linea_lotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL REFERENCES public.empresas(id) ON DELETE CASCADE,
  venta_id uuid NOT NULL REFERENCES public.ventas(id) ON DELETE CASCADE,
  venta_linea_id uuid NOT NULL REFERENCES public.venta_lineas(id) ON DELETE CASCADE,
  producto_id uuid NOT NULL REFERENCES public.productos(id) ON DELETE CASCADE,
  lote_id uuid NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  almacen_id uuid REFERENCES public.almacenes(id) ON DELETE SET NULL,
  cantidad numeric NOT NULL DEFAULT 0,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venta_linea_id, lote_id)
);

CREATE INDEX IF NOT EXISTS idx_vll_empresa ON public.venta_linea_lotes (empresa_id);
CREATE INDEX IF NOT EXISTS idx_vll_venta ON public.venta_linea_lotes (venta_id);
CREATE INDEX IF NOT EXISTS idx_vll_linea ON public.venta_linea_lotes (venta_linea_id);
CREATE INDEX IF NOT EXISTS idx_vll_lote ON public.venta_linea_lotes (lote_id);
CREATE INDEX IF NOT EXISTS idx_vll_producto ON public.venta_linea_lotes (producto_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.venta_linea_lotes TO authenticated;
GRANT ALL ON public.venta_linea_lotes TO service_role;

ALTER TABLE public.venta_linea_lotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vll_empresa_all" ON public.venta_linea_lotes;
CREATE POLICY "vll_empresa_all" ON public.venta_linea_lotes
  FOR ALL TO authenticated
  USING (empresa_id = public.get_my_empresa_id())
  WITH CHECK (empresa_id = public.get_my_empresa_id());

-- El apartado deja de ser 1 fila por línea: ahora 1 fila por (línea, lote)
ALTER TABLE public.stock_apartado DROP CONSTRAINT IF EXISTS stock_apartado_venta_linea_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS ux_stock_apartado_linea_lote
  ON public.stock_apartado (venta_linea_id, COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid));

CREATE OR REPLACE FUNCTION public.fn_sync_apartado_linea(p_linea_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_l public.venta_lineas%ROWTYPE;
  v_tipo text; v_status text; v_empresa_id uuid; v_flag boolean;
  v_detalle int;
BEGIN
  SELECT * INTO v_l FROM public.venta_lineas WHERE id = p_linea_id;
  IF NOT FOUND THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = p_linea_id;
    RETURN;
  END IF;

  SELECT v.tipo, v.status, v.empresa_id INTO v_tipo, v_status, v_empresa_id
    FROM public.ventas v WHERE v.id = v_l.venta_id;

  IF v_tipo IS DISTINCT FROM 'pedido' THEN RETURN; END IF;

  SELECT apartar_stock_pedidos INTO v_flag FROM public.empresas WHERE id = v_empresa_id;
  IF NOT COALESCE(v_flag, false) THEN RETURN; END IF;

  IF v_status = 'cancelado' OR v_l.almacen_id IS NULL OR v_l.producto_id IS NULL THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = p_linea_id;
    RETURN;
  END IF;

  SELECT count(*) INTO v_detalle FROM public.venta_linea_lotes WHERE venta_linea_id = p_linea_id;

  IF v_detalle > 0 THEN
    DELETE FROM public.stock_apartado sa
     WHERE sa.venta_linea_id = p_linea_id
       AND (sa.lote_id IS NULL
            OR NOT EXISTS (SELECT 1 FROM public.venta_linea_lotes d
                            WHERE d.venta_linea_id = p_linea_id AND d.lote_id = sa.lote_id));

    INSERT INTO public.stock_apartado (empresa_id, venta_id, venta_linea_id, producto_id, almacen_id, cantidad, lote_id)
    SELECT v_empresa_id, v_l.venta_id, p_linea_id, v_l.producto_id,
           COALESCE(d.almacen_id, v_l.almacen_id), d.cantidad, d.lote_id
      FROM public.venta_linea_lotes d
     WHERE d.venta_linea_id = p_linea_id
    ON CONFLICT (venta_linea_id, COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET cantidad = EXCLUDED.cantidad,
                  almacen_id = EXCLUDED.almacen_id,
                  producto_id = EXCLUDED.producto_id,
                  updated_at = now();
  ELSE
    DELETE FROM public.stock_apartado sa
     WHERE sa.venta_linea_id = p_linea_id
       AND sa.lote_id IS DISTINCT FROM v_l.lote_id;

    INSERT INTO public.stock_apartado (empresa_id, venta_id, venta_linea_id, producto_id, almacen_id, cantidad, lote_id)
    VALUES (v_empresa_id, v_l.venta_id, p_linea_id, v_l.producto_id, v_l.almacen_id, COALESCE(v_l.cantidad, 0), v_l.lote_id)
    ON CONFLICT (venta_linea_id, COALESCE(lote_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET cantidad = EXCLUDED.cantidad,
                  almacen_id = EXCLUDED.almacen_id,
                  producto_id = EXCLUDED.producto_id,
                  updated_at = now();
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_venta_lineas_apartado()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM public.stock_apartado WHERE venta_linea_id = OLD.id;
    RETURN OLD;
  END IF;
  PERFORM public.fn_sync_apartado_linea(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_venta_linea_lotes_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_linea uuid;
  v_principal uuid;
BEGIN
  v_linea := COALESCE(NEW.venta_linea_id, OLD.venta_linea_id);

  SELECT d.lote_id INTO v_principal
    FROM public.venta_linea_lotes d
   WHERE d.venta_linea_id = v_linea
   ORDER BY d.cantidad DESC, d.created_at ASC
   LIMIT 1;

  UPDATE public.venta_lineas
     SET lote_id = v_principal
   WHERE id = v_linea
     AND lote_id IS DISTINCT FROM v_principal;

  PERFORM public.fn_sync_apartado_linea(v_linea);
  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_venta_linea_lotes_sync_aiud ON public.venta_linea_lotes;
CREATE TRIGGER trg_venta_linea_lotes_sync_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.venta_linea_lotes
FOR EACH ROW EXECUTE FUNCTION public.trg_venta_linea_lotes_sync();