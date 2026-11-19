-- Datos de prueba (solo licencia 12324489): pasar 5 ventas con saldo y con
-- cobros registrados por OTRO usuario al vendedor Diego, para validar que el
-- saldo se ve en /Ruta aunque el cobro no se descargue.
update public.ventas
set vendedor_id = 'f71fec41-33ac-409b-94b7-b30f502ef807', updated_at = now()
where id in (
  '19e3f5af-6469-5abd-967b-5a2002c7b45a',
  '1c1fb00b-5b11-7612-74f3-2d2b0c6bc5af',
  '247a0e4b-2fc3-6ed6-2008-3644d7df5f9e',
  '2c90d5e4-6ec8-15b5-7c26-8817e7d63f9c',
  '0963e5c3-f0ba-635d-85e9-9b118718f869'
);