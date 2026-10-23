/**
 * Ruta del día "zona tras zona" (D-012): al optimizar solo una parte de los
 * clientes (p. ej. una zona), ese grupo se reordena DENTRO del orden ya guardado
 * para el mismo día y vendedor, en el lugar que ya ocupaba; si es nuevo, va al final.
 */
export function mergeBloqueOrden(guardado: string[], nuevo: string[]): string[] {
  const enNuevo = new Set(nuevo);
  const inicio = guardado.findIndex(id => enNuevo.has(id));
  const resto = guardado.filter(id => !enNuevo.has(id));
  if (inicio < 0) return [...resto, ...nuevo];
  // Antes de `inicio` no hay miembros del bloque: el bloque entra en esa posición.
  return [...resto.slice(0, inicio), ...nuevo, ...resto.slice(inicio)];
}
