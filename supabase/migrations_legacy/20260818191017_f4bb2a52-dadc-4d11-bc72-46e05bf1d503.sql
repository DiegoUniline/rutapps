UPDATE public.venta_lineas vl
SET almacen_id = v.almacen_id
FROM public.ventas v
WHERE v.id = vl.venta_id
  AND v.empresa_id = (SELECT id FROM public.empresas WHERE licencia = '53021303')
  AND vl.almacen_id IS NULL
  AND v.almacen_id IS NOT NULL
  AND v.status <> 'cancelado';