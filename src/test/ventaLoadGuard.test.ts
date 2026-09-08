import { describe, expect, it } from 'vitest';
import { createVentaLoadError } from '@/lib/ventaLoadGuard';

describe('createVentaLoadError', () => {
  it('conserva el mensaje de un error de red', () => {
    expect(createVentaLoadError(new Error('Failed to fetch'), false).message).toBe('Failed to fetch');
  });

  it('extrae el mensaje de un error plano de PostgREST', () => {
    expect(createVentaLoadError({ message: 'statement timeout' }, false).message).toBe('statement timeout');
  });

  it('distingue una venta inexistente de una pantalla vacía', () => {
    expect(createVentaLoadError(null, true).message).toContain('no existe');
  });

  it('explica cuando no existe respaldo offline', () => {
    expect(createVentaLoadError(null, false).message).toContain('sin conexión');
  });
});
