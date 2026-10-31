import { describe, it, expect } from 'vitest';
import { diaRutaCanonico, diaRutaVariantes } from '@/lib/rutaDays';

describe('día canónico de cliente_orden_ruta', () => {
  it('celular y escritorio escriben igual', () => {
    expect(diaRutaCanonico('sábado')).toBe('Sábado');
    expect(diaRutaCanonico('Sábado')).toBe('Sábado');
    expect(diaRutaCanonico('miercoles')).toBe('Miércoles');
    expect(diaRutaCanonico(null)).toBeNull();
    expect(diaRutaCanonico('')).toBeNull();
  });
  it('lee todas las escrituras del día', () => {
    expect(diaRutaVariantes('Sábado').sort()).toEqual(['Sabado', 'Sábado', 'sabado', 'sábado'].sort());
    expect(diaRutaVariantes('lunes').sort()).toEqual(['Lunes', 'lunes'].sort());
    expect(diaRutaVariantes(null)).toEqual([]);
  });
});
