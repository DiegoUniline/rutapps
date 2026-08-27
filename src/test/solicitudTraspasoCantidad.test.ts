import { describe, expect, it } from 'vitest';
import { cantidadBaseSolicitud, cantidadPendienteSolicitud } from '@/lib/solicitudTraspasoCantidad';

describe('cantidades de solicitud de traspaso', () => {
  it('usa lo solicitado mientras la solicitud está en borrador', () => {
    expect(cantidadBaseSolicitud('borrador', 40, 0)).toBe(40);
  });

  it('respeta cero como cantidad aprobada', () => {
    expect(cantidadBaseSolicitud('solicitada', 40, 0)).toBe(0);
    expect(cantidadBaseSolicitud('aprobada', 40, 0)).toBe(0);
  });

  it('no revive cantidades en cero al calcular pendientes', () => {
    expect(cantidadPendienteSolicitud('aprobada', 40, 0, 0)).toBe(0);
  });

  it('calcula sólo el pendiente aprobado', () => {
    expect(cantidadPendienteSolicitud('parcialmente_surtida', 40, 25, 10)).toBe(15);
  });
});

