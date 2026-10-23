import { describe, it, expect } from 'vitest';
import { mergeBloqueOrden } from '@/lib/ordenRuta';

describe('orden de ruta zona tras zona', () => {
  const centro = ['c1', 'c2', 'c3'];
  const norte = ['n1', 'n2'];

  it('una zona nueva se agrega al final sin borrar la anterior', () => {
    expect(mergeBloqueOrden(centro, norte)).toEqual(['c1', 'c2', 'c3', 'n1', 'n2']);
  });

  it('re-optimizar una zona solo reordena su bloque, en su mismo lugar', () => {
    expect(mergeBloqueOrden([...centro, ...norte], ['c3', 'c1', 'c2'])).toEqual(['c3', 'c1', 'c2', 'n1', 'n2']);
    expect(mergeBloqueOrden([...centro, ...norte], ['n2', 'n1'])).toEqual(['c1', 'c2', 'c3', 'n2', 'n1']);
  });

  it('un cliente que entra a la zona se integra al bloque y no se duplica', () => {
    expect(mergeBloqueOrden([...centro, ...norte], ['n2', 'c2', 'n1'])).toEqual(['c1', 'n2', 'c2', 'n1', 'c3']);
  });

  it('sin orden previo queda el nuevo', () => {
    expect(mergeBloqueOrden([], centro)).toEqual(centro);
  });
});
