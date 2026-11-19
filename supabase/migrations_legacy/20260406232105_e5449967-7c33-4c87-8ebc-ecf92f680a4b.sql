
-- Fix Agua natural 600ml: should be 6 not 5
-- Correct both productos.cantidad and stock_almacen (Almacén Andrey holds all remaining stock)
UPDATE productos SET cantidad = 6 WHERE id = '96bdc3b8-feeb-4d64-902a-d4856ef716c0';
UPDATE stock_almacen SET cantidad = 6, updated_at = now() WHERE id = '6c92b83c-99b9-4fe8-9f78-693fe2e499af';
