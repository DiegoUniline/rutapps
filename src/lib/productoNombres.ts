/**
 * Helpers para resolver el nombre de un producto según el contexto del documento,
 * estilo Odoo. Si el campo específico está vacío, cae al nombre principal.
 *
 * Compatible con cualquier objeto que tenga al menos `nombre` (y opcionalmente
 * `nombre_compra`, `nombre_venta`, `nombre_ticket`).
 *
 * Uso recomendado junto al patrón de fallback de 3 niveles:
 *   producto (cache) → JOIN embebido → snapshot en línea (descripcion / nombre)
 */

type ProdLike = {
  nombre?: string | null;
  nombre_compra?: string | null;
  nombre_venta?: string | null;
  nombre_ticket?: string | null;
} | null | undefined;

const clean = (v: unknown): string => {
  if (typeof v !== 'string') return '';
  return v.trim();
};

/** Nombre para órdenes de compra y documentos a proveedor. */
export const getNombreCompra = (p: ProdLike, fallback?: string): string =>
  clean(p?.nombre_compra) || clean(p?.nombre) || clean(fallback);

/** Nombre para cotizaciones, notas de venta, facturas y PDFs. */
export const getNombreVenta = (p: ProdLike, fallback?: string): string =>
  clean(p?.nombre_venta) || clean(p?.nombre) || clean(fallback);

/** Nombre corto para tickets POS / impresoras térmicas. Cae a nombre_venta y luego al principal. */
export const getNombreTicket = (p: ProdLike, fallback?: string): string =>
  clean(p?.nombre_ticket) || clean(p?.nombre_venta) || clean(p?.nombre) || clean(fallback);
