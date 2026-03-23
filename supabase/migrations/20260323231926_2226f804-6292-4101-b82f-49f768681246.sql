
-- Fix GUA20 Ruta Chica: should be 3
UPDATE public.stock_almacen 
SET cantidad = 3, updated_at = now()
WHERE almacen_id = '08550ad9-6867-41ef-a85f-793651f58374' 
AND producto_id = '8ed6f686-42b5-4023-91f8-4471c300648a';

-- Fix GUA20 Ruta Grande: should be 1
UPDATE public.stock_almacen 
SET cantidad = 1, updated_at = now()
WHERE almacen_id = 'a2095ef8-8357-425d-a2da-a372c6e6f0b2' 
AND producto_id = '8ed6f686-42b5-4023-91f8-4471c300648a';

-- Fix GUA20 global: sum = 0 + 3 + 1 = 4
UPDATE public.productos SET cantidad = 4 WHERE id = '8ed6f686-42b5-4023-91f8-4471c300648a';

-- Fix GUAJR20 global: Ruta Chica=0, Ruta Grande=9 → 9
UPDATE public.productos SET cantidad = 9 WHERE id = 'e5e945ff-9919-4b2f-958d-4738194e4ab3';

-- Fix QP18 Ruta Chica: should be 5 (insert if not exists)
INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
VALUES ('66ac277d-c859-4d0e-beeb-f9162e3ade81', '08550ad9-6867-41ef-a85f-793651f58374', 'f9d65bdb-6984-4fed-86ca-e485f3b44626', 5)
ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = 5, updated_at = now();

-- Fix QP18 Ruta Grande: should be 0
INSERT INTO public.stock_almacen (empresa_id, almacen_id, producto_id, cantidad)
VALUES ('66ac277d-c859-4d0e-beeb-f9162e3ade81', 'a2095ef8-8357-425d-a2da-a372c6e6f0b2', 'f9d65bdb-6984-4fed-86ca-e485f3b44626', 0)
ON CONFLICT (almacen_id, producto_id) DO UPDATE SET cantidad = 0, updated_at = now();
