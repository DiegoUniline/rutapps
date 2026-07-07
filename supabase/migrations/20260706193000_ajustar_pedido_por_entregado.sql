-- ============================================================================
-- entrega_lineas.motivo_no_entrega — columna necesaria para "quitar producto
-- por línea" en el móvil (PR #59). Guarda el motivo del rechazo por línea.
--
-- NOTA: este archivo originalmente traía también un trigger
-- (ajustar_pedido_por_entregado) que ajustaba el saldo de TODOS los pedidos a
-- lo entregado, SIN la protección de política por empresa y SIN probar. Ese
-- trigger se RETIRÓ: la lógica de "cobrar lo entregado" se hace en la Fase 1,
-- gated por empresas.politica_cobro y probada en pedido de control. Aquí se
-- deja el DROP idempotente por si esa versión prematura alcanzó a aplicarse.
-- ============================================================================

ALTER TABLE public.entrega_lineas
  ADD COLUMN IF NOT EXISTS motivo_no_entrega text;

-- Desactivar el trigger prematuro de Fase 1 si llegó a crearse.
DROP TRIGGER IF EXISTS trg_ajustar_pedido_por_entregado ON public.entregas;
DROP FUNCTION IF EXISTS public.ajustar_pedido_por_entregado();
