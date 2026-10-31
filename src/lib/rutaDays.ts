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
/** Escritura única del día en cliente_orden_ruta ("Sábado"). El escritorio guardaba "Sábado"
 *  y el celular "sábado": eran dos rutas distintas para el mismo día. */
const DIA_CANONICO: Record<string, string> = {
  lunes: 'Lunes', martes: 'Martes', miercoles: 'Miércoles', jueves: 'Jueves',
  viernes: 'Viernes', sabado: 'Sábado', domingo: 'Domingo',
};

export function diaRutaCanonico(dia?: string | null): string | null {
  const n = normalizeRutaDia(dia);
  if (!n) return null;
  return DIA_CANONICO[n] ?? (dia ?? '').trim();
}

/** Todas las escrituras con las que puede estar guardado un día (para leer y borrar). */
export function diaRutaVariantes(dia?: string | null): string[] {
  const c = diaRutaCanonico(dia);
  if (!c) return [];
  if (!DIA_CANONICO[normalizeRutaDia(c)]) return [c];
  const sinAcento = c.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return [...new Set([c, c.toLowerCase(), sinAcento, sinAcento.toLowerCase()])];
}
