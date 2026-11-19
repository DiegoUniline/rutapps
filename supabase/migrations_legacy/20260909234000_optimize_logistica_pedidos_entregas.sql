-- Optimiza las vistas Logística > Pedidos y Logística > Entregas cuando se
-- consulta un histórico grande o se filtra por fecha/estado.
--
-- Los nombres son específicos de esta optimización para que la migración sea
-- idempotente. PostgreSQL puede seguir eligiendo otro índice si resulta mejor.

-- Pedidos: la pantalla siempre limita ventas a tipo='pedido' y empresa.
CREATE INDEX IF NOT EXISTS idx_ventas_logistica_pedidos_fecha
  ON public.ventas (empresa_id, fecha DESC)
  WHERE tipo = 'pedido';

CREATE INDEX IF NOT EXISTS idx_ventas_logistica_pedidos_fecha_entrega
  ON public.ventas (empresa_id, fecha_entrega DESC)
  WHERE tipo = 'pedido' AND fecha_entrega IS NOT NULL;

-- Entregas: carga de histórico completo, pestañas de estado y rango programado.
CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_created_at
  ON public.entregas (empresa_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_fecha
  ON public.entregas (empresa_id, fecha DESC);

CREATE INDEX IF NOT EXISTS idx_entregas_logistica_empresa_status
  ON public.entregas (empresa_id, status);

-- Resolver las entregas asociadas a lotes de pedidos sin escanear la tabla.
CREATE INDEX IF NOT EXISTS idx_entregas_logistica_pedido_id
  ON public.entregas (pedido_id)
  WHERE pedido_id IS NOT NULL;

-- El detalle de productos se carga bajo demanda al expandir una entrega.
CREATE INDEX IF NOT EXISTS idx_entrega_lineas_logistica_entrega_id
  ON public.entrega_lineas (entrega_id);
