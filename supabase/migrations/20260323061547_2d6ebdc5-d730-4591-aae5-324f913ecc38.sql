-- Move lineas from orphan tarifa 82b4bede to Lista General's tarifa dc07e82d
UPDATE tarifa_lineas
SET tarifa_id = 'dc07e82d-9405-4b04-9ae4-781c97209695'
WHERE tarifa_id = '82b4bede-dbe7-4726-8b30-d58d521b89b8';

-- Move clients from orphan tarifa to Lista General's tarifa
UPDATE clientes
SET tarifa_id = 'dc07e82d-9405-4b04-9ae4-781c97209695',
    lista_precio_id = COALESCE(lista_precio_id, 'b9ec454f-2477-43ea-8dec-9441d06f98ae')
WHERE tarifa_id = '82b4bede-dbe7-4726-8b30-d58d521b89b8'
  AND empresa_id = '6d849e12-6437-4b24-917d-a89cc9b2fa88';

-- Move ventas references too
UPDATE ventas
SET tarifa_id = 'dc07e82d-9405-4b04-9ae4-781c97209695'
WHERE tarifa_id = '82b4bede-dbe7-4726-8b30-d58d521b89b8';

-- Now delete orphan tarifa
DELETE FROM tarifas WHERE id = '82b4bede-dbe7-4726-8b30-d58d521b89b8';

-- Do the same for other empresas with orphan tarifas
-- Move lineas from orphan tarifa 2454c410 (empresa 6abc9c31) to bf556825
UPDATE tarifa_lineas
SET tarifa_id = 'bf556825-a39b-416e-99da-f20b55c7a631'
WHERE tarifa_id = '2454c410-a01c-48af-9306-197a68284721';

-- Move lineas from orphan tarifas for empresa 32a68089
-- e8e913a9 and 21f08b14 -> a263ed72 (which backs their lista)
UPDATE tarifa_lineas
SET tarifa_id = 'a263ed72-3bd2-49a5-8b99-64bc5bd321bb'
WHERE tarifa_id IN ('e8e913a9-541e-434a-8cf6-42f6a70ec3b5', '21f08b14-9dbd-4f27-bbf8-7fe2213c365e');