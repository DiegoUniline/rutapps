import { calculateSaleLineAmounts } from './salePricing';

interface LegacyLine {
  id: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  iva_pct: number;
  ieps_pct: number;
  total: number;
  subtotal: number;
  iva_monto: number;
  ieps_monto: number;
  precio_unitario_sin_redondeo: number | null;
  promocion_aplicada?: any[];
}

export function simulateBackfill(line: LegacyLine) {
  const cant = Number(line.cantidad) || 0;
  // Si no hay precio_unitario_sin_redondeo, usamos el guardado
  const precioLista = Number(line.precio_unitario_sin_redondeo) || Number(line.precio_unitario) || 0;
  
  // Reconstruimos el bruto asumiendo que el precio_unitario guardado es el neto después de descuentos manuales
  const dummyLine = {
    cantidad: cant,
    precio_unitario: precioLista,
    descuento_pct: Number(line.descuento_pct) || 0,
    iva_pct: Number(line.iva_pct) || 0,
    ieps_pct: Number(line.ieps_pct) || 0,
  };

  // 1. Cálculo Bruto (sin promociones)
  const bruto = calculateSaleLineAmounts(dummyLine as any, false);
  
  // 2. Identificar promoción (si existe en la tabla promocion_aplicada)
  const promoMonto = (line.promocion_aplicada ?? []).reduce((s, p) => s + (Number(p.descuento_aplicado) || 0), 0);
  
  // 3. Cálculo Neto (lo que realmente se guardó)
  const neto = {
    subtotal: Number(line.subtotal) || 0,
    iva: Number(line.iva_monto) || 0,
    ieps: Number(line.ieps_monto) || 0,
    total: Number(line.total) || 0,
  };

  const manualDiscountMonto = bruto.discount;

  return {
    id: line.id,
    precio_lista_unitario: precioLista,
    importe_bruto: bruto.total,
    descuento_promocion_monto: promoMonto,
    base_descuento_manual: bruto.total - promoMonto,
    descuento_manual_monto: manualDiscountMonto,
    descuento_total_monto: promoMonto + manualDiscountMonto,
    base_ieps: neto.subtotal,
    base_iva: neto.subtotal + neto.ieps,
    impuestos_totales: neto.iva + neto.ieps,
    objeto_impuesto: neto.iva > 0 || neto.ieps > 0 ? '02' : '01',
    // Auditoría de contraste
    check_total_original: line.total,
    check_total_simulado: neto.total,
    diff: Math.abs(line.total - neto.total)
  };
}
