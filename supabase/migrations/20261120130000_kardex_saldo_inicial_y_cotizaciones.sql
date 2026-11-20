-- Kardex con ventana de fechas sin perder el saldo corrido: la BD da el saldo de la
-- ubicación ANTES de la fecha desde (misma regla que deltaKardexUbicacion del front).
-- SECURITY INVOKER: aplica la RLS de movimientos_inventario (solo la empresa del usuario).

CREATE OR REPLACE FUNCTION public.kardex_saldo_inicial(
  p_producto_id uuid,
  p_ubicacion_id uuid,
  p_antes_de date,
  p_lote_id uuid DEFAULT NULL
) RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(SUM(
    CASE
      WHEN m.tipo::text = 'entrada' THEN CASE WHEN m.almacen_destino_id = p_ubicacion_id THEN m.cantidad ELSE 0 END
      WHEN m.tipo::text = 'salida'  THEN CASE WHEN m.almacen_origen_id  = p_ubicacion_id THEN -m.cantidad ELSE 0 END
      ELSE (CASE WHEN m.almacen_destino_id = p_ubicacion_id THEN m.cantidad ELSE 0 END)
         - (CASE WHEN m.almacen_origen_id  = p_ubicacion_id THEN m.cantidad ELSE 0 END)
    END), 0)
  FROM public.movimientos_inventario m
  WHERE m.empresa_id = public.get_my_empresa_id()
    AND m.producto_id = p_producto_id
    AND (p_lote_id IS NULL OR m.lote_id = p_lote_id)
    AND m.fecha < p_antes_de
    AND (m.almacen_origen_id = p_ubicacion_id OR m.almacen_destino_id = p_ubicacion_id);
$function$;

REVOKE ALL ON FUNCTION public.kardex_saldo_inicial(uuid, uuid, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kardex_saldo_inicial(uuid, uuid, date, uuid) TO authenticated;

CREATE INDEX IF NOT EXISTS idx_movinv_emp_producto_fecha
  ON public.movimientos_inventario (empresa_id, producto_id, fecha);

-- Cotizaciones: la lista ahora filtra por fecha en el servidor.
CREATE INDEX IF NOT EXISTS idx_cotizaciones_emp_fecha
  ON public.cotizaciones (empresa_id, fecha DESC);
