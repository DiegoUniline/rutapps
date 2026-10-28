import { describe, it, expect } from 'vitest';
import { itemFacturama, totalesCfdi, erroresLinea, type LineaCfdiInput } from '../../supabase/functions/_shared/cfdiImpuestos';

const base: LineaCfdiInput = {
  descripcion: 'Refresco', product_code: '50202306', unit_code: 'H87', unit_name: 'Pieza',
  cantidad: 10, precio_unitario: 10, descuento: 0,
  tiene_iva: true, iva_pct: 16, ieps_pct: 0, ieps_tipo: 'porcentaje', iva_sin_iva: null,
};

describe('motor de impuestos CFDI', () => {
  it('IVA 16% simple', () => {
    const it_ = itemFacturama(base);
    expect(it_.Subtotal).toBe(100);
    expect(it_.TaxObject).toBe('02');
    expect(it_.Taxes).toEqual([{ Name: 'IVA', Base: 100, Rate: 0.16, Total: 16, IsRetention: false }]);
    expect(it_.Total).toBe(116);
  });

  it('IEPS por tasa entra en la base del IVA', () => {
    const it_ = itemFacturama({ ...base, ieps_pct: 8 });
    expect(it_.Taxes?.[0]).toMatchObject({ Name: 'IEPS', Base: 100, Rate: 0.08, Total: 8 });
    expect(it_.Taxes?.[1]).toMatchObject({ Name: 'IVA', Base: 108, Total: 17.28 });
    expect(it_.Total).toBe(125.28);
  });

  it('IEPS por cuota usa IsQuota y cantidad como base', () => {
    const it_ = itemFacturama({ ...base, ieps_pct: 1.5, ieps_tipo: 'cuota' });
    expect(it_.Taxes?.[0]).toEqual({ Name: 'IEPS', Base: 10, Rate: 1.5, Total: 15, IsRetention: false, IsQuota: true });
    expect(it_.Taxes?.[1]).toMatchObject({ Name: 'IVA', Base: 115, Total: 18.4 });
  });

  it('descuento va en Discount y reduce la base', () => {
    const it_ = itemFacturama({ ...base, descuento: 20 });
    expect(it_.Discount).toBe(20);
    expect(it_.Taxes?.[0]).toMatchObject({ Base: 80, Total: 12.8 });
    expect(it_.Total).toBe(92.8);
  });

  it('IVA 0% es objeto 02 con tasa 0', () => {
    const it_ = itemFacturama({ ...base, iva_pct: 0 });
    expect(it_.TaxObject).toBe('02');
    expect(it_.Taxes).toEqual([{ Name: 'IVA', Base: 100, Rate: 0, Total: 0, IsRetention: false }]);
  });

  it('sin IVA según el producto: exento, tasa 0 y no objeto', () => {
    expect(itemFacturama({ ...base, tiene_iva: false, iva_sin_iva: 'exento' }).Taxes?.[0].Name).toBe('IVA Exento');
    expect(itemFacturama({ ...base, tiene_iva: false, iva_sin_iva: 'tasa0' }).Taxes?.[0]).toMatchObject({ Name: 'IVA', Rate: 0 });
    const noObj = itemFacturama({ ...base, tiene_iva: false, iva_sin_iva: 'no_objeto' });
    expect(noObj.TaxObject).toBe('01');
    expect(noObj.Taxes).toBeUndefined();
    expect(noObj.Total).toBe(100);
  });

  it('producto sin IVA y sin elegir tratamiento no pasa el preflight', () => {
    expect(erroresLinea({ ...base, tiene_iva: false })).toHaveLength(1);
    expect(erroresLinea(base)).toHaveLength(0);
    expect(erroresLinea({ ...base, product_code: '01010101' })).toHaveLength(1);
  });

  it('totales suman líneas', () => {
    const t = totalesCfdi([itemFacturama(base), itemFacturama({ ...base, ieps_pct: 8, descuento: 10 })]);
    expect(t).toEqual({ subtotal: 200, descuento: 10, iva: 31.55, ieps: 7.2, total: 228.75 });
  });
});

import { agruparImpuestos, impuestosProporcionales, fechaLimiteRep, formaPagoSat, repartirAplicacion } from '../../supabase/functions/_shared/cfdiImpuestos';

describe('REP y global', () => {
  it('agrupa impuestos por nombre y tasa', () => {
    const g = agruparImpuestos([itemFacturama(base), itemFacturama({ ...base, ieps_pct: 8 }), itemFacturama({ ...base, iva_pct: 0 })]);
    expect(g).toEqual([
      { Name: 'IVA', Rate: 0.16, Base: 208, Total: 33.28 },
      { Name: 'IEPS', Rate: 0.08, Base: 100, Total: 8 },
      { Name: 'IVA', Rate: 0, Base: 100, Total: 0 },
    ]);
  });

  it('impuestos del REP en proporción a lo pagado', () => {
    const det = agruparImpuestos([itemFacturama(base)]); // total 116
    expect(impuestosProporcionales(det, 58, 116)).toEqual([{ Name: 'IVA', Rate: 0.16, Base: 50, Total: 8, IsRetention: false }]);
  });

  it('fecha límite día 5 del mes siguiente', () => {
    expect(fechaLimiteRep('2026-10-28')).toBe('2026-11-05');
    expect(fechaLimiteRep('2026-12-02')).toBe('2027-01-05');
  });

  it('forma de pago según método del cobro', () => {
    expect(formaPagoSat('Efectivo')).toBe('01');
    expect(formaPagoSat('transferencia')).toBe('03');
    expect(formaPagoSat('saldo_favor')).toBeNull();
  });

  it('reparte un cobro entre facturas de la venta en proporción', () => {
    // venta 36,000 con dos facturas PPD de 2,000 y 34,000; cobro de 9,000
    expect(repartirAplicacion(9000, 36000, [{ cfdi_id: 'a', importe: 2000 }, { cfdi_id: 'b', importe: 34000 }]))
      .toEqual([{ cfdi_id: 'a', pagado: 500 }, { cfdi_id: 'b', pagado: 8500 }]);
    // parte no facturada no genera REP
    expect(repartirAplicacion(1000, 4000, [{ cfdi_id: 'a', importe: 2000 }])).toEqual([{ cfdi_id: 'a', pagado: 500 }]);
  });

  it('global no revisa clave/unidad SAT fijas', () => {
    expect(erroresLinea({ ...base, product_code: '01010101', unit_code: 'ACT', unit_name: 'Actividad' }, { global: true })).toHaveLength(0);
  });
});
