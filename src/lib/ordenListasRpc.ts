/**
 * Listas blancas de orden por columna para las listas de logística paginadas por RPC.
 * Deben coincidir con las claves que acepta cada función en la BD
 * (supabase/migrations/20261122000000_orden_columnas_logistica.sql); una clave fuera de la lista
 * no se envía (la lista queda en su orden de siempre) y la BD la rechazaría con error 22023.
 */

/** fn_logistica_entregas_workspace_v3 (Entregas). */
export const ORDEN_ENTREGAS = [
  'folio', 'pedido', 'cliente', 'vendedor', 'origen', 'destino', 'ruta',
  'fecha_pedido', 'fecha', 'fecha_entrega', 'created_at', 'status',
] as const;

/** fn_logistica_pedidos_page_v5 (Demanda). */
export const ORDEN_DEMANDA = [
  'folio', 'cliente', 'vendedor', 'fecha', 'repartidor', 'fecha_programada', 'fecha_entrega',
  'total', 'surtido', 'entregado', 'pendiente', 'estado',
] as const;

/** fn_logistica_concentrado_pedidos_v4 (Concentrado de surtido, vista «Pedidos»). */
export const ORDEN_CONCENTRADO_PEDIDOS = [
  'fecha_entrega', 'folio', 'cliente', 'vendedor', 'tipo', 'status',
  'requerido', 'entregado', 'pendiente', 'surtido_status',
] as const;
