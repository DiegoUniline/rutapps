import { describe, expect, it } from 'vitest';
import { origenDestinoMovimiento } from '@/lib/kardexOrigenDestino';

const ref = {
  almacenes: { A: 'Almacén Principal', C: 'Camión 1' },
  ventaCliente: { v1: { nombre: 'Tienda Sofía' } },
  entregaCliente: { e1: { nombre: 'Don Pepe' } },
  traspasoAlmacenes: { t1: { origen_id: 'A', destino_id: 'C' } },
};
const nom = () => undefined;

describe('origenDestinoMovimiento', () => {
  it('venta: salida con destino cliente', () => {
    expect(origenDestinoMovimiento({ tipo: 'salida', referencia_tipo: 'venta', referencia_id: 'v1', almacen_origen_id: 'A' }, ref, nom))
      .toEqual({ origen: 'Almacén Principal', destino: 'Cliente: Tienda Sofía' });
  });
  it('traspaso: salida muestra el almacén destino del traspaso', () => {
    expect(origenDestinoMovimiento({ tipo: 'salida', referencia_tipo: 'traspaso', referencia_id: 't1', almacen_origen_id: 'A' }, ref, nom).destino).toBe('Camión 1');
  });
  it('entrega: con destino es carga a camión; sin destino es cliente', () => {
    expect(origenDestinoMovimiento({ tipo: 'salida', referencia_tipo: 'entrega', referencia_id: 'e1', almacen_origen_id: 'A', almacen_destino_id: 'C' }, ref, nom).destino).toBe('Camión 1');
    expect(origenDestinoMovimiento({ tipo: 'salida', referencia_tipo: 'entrega', referencia_id: 'e1', almacen_origen_id: 'C' }, ref, nom).destino).toBe('Cliente: Don Pepe');
  });
  it('ajuste de salida: destino «Ajuste (baja)»', () => {
    expect(origenDestinoMovimiento({ tipo: 'salida', referencia_tipo: 'ajuste', almacen_origen_id: 'A' }, ref, nom).destino).toBe('Ajuste (baja)');
  });
});
