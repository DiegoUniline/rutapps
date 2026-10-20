import { resolveProductPricing, type ProductForPricing, type TarifaLineaRule } from '@/lib/priceResolver';
import { buildSalePricingSnapshot, calculateSaleLineAmounts } from '@/lib/salePricing';

/** Producto con los campos que necesita el cálculo de precio. */
export type ProductoAjuste = ProductForPricing & { nombre?: string | null; unidad_venta_id?: string | null };

/**
 * Renglón de venta (precio de lista del cliente) para un producto que se
 * entregó sin estar en el pedido. Mismo cálculo que la edición de ventas:
 * resolveProductPricing → snapshot → calculateSaleLineAmounts.
 */
export function lineaVentaParaProducto(
  producto: ProductoAjuste,
  rules: TarifaLineaRule[],
  listaPrecioId: string | null,
  cantidad: number,
) {
  const pricing = resolveProductPricing(rules, producto, listaPrecioId);
  const snap = buildSalePricingSnapshot(producto, pricing);
  const ivaPct = producto.tiene_iva ? Number(producto.iva_pct ?? 16) : 0;
  const tieneIeps = !!producto.tiene_ieps || Number(producto.ieps_pct ?? 0) > 0;
  const iepsPct = tieneIeps ? Number(producto.ieps_pct ?? 0) : 0;
  const amounts = calculateSaleLineAmounts({
    precio_unitario: snap.unitPrice,
    precio_unitario_sin_redondeo: snap.rawUnitPrice,
    precio_display_sin_redondeo: snap.rawDisplayPrice,
    display_unit_price: snap.displayPrice,
    base_precio: snap.basePrecio,
    redondeo: snap.redondeo,
    cantidad,
    descuento_pct: 0,
    precio_manual: false,
    tiene_iva: !!producto.tiene_iva,
    iva_pct: ivaPct,
    tiene_ieps: tieneIeps,
    ieps_pct: iepsPct,
  });
  return {
    descripcion: producto.nombre ?? null,
    unidad_id: producto.unidad_venta_id ?? null,
    precio_unitario: snap.unitPrice,
    precio_unitario_sin_redondeo: snap.rawUnitPrice,
    descuento_pct: 0,
    lista_precio_id: listaPrecioId,
    precio_manual: false,
    iva_pct: ivaPct,
    ieps_pct: iepsPct,
    subtotal: amounts.subtotal,
    iva_monto: amounts.iva,
    ieps_monto: amounts.ieps,
    total: amounts.total,
  };
}
