import type { StatusSolicitudTraspaso } from '@/hooks/useSolicitudesTraspaso';

/**
 * En borrador todavía manda lo solicitado. Desde que se envía a aprobación,
 * manda exclusivamente lo aprobado: cero es una decisión válida.
 */
export function cantidadBaseSolicitud(
  status: StatusSolicitudTraspaso,
  cantidadSolicitada: number,
  cantidadAprobada: number,
): number {
  return status === 'borrador'
    ? Math.max(0, Number(cantidadSolicitada) || 0)
    : Math.max(0, Number(cantidadAprobada) || 0);
}

export function cantidadPendienteSolicitud(
  status: StatusSolicitudTraspaso,
  cantidadSolicitada: number,
  cantidadAprobada: number,
  cantidadSurtida: number,
): number {
  return Math.max(
    0,
    cantidadBaseSolicitud(status, cantidadSolicitada, cantidadAprobada)
      - Math.max(0, Number(cantidadSurtida) || 0),
  );
}

