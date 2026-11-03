import { describe, it, expect } from 'vitest';
import { parseFechaTeclado } from '@/lib/parseFechaTeclado';

describe('parseFechaTeclado', () => {
  it('acepta los formatos comunes', () => {
    expect(parseFechaTeclado('05/03/2024')).toBe('2024-03-05');
    expect(parseFechaTeclado('5/3/2024')).toBe('2024-03-05');
    expect(parseFechaTeclado('5-3-24')).toBe('2024-03-05');
    expect(parseFechaTeclado('05.03.1998')).toBe('1998-03-05');
    expect(parseFechaTeclado('05032024')).toBe('2024-03-05');
    expect(parseFechaTeclado('2024-03-05')).toBe('2024-03-05');
    expect(parseFechaTeclado(' 29/02/2024 ')).toBe('2024-02-29');
  });
  it('rechaza fechas inválidas', () => {
    expect(parseFechaTeclado('')).toBeNull();
    expect(parseFechaTeclado('31/02/2024')).toBeNull();
    expect(parseFechaTeclado('29/02/2023')).toBeNull();
    expect(parseFechaTeclado('13/13/2024')).toBeNull();
    expect(parseFechaTeclado('hola')).toBeNull();
  });
});
