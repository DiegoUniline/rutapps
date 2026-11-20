import { puedeReemplazarFormulario } from '@/lib/formSync';

describe('puedeReemplazarFormulario', () => {
  it('primera carga (el original aún no es un registro): reemplaza', () => {
    const vacio: { id?: string; nombre: string } = { nombre: '' };
    expect(puedeReemplazarFormulario(vacio, vacio, { id: 'a' })).toBe(true);
  });

  it('sin cambios sin guardar: toma la versión nueva del servidor', () => {
    const original = { id: 'a', nombre: 'Coca' };
    expect(puedeReemplazarFormulario({ ...original }, original, { id: 'a' })).toBe(true);
  });

  it('con cambios sin guardar: no los pisa', () => {
    const original = { id: 'a', nombre: 'Coca' };
    expect(puedeReemplazarFormulario({ id: 'a', nombre: 'Coca 600' }, original, { id: 'a' })).toBe(false);
  });

  it('si llega otro registro (cambió la URL): reemplaza', () => {
    const original = { id: 'a', nombre: 'Coca' };
    expect(puedeReemplazarFormulario({ id: 'a', nombre: 'Coca 600' }, original, { id: 'b' })).toBe(true);
  });
});
