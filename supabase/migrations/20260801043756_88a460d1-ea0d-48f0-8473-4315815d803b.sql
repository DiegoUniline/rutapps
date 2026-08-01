BEGIN;

-- Borrar visitas (que bloqueaban borrar clientes)
DELETE FROM public.visitas WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';

-- Transacciones
DELETE FROM public.entrega_lineas WHERE entrega_id IN (SELECT id FROM public.entregas WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec');
DELETE FROM public.entregas WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';
DELETE FROM public.cobros WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';
DELETE FROM public.venta_lineas WHERE venta_id IN (SELECT id FROM public.ventas WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec');
DELETE FROM public.ventas WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';
DELETE FROM public.compra_lineas WHERE compra_id IN (SELECT id FROM public.compras WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec');
DELETE FROM public.compras WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';
DELETE FROM public.ajustes_inventario WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';
DELETE FROM public.lotes WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';

-- Entidades base
DELETE FROM public.clientes WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';
DELETE FROM public.productos WHERE empresa_id = 'ceddb9bd-9e49-43d0-9a4b-a83a3f1a55ec';

COMMIT;