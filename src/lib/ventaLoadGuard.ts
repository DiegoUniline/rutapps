type MessageLike = { message?: unknown };

function messageFromUnknown(value: unknown): string | null {
  if (value instanceof Error && value.message.trim()) return value.message;
  if (value && typeof value === 'object') {
    const message = (value as MessageLike).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

/**
 * Convierte cualquier fallo de PostgREST/red en un Error visible para React
 * Query. Nunca permite que una consulta fallida se confunda con una venta
 * nueva vacía.
 */
export function createVentaLoadError(
  serverError: unknown,
  serverRespondedWithoutVenta: boolean,
): Error {
  const serverMessage = messageFromUnknown(serverError);
  if (serverMessage) return new Error(serverMessage);
  if (serverError) return new Error('No fue posible consultar la venta en el servidor.');
  if (serverRespondedWithoutVenta) {
    return new Error('La venta no existe o no tienes permiso para verla.');
  }
  return new Error('La venta no está disponible sin conexión. Sincroniza y vuelve a intentarlo.');
}
