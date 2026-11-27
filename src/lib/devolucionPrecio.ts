/**
 * Precio de una devolución (D-049): el de la LISTA DE PRECIOS DEL CLIENTE, con impuestos,
 * igual que el precio final de un renglón de venta (H14). Usa el mismo priceResolver y la
 * misma foto de precio que la venta (buildSalePricingSnapshot); no hay fórmula propia.
 */
import { resolveProductPricing, type ProductForPricing, type TarifaLineaRule } from '@/lib/priceResolver';
import { buildSalePricingSnapshot } from '@/lib/salePricing';

export interface ProductoPrecioDevolucion {
  id: string;
  precio_principal?: number | null;
  costo?: number | null;
  clasificacion_id?: string | null;
  lista_id?: string | null;
  tiene_iva?: boolean | null;
  iva_pct?: number | null;
  tiene_ieps?: boolean | null;
  ieps_pct?: number | null;
  ieps_tipo?: string | null;
  usa_listas_precio?: boolean | null;
  costo_incluye_impuestos?: boolean | null;
}

export function precioDevolucionCliente(
  rules: TarifaLineaRule[],
  producto: ProductoPrecioDevolucion,
  listaPrecioId: string | null | undefined,
): number {
  const pf: ProductForPricing = {
    id: producto.id,
    precio_principal: Number(producto.precio_principal) || 0,
    costo: Number(producto.costo) || 0,
    clasificacion_id: producto.clasificacion_id ?? null,
    lista_id: producto.lista_id ?? null,
    tiene_iva: !!producto.tiene_iva,
    iva_pct: producto.iva_pct ?? 16,
    tiene_ieps: !!producto.tiene_ieps,
    ieps_pct: producto.ieps_pct ?? 0,
    ieps_tipo: producto.ieps_tipo ?? undefined,
    usa_listas_precio: producto.usa_listas_precio ?? undefined,
    costo_incluye_impuestos: producto.costo_incluye_impuestos ?? undefined,
  };
  return buildSalePricingSnapshot(pf, resolveProductPricing(rules, pf, listaPrecioId ?? null)).displayPrice;
}

/**
 * D-070: devolución desde una venta/pedido → precio por pieza con que se vendió en ese documento
 * (suma de totales con impuestos / suma de cantidades del producto). Respeta precio de caja o
 * presentación, descuentos y promociones. Producto sin cantidad vendida → no entra (usa la lista).
 */
export function precioPorPiezaDeVenta(
  lineas: { producto_id: string | null; cantidad: number | null; total: number | null }[],
): Map<string, number> {
  const acc = new Map<string, { cant: number; importe: number }>();
  for (const l of lineas) {
    if (!l.producto_id) continue;
    const prev = acc.get(l.producto_id) ?? { cant: 0, importe: 0 };
    acc.set(l.producto_id, { cant: prev.cant + (Number(l.cantidad) || 0), importe: prev.importe + (Number(l.total) || 0) });
  }
  const m = new Map<string, number>();
  for (const [id, v] of acc) if (v.cant > 0) m.set(id, Math.round((v.importe / v.cant) * 100) / 100);
  return m;
}
