
DELETE FROM venta_lineas WHERE venta_id IN (SELECT id FROM ventas WHERE empresa_id='6d849e12-6437-4b24-917d-a89cc9b2fa88' AND notas LIKE 'TEST-VD%');
DELETE FROM ventas WHERE empresa_id='6d849e12-6437-4b24-917d-a89cc9b2fa88' AND notas LIKE 'TEST-VD%';
