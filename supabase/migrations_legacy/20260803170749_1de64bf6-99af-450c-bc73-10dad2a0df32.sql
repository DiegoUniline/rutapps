INSERT INTO public.venta_linea_lotes (empresa_id, venta_id, venta_linea_id, producto_id, lote_id, almacen_id, cantidad)
SELECT v.empresa_id, vl.venta_id, vl.id, vl.producto_id, vl.lote_id, vl.almacen_id, COALESCE(vl.cantidad, 0)
  FROM public.venta_lineas vl
  JOIN public.ventas v ON v.id = vl.venta_id
 WHERE vl.lote_id IS NOT NULL
   AND vl.producto_id IS NOT NULL
   AND v.status <> 'cancelado'
ON CONFLICT (venta_linea_id, lote_id) DO NOTHING;