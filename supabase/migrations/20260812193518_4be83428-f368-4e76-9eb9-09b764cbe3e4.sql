-- Evitar duplicados por línea
DELETE FROM public.venta_comisiones a
USING public.venta_comisiones b
WHERE a.venta_linea_id = b.venta_linea_id AND a.ctid > b.ctid AND a.pagada = false AND a.pago_comision_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS venta_comisiones_linea_uidx ON public.venta_comisiones(venta_linea_id);

CREATE OR REPLACE FUNCTION public.fn_sync_venta_comision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_empresa uuid;
  v_vendedor uuid;
  v_fecha date;
  v_status text;
BEGIN
  SELECT v.empresa_id, v.vendedor_id, v.fecha, v.status
    INTO v_empresa, v_vendedor, v_fecha, v_status
  FROM public.ventas v WHERE v.id = NEW.venta_id;

  IF v_empresa IS NULL OR v_vendedor IS NULL THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.comision_monto,0) <= 0 OR v_status = 'cancelado' THEN
    DELETE FROM public.venta_comisiones
     WHERE venta_linea_id = NEW.id AND pagada = false AND pago_comision_id IS NULL;
    RETURN NEW;
  END IF;

  INSERT INTO public.venta_comisiones (
    empresa_id, venta_id, venta_linea_id, vendedor_id, producto_id,
    monto_venta, comision_pct, comision_monto, fecha_venta
  ) VALUES (
    v_empresa, NEW.venta_id, NEW.id, v_vendedor, NEW.producto_id,
    COALESCE(NEW.total,0), COALESCE(NEW.comision_pct,0), COALESCE(NEW.comision_monto,0),
    COALESCE(v_fecha, CURRENT_DATE)
  )
  ON CONFLICT (venta_linea_id) DO UPDATE SET
    vendedor_id = EXCLUDED.vendedor_id,
    producto_id = EXCLUDED.producto_id,
    monto_venta = EXCLUDED.monto_venta,
    comision_pct = EXCLUDED.comision_pct,
    comision_monto = EXCLUDED.comision_monto,
    fecha_venta = EXCLUDED.fecha_venta
  WHERE public.venta_comisiones.pagada = false
    AND public.venta_comisiones.pago_comision_id IS NULL;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_venta_comision ON public.venta_lineas;
CREATE TRIGGER trg_sync_venta_comision
AFTER INSERT OR UPDATE OF comision_monto, comision_pct, total, producto_id, venta_id
ON public.venta_lineas
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_venta_comision();

-- Backfill de ventas existentes sin detalle de comisión
INSERT INTO public.venta_comisiones (
  empresa_id, venta_id, venta_linea_id, vendedor_id, producto_id,
  monto_venta, comision_pct, comision_monto, fecha_venta
)
SELECT v.empresa_id, v.id, vl.id, v.vendedor_id, vl.producto_id,
       COALESCE(vl.total,0), COALESCE(vl.comision_pct,0), COALESCE(vl.comision_monto,0),
       COALESCE(v.fecha, CURRENT_DATE)
FROM public.venta_lineas vl
JOIN public.ventas v ON v.id = vl.venta_id
WHERE COALESCE(vl.comision_monto,0) > 0
  AND v.status <> 'cancelado'
  AND v.vendedor_id IS NOT NULL
ON CONFLICT (venta_linea_id) DO NOTHING;