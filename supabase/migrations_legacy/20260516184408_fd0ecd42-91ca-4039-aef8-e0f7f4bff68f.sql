-- Corrige el stock duplicado de la entrega 22cc213b en Mi Empresa Demo:
-- la entrega se descontó dos veces (frontend + trigger). Restauramos el camión a 0.
UPDATE public.stock_almacen
SET cantidad = 0, updated_at = now()
WHERE empresa_id = '6d849e12-6437-4b24-917d-a89cc9b2fa88'
  AND almacen_id = 'b4ef47bf-b803-4701-8bb5-dd5f64c27c4f'
  AND producto_id IN ('7638fc5c-f77b-4aa7-bb02-239945492aad','e2b9af2f-19a1-48f7-b86f-acd3fac5ba0f');