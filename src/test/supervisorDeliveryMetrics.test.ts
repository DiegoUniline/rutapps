import { describe, expect, it } from 'vitest';
import {
  actualDeliveryTimestamp,
  isPendingDeliveryThrough,
  wasDeliveredInRange,
} from '@/lib/supervisorDeliveryMetrics';
import { zonedDayRangeISO } from '@/lib/utils';

const today = {
  start: '2026-09-08T06:00:00.000Z',
  end: '2026-09-09T05:59:59.000Z',
};

describe('métricas de entrega del supervisor', () => {
  it('cuenta hoy una entrega atrasada que realmente se completó hoy', () => {
    const row = {
      status: 'hecho',
      fecha: '2026-09-06',
      fecha_entrega: '2026-09-08T18:30:00.000Z',
    };

    expect(wasDeliveredInRange(row, today)).toBe(true);
    expect(isPendingDeliveryThrough(row, '2026-09-08')).toBe(false);
  });

  it('no atribuye a hoy una entrega solo por estar programada hoy', () => {
    expect(wasDeliveredInRange({
      status: 'hecho',
      fecha: '2026-09-08',
      fecha_entrega: '2026-09-07T18:30:00.000Z',
    }, today)).toBe(false);
  });

  it('mantiene en pendientes una entrega vencida que todavía no se completa', () => {
    expect(isPendingDeliveryThrough({
      status: 'en_ruta',
      fecha: '2026-09-06',
      fecha_entrega: null,
    }, '2026-09-08')).toBe(true);
  });

  it('excluye canceladas, no entregadas y entregas futuras de los pendientes', () => {
    expect(isPendingDeliveryThrough({ status: 'cancelado', fecha: '2026-09-01' }, '2026-09-08')).toBe(false);
    expect(isPendingDeliveryThrough({ status: 'no_entregado', fecha: '2026-09-01' }, '2026-09-08')).toBe(false);
    expect(isPendingDeliveryThrough({ status: 'listo', fecha: '2026-09-09' }, '2026-09-08')).toBe(false);
  });

  it('usa validado_at únicamente como respaldo histórico', () => {
    const legacy = {
      status: 'hecho',
      fecha: '2026-09-01',
      fecha_entrega: null,
      validado_at: '2026-09-08T20:00:00.000Z',
    };

    expect(actualDeliveryTimestamp(legacy)).toBe(legacy.validado_at);
    expect(wasDeliveredInRange(legacy, today)).toBe(true);
  });

  it('no inventa una fecha real cuando no existe evidencia de cierre', () => {
    expect(actualDeliveryTimestamp({
      status: 'hecho',
      fecha: '2026-09-08',
      fecha_entrega: null,
      validado_at: null,
    })).toBeNull();
  });

  it('incluye hasta el último milisegundo del día local', () => {
    const range = zonedDayRangeISO('2026-09-08', 'America/Mexico_City');
    expect(range.end).toBe('2026-09-09T05:59:59.999Z');
    expect(wasDeliveredInRange({
      status: 'hecho',
      fecha_entrega: '2026-09-09T05:59:59.999Z',
    }, range)).toBe(true);
  });
});
