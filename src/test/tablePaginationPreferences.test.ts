import { beforeEach, describe, expect, it } from 'vitest';
import {
  readStoredPageSizeFor,
  writeStoredPageSizeFor,
} from '@/hooks/useTablePagination';

describe('preferencias de paginación por módulo', () => {
  beforeEach(() => localStorage.clear());

  it('permite que una tabla pesada ignore el valor global Todos', () => {
    localStorage.setItem('table-page-size', 'all');

    expect(readStoredPageSizeFor('ventas', false)).toBe(50);
  });

  it('conserva la preferencia propia de Ventas', () => {
    localStorage.setItem('table-page-size', 'all');
    localStorage.setItem('table-page-size:ventas', '100');

    expect(readStoredPageSizeFor('ventas', false)).toBe(100);
  });

  it('no contamina las demás tablas al cambiar Ventas', () => {
    localStorage.setItem('table-page-size', '200');

    writeStoredPageSizeFor(25, 'ventas', false);

    expect(localStorage.getItem('table-page-size:ventas')).toBe('25');
    expect(localStorage.getItem('table-page-size')).toBe('200');
  });
});
