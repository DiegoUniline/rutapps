/**
 * IndexedDB no interpreta un `put` parcial como PostgreSQL interpreta un
 * `UPDATE`: reemplaza la fila completa. Mantener este merge aislado evita que
 * una reparación local borre folio, total, saldo u otros campos ya descargados.
 */
export function mergeLocalRow<T extends Record<string, unknown>>(
  current: T | undefined,
  patch: Partial<T>,
): T {
  return { ...(current ?? {} as T), ...patch } as T;
}
