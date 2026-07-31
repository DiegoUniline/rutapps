/**
 * Desglose completo por línea de venta (opt-in por licencia).
 *
 * Guarda 17 campos informativos en `venta_lineas`: precio de lista, importe
 * bruto, descuento de promoción, descuento manual, bases de impuestos y
 * referencias de promoción.
 *
 * GARANTÍAS:
 *  - NO recalcula nada: solo organiza valores ya calculados por el motor.
 *  - NO altera `subtotal`, `iva_monto`, `ieps_monto` ni `total` de la línea,
 *    ni el encabezado de la venta. Cero impacto en dinero, saldos o inventario.
 *  - Solo se escribe cuando la bandera `venta_linea_desglose` está activa para
 *    la licencia de la empresa (hoy: 12324489). Para el resto, los campos
 *    quedan NULL (defaults de BD).
 */
import { isFeatureEnabled } from '@/lib/featureFlags';
import type { LineaMontos } from '@/lib/promoLinea';

const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

/** ¿Esta licencia guarda el desglose completo por línea? */
export function desgloseLineaHabilitado(licencia?: string | null): boolean {
  return isFeatureEnabled('venta_linea_desglose', String(licencia ?? '').trim());
}

export interface VentaLineaDesglose {
  precio_lista_unitario: number | null;
  importe_bruto: number;
  descuento_promocion_monto: number;
  base_descuento_manual: number;
  descuento_manual_monto: number;
  descuento_total_monto: number;
  base_ieps: number;
  base_iva: number;
  impuestos_totales: number;
  descuento_manual: boolean;
  motivo_descuento_manual: string | null;
  descuento_registrado_por: string | null;
  promocion_id: string | null;
  promocion_nombre: string | null;
  cantidad_bonificada: number;
  es_bonificacion: boolean;
  objeto_impuesto: string | null;
}

export interface DesgloseArgs {
  cantidad: number;
  /** Precio de lista unitario (neto, sin redondeo) tal como se cargó al carrito. */
  precioListaUnitario?: number | null;
  /** Montos de la línea ANTES de promoción. */
  breakdownBruto: LineaMontos;
  /** Montos de la línea DESPUÉS de promoción (los que se guardan). */
  breakdownNeto: LineaMontos;
  /** Descuento en dinero de la promoción para esta línea (ya calculado). */
  descuentoPromoMonto: number;
  /** Descuento manual en dinero para esta línea (0 si no aplica). */
  descuentoManualMonto?: number;
  /** Unidades bonificadas (gratis) de la promoción en esta línea. */
  cantidadBonificada?: number;
  /** Promoción aplicada a esta línea (si hay una sola dominante). */
  promocion?: { id?: string | null; nombre?: string | null } | null;
  /** UUID del usuario que registró el descuento manual. */
  usuarioId?: string | null;
  motivoDescuentoManual?: string | null;
  /** Clave del catálogo SAT de objeto de impuesto del producto. */
  objetoImpuesto?: string | null;
}

/**
 * Construye el desglose de la línea a partir de valores ya calculados.
 */
export function buildDesgloseLinea(args: DesgloseArgs): VentaLineaDesglose {
  const {
    cantidad,
    precioListaUnitario,
    breakdownBruto,
    breakdownNeto,
    descuentoPromoMonto,
    descuentoManualMonto = 0,
    cantidadBonificada = 0,
    promocion,
    usuarioId,
    motivoDescuentoManual,
    objetoImpuesto,
  } = args;

  const precio_lista_unitario =
    Number(precioListaUnitario) > 0 ? r2(Number(precioListaUnitario)) : null;

  // Bruto real de la línea antes de promoción/descuentos (con impuestos).
  const importe_bruto = r2(breakdownBruto?.total ?? 0);

  const promoMonto = r2(Math.max(0, Number(descuentoPromoMonto) || 0));
  const manualMonto = r2(Math.max(0, Number(descuentoManualMonto) || 0));

  const base_descuento_manual = r2(importe_bruto - promoMonto);
  const descuento_total_monto = r2(promoMonto + manualMonto);

  // Bases de impuestos sobre los montos NETOS ya guardados en la línea.
  const base_ieps = r2(breakdownNeto?.subtotal ?? 0);
  const base_iva = r2(base_ieps + (Number(breakdownNeto?.ieps) || 0));
  const impuestos_totales = r2(
    (Number(breakdownNeto?.ieps) || 0) + (Number(breakdownNeto?.iva) || 0),
  );

  const descuento_manual = manualMonto > 0;
  const cantidad_bonificada = r2(Math.max(0, Number(cantidadBonificada) || 0));
  const es_bonificacion = cantidad > 0 && cantidad_bonificada >= cantidad;

  return {
    precio_lista_unitario,
    importe_bruto,
    descuento_promocion_monto: promoMonto,
    base_descuento_manual,
    descuento_manual_monto: manualMonto,
    descuento_total_monto,
    base_ieps,
    base_iva,
    impuestos_totales,
    descuento_manual,
    motivo_descuento_manual: descuento_manual ? (motivoDescuentoManual || null) : null,
    descuento_registrado_por: descuento_manual ? (usuarioId || null) : null,
    promocion_id: promocion?.id || null,
    promocion_nombre: promocion?.nombre || null,
    cantidad_bonificada,
    es_bonificacion,
    objeto_impuesto: objetoImpuesto || null,
  };
}
