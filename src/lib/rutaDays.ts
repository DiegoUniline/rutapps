export const RUTA_DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

export function normalizeRutaDia(value?: string | null): string {
  return (value ?? '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function diaFromDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00`);
  return RUTA_DIAS[date.getDay()];
}

export function clienteTieneDia(cliente: { dia_visita?: string[] | null }, dia?: string | null): boolean {
  const target = normalizeRutaDia(dia);
  if (!target || !Array.isArray(cliente.dia_visita)) return false;
  return cliente.dia_visita.some(d => normalizeRutaDia(d) === target);
}