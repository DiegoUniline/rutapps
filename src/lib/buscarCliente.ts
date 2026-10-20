type ClienteBuscable = { nombre?: string | null; codigo?: string | null; contacto?: string | null };

/** ¿El cliente coincide con la búsqueda? Por nombre, código o persona de contacto (y campos extra). */
export function clienteCoincide(c: ClienteBuscable, busqueda: string, extra: (string | null | undefined)[] = []): boolean {
  const q = busqueda.trim().toLowerCase();
  if (!q) return true;
  return [c.nombre, c.codigo, c.contacto, ...extra].some(v => (v ?? '').toLowerCase().includes(q));
}

/** Texto de búsqueda para selectores (SearchableSelect.searchText). */
export function clienteTextoBusqueda(c: ClienteBuscable): string {
  return [c.codigo, c.nombre, c.contacto].filter(Boolean).join(' ');
}
