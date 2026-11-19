BEGIN;
UPDATE public.venta_lineas SET precio_unitario = 18.40, subtotal = 55.20, total = 55.20 WHERE id = '83a9c070-3e31-43f5-839f-13e76c0e7a38';
UPDATE public.venta_lineas SET precio_unitario = 15.61, subtotal = 15.61, total = 15.61 WHERE id = '4545f4d8-d134-4d75-aa22-dec5cf8ca841';
UPDATE public.venta_lineas SET precio_unitario = 15.83, subtotal = 47.49, total = 47.49 WHERE id = '4e9db93b-5619-4357-b0f5-cb07a00f53a0';
UPDATE public.ventas SET total = (SELECT SUM(total) FROM public.venta_lineas WHERE venta_id = 'f5b96a05-7f6a-4f02-89f3-4ae49a7ddde7') WHERE id = 'f5b96a05-7f6a-4f02-89f3-4ae49a7ddde7';
COMMIT;