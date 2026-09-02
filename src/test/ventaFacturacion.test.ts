import { describe, expect, it } from 'vitest';
import { getVentaFacturacion } from '@/lib/ventaFacturacion';

describe('getVentaFacturacion', () => {
  it('marca una venta cuando el cliente requiere factura y muestra su RFC fiscal', () => {
    expect(getVentaFacturacion({
      requiere_factura: false,
      clientes: {
        requiere_factura: true,
        rfc: 'rfc-general',
        facturama_rfc: ' fis010101abc ',
      },
    })).toEqual({
      requiereFactura: true,
      rfc: 'FIS010101ABC',
      estado: 'lista',
    });
  });

  it('conserva la intención histórica guardada en la venta', () => {
    expect(getVentaFacturacion({
      requiere_factura: true,
      clientes: { requiere_factura: false, rfc: 'abc010101abc' },
    })).toEqual({
      requiereFactura: true,
      rfc: 'ABC010101ABC',
      estado: 'lista',
    });
  });

  it('advierte cuando requiere factura pero no tiene RFC', () => {
    expect(getVentaFacturacion({
      requiere_factura: true,
      clientes: { requiere_factura: true, rfc: '   ' },
    }).estado).toBe('rfc_pendiente');
  });

  it('no infiere que requiere factura únicamente por tener RFC', () => {
    expect(getVentaFacturacion({
      requiere_factura: false,
      clientes: { requiere_factura: false, rfc: 'ABC010101ABC' },
    })).toEqual({
      requiereFactura: false,
      rfc: 'ABC010101ABC',
      estado: 'no_requiere',
    });
  });
});
