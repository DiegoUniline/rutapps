import subprocess
import json
import sys

def get_data(offset):
    query = f"""
    SELECT 
        v.id as venta_id,
        v.folio,
        vl.id as linea_id,
        vl.cantidad,
        vl.precio_unitario,
        vl.descuento_pct,
        vl.iva_pct,
        vl.ieps_pct,
        vl.total as linea_total,
        vl.subtotal,
        vl.iva_monto,
        vl.ieps_monto,
        vl.precio_unitario_sin_redondeo,
        (
            SELECT json_agg(pa.*) 
            FROM public.promocion_aplicada pa 
            WHERE pa.venta_linea_id = vl.id
        ) as promocion_aplicada
    FROM public.ventas v
    JOIN public.venta_lineas vl ON vl.venta_id = v.id
    WHERE v.created_at >= '2026-07-27' 
      AND v.status != 'cancelado'
      AND vl.precio_lista_unitario IS NULL
    ORDER BY v.created_at DESC
    LIMIT 2000 OFFSET {offset};
    """
    # Usamos lovalbe-exec via shell (simulado aquí con la herramienta del sistema)
    # Como no puedo llamar a herramientas desde python, este script solo genera el plan.
    pass

