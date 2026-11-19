import { describe, it, expect } from 'vitest';
import { parseExcedente } from '@/lib/excedente';
import { saldoFavorDisponible } from '@/lib/saldoFavor';

describe('parseExcedente', () => {
  it('lee monto y mensaje del error de la BD', () => {
    const r = parseExcedente('EXCEDENTE|50.00|El nuevo total (150.00) queda abajo de lo ya pagado (200.00).');
    expect(r).toEqual({ monto: 50, mensaje: 'El nuevo total (150.00) queda abajo de lo ya pagado (200.00).' });
  });
  it('tolera prefijos agregados por el cliente', () => {
    expect(parseExcedente('Error: EXCEDENTE|12.5|x')?.monto).toBe(12.5);
  });
  it('ignora otros errores', () => {
    expect(parseExcedente('La venta cambió en otro dispositivo')).toBeNull();
    expect(parseExcedente(undefined)).toBeNull();
    expect(parseExcedente('EXCEDENTE|abc|x')).toBeNull();
  });
});

describe('saldoFavorDisponible', () => {
  it('nunca es negativo', () => {
    expect(saldoFavorDisponible(50, 80)).toBe(0);
    expect(saldoFavorDisponible(120.5, 20.25)).toBe(100.25);
  });
});
