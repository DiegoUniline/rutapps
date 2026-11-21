/**
 * Validación previa (solo UX) de los datos CFDI 4.0 del receptor y del pago antes de timbrar.
 * Espejo de `validarParaTimbrar` en `supabase/functions/facturama/index.ts`, que es quien decide
 * (D-014): aquí solo se evita un viaje al servidor y se dan mensajes claros en el formulario.
 */
export const RFC_RE = /^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/;
export const RFC_PUBLICO_GENERAL = 'XAXX010101000';

export interface ReceptorCfdi { rfc: string; name: string; fiscal_regime: string; cfdi_use: string; tax_zip_code: string }

export function erroresReceptorCfdi(r: ReceptorCfdi, pago: { payment_form: string; payment_method: string }): string[] {
  const e: string[] = [];
  const rfc = (r.rfc || '').toUpperCase().trim();
  if (!RFC_RE.test(rfc)) e.push('El RFC del receptor no es válido (12 o 13 caracteres).');
  if (!(r.name || '').trim()) e.push('Falta la razón social del receptor.');
  if (!r.fiscal_regime) e.push('Falta el régimen fiscal del receptor.');
  if (!/^\d{5}$/.test((r.tax_zip_code || '').trim())) e.push('Falta el código postal fiscal del receptor (5 dígitos).');
  if (!r.cfdi_use) e.push('Falta el uso de CFDI.');
  if (rfc === RFC_PUBLICO_GENERAL && (r.fiscal_regime !== '616' || r.cfdi_use !== 'S01')) {
    e.push('Para "Público en general" (XAXX010101000) el régimen debe ser 616 y el uso S01.');
  }
  if (!['PUE', 'PPD'].includes(pago.payment_method)) e.push('Indica el método de pago (PUE o PPD).');
  if (!pago.payment_form) e.push('Indica la forma de pago.');
  if (pago.payment_method === 'PPD' && pago.payment_form && pago.payment_form !== '99') {
    e.push('Una factura PPD solo puede llevar la forma de pago "99 - Por definir".');
  }
  if (pago.payment_method === 'PUE' && pago.payment_form === '99') {
    e.push('Una factura PUE no puede llevar la forma de pago "99 - Por definir".');
  }
  return e;
}
