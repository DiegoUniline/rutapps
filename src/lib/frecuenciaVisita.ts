/**
 * Reglas de frecuencia de visita.
 *
 * El campo `frecuencia` del cliente (diaria | semanal | quincenal | mensual)
 * antes solo era informativo: la ruta se armaba únicamente con `dia_visita`,
 * así que un cliente quincenal aparecía cada 8 días.
 *
 * Regla acordada (semanas alternadas):
 *  - diaria / semanal  → siempre que sea su día.
 *  - quincenal         → su día, una semana sí y una no (última visita ≥ 8 días).
 *  - mensual           → su día, una vez al mes (última visita ≥ 24 días).
 *  - Sin visitas previas → siempre aparece (cliente pendiente).
 */

export type FrecuenciaVisitaValor = 'diaria' | 'semanal' | 'quincenal' | 'mensual';

/** Días mínimos que deben pasar desde la última visita para volver a aparecer. */
export const DIAS_MINIMOS_FRECUENCIA: Record<string, number> = {
  diaria: 0,
  semanal: 0,
  quincenal: 8,
  mensual: 24,
};

export function diasMinimosFrecuencia(frecuencia?: string | null): number {
  const key = (frecuencia ?? '').toString().trim().toLowerCase();
  return DIAS_MINIMOS_FRECUENCIA[key] ?? 0;
}

function toDayStart(value: string | Date): number | null {
  const d = typeof value === 'string'
    ? new Date(value.length === 10 ? `${value}T12:00:00` : value)
    : new Date(value);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Días completos entre dos fechas (ignora la hora). */
export function diasEntre(desde: string | Date, hasta: string | Date): number | null {
  const a = toDayStart(desde);
  const b = toDayStart(hasta);
  if (a == null || b == null) return null;
  return Math.round((b - a) / 86_400_000);
}

/**
 * ¿Le toca visita hoy según su frecuencia?
 * `ultimaVisita` es la fecha de la última visita o venta registrada (ISO o YYYY-MM-DD).
 * Devuelve true cuando no hay historial o cuando ya pasó el intervalo de la frecuencia.
 */
export function tocaVisitaPorFrecuencia(
  frecuencia?: string | null,
  ultimaVisita?: string | Date | null,
  hoy: string | Date = new Date(),
): boolean {
  const minimo = diasMinimosFrecuencia(frecuencia);
  if (minimo <= 0) return true;
  if (!ultimaVisita) return true;
  const dias = diasEntre(ultimaVisita, hoy);
  if (dias == null) return true;
  return dias >= minimo;
}

/** Etiqueta corta para mostrar en la ficha del cliente. */
export function etiquetaFrecuencia(frecuencia?: string | null): string | null {
  const key = (frecuencia ?? '').toString().trim().toLowerCase();
  if (key === 'quincenal') return 'Quincenal';
  if (key === 'mensual') return 'Mensual';
  return null;
}
