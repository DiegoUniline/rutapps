import { describe, it, expect } from 'vitest';
import { erroresReceptorCfdi } from '@/lib/cfdiReceptor';

const ok = { rfc: 'XEXX010101000', name: 'Cliente SA', fiscal_regime: '601', cfdi_use: 'G03', tax_zip_code: '06600' };
const pue = { payment_form: '01', payment_method: 'PUE' };

describe('CFDI 4.0: receptor y pago antes de timbrar', () => {
  it('completo: sin errores (persona moral y física)', () => {
    expect(erroresReceptorCfdi(ok, pue)).toEqual([]);
    expect(erroresReceptorCfdi({ ...ok, rfc: 'gome800101ab1' }, pue)).toEqual([]);
  });
  it('faltantes del receptor: RFC, nombre, régimen, CP y uso', () => {
    const e = erroresReceptorCfdi({ rfc: 'ABC', name: ' ', fiscal_regime: '', cfdi_use: '', tax_zip_code: '123' }, pue);
    expect(e).toHaveLength(5);
  });
  it('público en general exige 616 / S01', () => {
    expect(erroresReceptorCfdi({ ...ok, rfc: 'XAXX010101000', fiscal_regime: '601' }, pue).join()).toContain('616');
    expect(erroresReceptorCfdi({ ...ok, rfc: 'XAXX010101000', fiscal_regime: '616', cfdi_use: 'S01' }, pue)).toEqual([]);
  });
  it('PPD solo con forma 99; PUE nunca con 99', () => {
    expect(erroresReceptorCfdi(ok, { payment_form: '01', payment_method: 'PPD' })).toHaveLength(1);
    expect(erroresReceptorCfdi(ok, { payment_form: '99', payment_method: 'PPD' })).toEqual([]);
    expect(erroresReceptorCfdi(ok, { payment_form: '99', payment_method: 'PUE' })).toHaveLength(1);
  });
});
