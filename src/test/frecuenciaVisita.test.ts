import { describe, it, expect } from 'vitest';
import { tocaVisitaPorFrecuencia, diasEntre, etiquetaFrecuencia } from '@/lib/frecuenciaVisita';

describe('frecuenciaVisita', () => {
  const hoy = '2026-08-03';

  it('semanal siempre toca', () => {
    expect(tocaVisitaPorFrecuencia('semanal', '2026-08-02', hoy)).toBe(true);
    expect(tocaVisitaPorFrecuencia('diaria', '2026-08-03', hoy)).toBe(true);
  });

  it('quincenal se salta la semana siguiente a su última visita', () => {
    expect(tocaVisitaPorFrecuencia('quincenal', '2026-07-27', hoy)).toBe(false); // 7 días
    expect(tocaVisitaPorFrecuencia('quincenal', '2026-07-26', hoy)).toBe(true);  // 8 días
    expect(tocaVisitaPorFrecuencia('quincenal', '2026-07-20', hoy)).toBe(true);  // 14 días
  });

  it('mensual espera ~24 días', () => {
    expect(tocaVisitaPorFrecuencia('mensual', '2026-07-20', hoy)).toBe(false);
    expect(tocaVisitaPorFrecuencia('mensual', '2026-07-01', hoy)).toBe(true);
  });

  it('sin historial siempre toca', () => {
    expect(tocaVisitaPorFrecuencia('quincenal', null, hoy)).toBe(true);
    expect(tocaVisitaPorFrecuencia('mensual', undefined, hoy)).toBe(true);
  });

  it('diasEntre cuenta días completos', () => {
    expect(diasEntre('2026-07-27T23:00:00Z', '2026-08-03T01:00:00Z')).toBeGreaterThanOrEqual(6);
    expect(diasEntre('nope', hoy)).toBeNull();
  });

  it('etiquetas', () => {
    expect(etiquetaFrecuencia('quincenal')).toBe('Quincenal');
    expect(etiquetaFrecuencia('semanal')).toBeNull();
  });
});
