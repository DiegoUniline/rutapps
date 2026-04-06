
-- Fix Multi empresa: Almacén Andrey has inflated stock, set to global qty since General is 0
-- Agua natural 600ml: Andrey 14 → 5
UPDATE stock_almacen SET cantidad = 5, updated_at = now() 
WHERE id = '6c92b83c-99b9-4fe8-9f78-693fe2e499af';

-- Jugo naranja 50ml: Andrey 13 → 4
UPDATE stock_almacen SET cantidad = 4, updated_at = now()
WHERE id = 'bf6c7414-bb29-4429-acf1-140c17e62205';

-- Limpiador de lente 70ml: Andrey 23 → 16
UPDATE stock_almacen SET cantidad = 16, updated_at = now()
WHERE id = '90fc48ea-3ca7-4f03-9784-6860f43c27c8';

-- Fix Demo empresa: Pan Blanco Bimbo - Camioneta Ruta 2: 70 → 68
UPDATE stock_almacen SET cantidad = 68, updated_at = now()
WHERE id = 'd6137841-a624-4529-ba24-780461b14ce2';
