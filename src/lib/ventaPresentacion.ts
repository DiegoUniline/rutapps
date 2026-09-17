import type { VentaLinea } from '@/types';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';
import { getTaxMultiplier, type SalePricingSnapshot } from './salePricing';

export function presentationSummary(line: Partial<VentaLinea>, unit = 'unidades'): string {
  if (!line.presentacion_nombre) return '';
  const fmt = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });
  const factor = Number(line.presentacion_factor) || 0;
  const packages = line.paquetes != null ? Number(line.paquetes) : (factor > 0 ? Number(line.cantidad) / factor : null);
  const name = packages != null ? `${fmt(packages)} × ${line.presentacion_nombre}` : line.presentacion_nombre;
  return `${name}${factor > 0 ? ` (${fmt(factor)} ${unit} c/u)` : ''} · ${fmt(Number(line.cantidad) || 0)} ${unit}`;
}

/** Inventory and sale amounts always use base units, never package counts. */
export function buildPresentationPatch(
  presentation: ProductoPresentacion | null,
  packages: number,
  basePricing: SalePricingSnapshot,
  taxes: { iva_pct?: number; ieps_pct?: number },
): Partial<VentaLinea> & Record<string, unknown> {
  const factor = presentation ? Number(presentation.factor_base) : 1;
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(packages) || packages <= 0) {
    throw new Error('La presentación y la cantidad deben ser mayores que cero.');
  }
  const special = presentation?.precio_especial != null;
  // Keep precision per base unit (e.g. a $100 package of 12 must stay $100).
  const gross = special ? Number(presentation.precio_especial) / factor : basePricing.displayPrice;
  if (!Number.isFinite(gross) || gross < 0) throw new Error('Precio de presentación inválido.');
  const mult = getTaxMultiplier({ tiene_iva: Number(taxes.iva_pct) > 0, iva_pct: Number(taxes.iva_pct) || 0, tiene_ieps: Number(taxes.ieps_pct) > 0, ieps_pct: Number(taxes.ieps_pct) || 0 });
  const net = special ? gross / mult : basePricing.unitPrice;
  return {
    presentacion_id: presentation?.id ?? null,
    presentacion_nombre: presentation?.nombre ?? null,
    presentacion_factor: presentation ? factor : null,
    paquetes: presentation ? packages : null,
    cantidad: Math.round(packages * factor * 1e6) / 1e6,
    precio_unitario: net,
    display_unit_price: gross,
    precio_unitario_sin_redondeo: special ? net : basePricing.rawUnitPrice,
    precio_display_sin_redondeo: special ? gross : basePricing.rawDisplayPrice,
    base_precio: special ? 'con_impuestos' : basePricing.basePrecio,
    redondeo: special ? 'ninguno' : basePricing.redondeo,
    precio_manual: special,
  };
}
