import { describe, it, expect, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc } }));

describe('D-044 registros inactivos', () => {
  it('opcionesConAsignado: solo activos; el ya asignado inactivo se agrega marcado', async () => {
    const { opcionesConAsignado } = await import('@/lib/registrosInactivos');
    const activos = [{ value: 'a', label: 'Activo' }];
    expect(opcionesConAsignado(activos, null, 'X')).toEqual(activos);
    expect(opcionesConAsignado(activos, 'a', 'Activo')).toEqual(activos);
    const r = opcionesConAsignado(activos, 'b', 'Proveedor viejo');
    expect(r).toHaveLength(2);
    expect(r[1]).toMatchObject({ value: 'b', label: 'Proveedor viejo (inactivo)' });
    expect(opcionesConAsignado(activos, 'b', 'Juan', '(baja)')[1].label).toBe('Juan (baja)');
    // No duplica el sufijo si el nombre ya viene marcado.
    expect(opcionesConAsignado(activos, 'b', 'Prov (inactivo)')[1].label).toBe('Prov (inactivo)');
    expect(opcionesConAsignado(activos, 'b', '')[1].label).toBe('Registro (inactivo)');
  });

  it('mensajeEnUso agrupa por área y sugiere desactivar', async () => {
    const { mensajeEnUso } = await import('@/lib/registrosInactivos');
    const msg = mensajeEnUso([
      { registro_id: 'p1', tabla: 'compras', usos: 14 },
      { registro_id: 'p1', tabla: 'producto_proveedores', usos: 3 },
      { registro_id: 'p1', tabla: 'productos', usos: 2 },
      { registro_id: 'p1', tabla: 'pago_compras', usos: 1 },
    ]);
    expect(msg).toBe('Está en uso (14 compras, 5 productos, 1 pagos a proveedor); no se puede eliminar. Desactívalo en su lugar.');
    expect(mensajeEnUso([{ registro_id: 'x', tabla: 'venta_lineas', usos: 2 }], { cuantos: 1, total: 3, accion: 'Déjalos inactivos.' }))
      .toBe('1 de 3 seleccionados están en uso (2 ventas/pedidos); no se puede eliminar. Déjalos inactivos.');
  });

  it('validarSinUsos: null si nadie lo usa; mensaje si alguno está en uso', async () => {
    const { validarSinUsos } = await import('@/lib/registrosInactivos');
    rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await validarSinUsos('productos', ['p1'])).toBeNull();
    expect(rpc).toHaveBeenLastCalledWith('usos_de_registros', { p_tabla: 'productos', p_ids: ['p1'] });

    rpc.mockResolvedValueOnce({ data: [{ registro_id: 'p2', tabla: 'venta_lineas', usos: 5 }, { registro_id: 'p2', tabla: 'movimientos_inventario', usos: 0 }], error: null });
    expect(await validarSinUsos('productos', ['p1', 'p2'])).toContain('1 de 2 seleccionados están en uso (5 ventas/pedidos)');

    rpc.mockResolvedValueOnce({ data: null, error: new Error('sin red') });
    await expect(validarSinUsos('clientes', ['c1'])).rejects.toThrow('sin red');

    expect(await validarSinUsos('clientes', [])).toBeNull();
  });
  it('cobranza en ruta: activos siempre; inactivos/suspendidos solo si deben, marcados', async () => {
    const { clienteVisibleEnCobranza, marcaClienteNoActivo } = await import('@/lib/registrosInactivos');
    expect(clienteVisibleEnCobranza('activo', 0)).toBe(true);
    expect(clienteVisibleEnCobranza('inactivo', 0)).toBe(false);
    expect(clienteVisibleEnCobranza('inactivo', 150.5)).toBe(true);
    expect(clienteVisibleEnCobranza('suspendido', 10)).toBe(true);
    expect(clienteVisibleEnCobranza('inactivo', 0.001)).toBe(false);
    expect(marcaClienteNoActivo('activo')).toBeNull();
    expect(marcaClienteNoActivo('inactivo')).toBe('(inactivo)');
    expect(marcaClienteNoActivo('suspendido')).toBe('(suspendido)');
  });
});
