import { describe, it, expect } from 'vitest';
import { MANTENIMIENTO, bloqueadoPorMantenimiento } from '@/lib/mantenimiento';

describe('mantenimiento', () => {
  it('bloquea a todos menos a los permitidos mientras está activo', () => {
    const activo = MANTENIMIENTO.activo;
    MANTENIMIENTO.activo = true;
    expect(bloqueadoPorMantenimiento('diego.leon@uniline.mx')).toBe(false);
    expect(bloqueadoPorMantenimiento(' Diego.Leon@Uniline.mx ')).toBe(false);
    expect(bloqueadoPorMantenimiento('vendedor@cliente.com')).toBe(true);
    expect(bloqueadoPorMantenimiento(null)).toBe(true);
    MANTENIMIENTO.activo = false;
    expect(bloqueadoPorMantenimiento('vendedor@cliente.com')).toBe(false);
    MANTENIMIENTO.activo = activo;
  });
});
