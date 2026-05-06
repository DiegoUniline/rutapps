import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

export interface StockBreakdown {
  paquetes: number;     // cuántas unidades enteras de la presentación
  resto: number;        // sobrante en unidad base
  presentacion: ProductoPresentacion;
  unidadBase: string;
  /** ej: "1 caja + 6 pz" o "2 bolsas + 0.5 kg" */
  texto: string;
}

const fmtN = (n: number, max = 3) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: max });

/**
 * Devuelve el desglose del stock en términos de la presentación principal.
 * Si no hay presentación principal o el factor es 0, regresa null.
 */
export function getStockBreakdown(
  stockBase: number,
  presentaciones: ProductoPresentacion[] | null | undefined,
  unidadBase: string,
): StockBreakdown | null {
  if (!presentaciones?.length) return null;
  const principal = presentaciones.find(p => p.es_principal_stock && p.activo);
  if (!principal) return null;
  const factor = Number(principal.factor_base);
  if (!factor || factor <= 0) return null;
  const stock = Math.max(0, Number(stockBase) || 0);
  const paquetes = Math.floor(stock / factor);
  const restoRaw = stock - paquetes * factor;
  // round to 3 decimals to avoid floating dust
  const resto = Math.round(restoRaw * 1000) / 1000;
  const isInt = (n: number) => Math.abs(n - Math.round(n)) < 0.0005;
  const partes: string[] = [];
  if (paquetes > 0) partes.push(`${fmtN(paquetes, 0)} ${principal.nombre}`);
  if (resto > 0) partes.push(`${fmtN(resto, isInt(resto) ? 0 : 3)} ${unidadBase}`);
  if (partes.length === 0) partes.push(`0 ${unidadBase}`);
  return { paquetes, resto, presentacion: principal, unidadBase, texto: partes.join(' + ') };
}
