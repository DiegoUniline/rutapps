-- Corregir cobro de Pulp Yodis: el monto registrado era 200 pero la venta cubierta fue 190 (10 era cambio devuelto).
UPDATE public.cobros
SET monto = 190
WHERE id = '50fce961-548b-422a-a66e-181b4bdd7131'
  AND monto = 200;