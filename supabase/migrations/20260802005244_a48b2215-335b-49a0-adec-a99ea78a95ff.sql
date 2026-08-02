INSERT INTO public.promocion_aplicada (promocion_id, venta_id, venta_linea_id, descuento_aplicado, descripcion)
SELECT 'aca543d2-ba37-42b7-8a0f-64872f4ed125', vl.venta_id, vl.id, 16, '1x gratis (10×9) — 10+1'
FROM public.venta_lineas vl
WHERE vl.id = '01fbb377-39ef-197a-a8da-421a271c9034'
  AND NOT EXISTS (SELECT 1 FROM public.promocion_aplicada pa WHERE pa.venta_linea_id = vl.id);