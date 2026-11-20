/**
 * Ticket en HTML: dibuja el modelo único (`ticketModelo`) para pantalla, PNG,
 * imagen de WhatsApp e impresión por navegador. Qué lleva el ticket (secciones,
 * renglones, montos y textos) lo decide `construirModeloTicket`; aquí solo se
 * acomoda (`ticketLayout`) y se pinta.
 *
 * Fuente monoespaciada + white-space:pre para que toPng() alinee las columnas
 * sin problemas de flexbox.
 */
import { construirModeloTicket, type TicketCampos } from '@/lib/ticketModelo';
import { maquetarTicket, centerText, type LineaTicket } from '@/lib/ticketLayout';

export {
  getTicketTotalsSummary,
  MOTIVO_DEVOLUCION_LABELS,
  ACCION_DEVOLUCION_LABELS,
  type TicketTotalsSummary,
} from '@/lib/ticketModelo';

export interface TicketEmpresa {
  nombre: string;
  rfc?: string | null;
  razon_social?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  moneda?: string | null;
  notas_ticket?: string | null;
  /** Interruptores (boolean) y textos libres (string) del diseñador de ticket. */
  ticket_campos?: TicketCampos | null;
}

export interface TicketLinea {
  nombre: string;
  /** Código del producto (solo se muestra si viene y `linea_codigo` está encendido). */
  codigo?: string | null;
  cantidad: number;
  precio: number;
  total: number;
  iva_monto?: number;
  ieps_monto?: number;
  descuento_pct?: number;
  esCambio?: boolean;
  producto_id?: string;
  precio_sugerido_publico?: number;
  precio_lista_unitario?: number | null;
  descuento_promocion_monto?: number;
  descuento_manual_monto?: number;
  iva_pct?: number;
  ieps_pct?: number;
}

export interface TicketPromo {
  descripcion: string;
  descuento: number;
  producto_id?: string;
  tipo?: string;
  cantidad_gratis?: number;
}

export interface TicketPago {
  metodo: string;
  monto: number;
  fecha?: string | null;
  referencia?: string | null;
}

export interface TicketDevolucion {
  nombre: string;
  cantidad: number;
  motivo: string;
  accion: string;
  monto?: number;
}

export interface TicketData {
  empresa: TicketEmpresa;
  folio: string;
  fecha: string;
  clienteNombre: string;
  clienteRfc?: string | null;
  clienteTelefono?: string | null;
  clienteDireccion?: string | null;
  vendedorNombre?: string;
  vendedorTelefono?: string | null;
  lineas: TicketLinea[];
  subtotal: number;
  descuento?: number;
  iva: number;
  ieps?: number;
  total: number;
  condicionPago?: string;
  metodoPago?: string;
  montoRecibido?: number;
  cambio?: number;
  saldoAnterior?: number;
  pagoAplicado?: number;
  saldoNuevo?: number;
  promociones?: TicketPromo[];
  pagos?: TicketPago[];
  devoluciones?: TicketDevolucion[];
  /** Venta cancelada: no debe saldo (se muestra 0). */
  cancelado?: boolean;
}

const COLS_HTML = 32;

const escapeHtml = (s: string) => s
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function lineaHtml(l: LineaTicket, cols: number): string {
  if (l.centro) return escapeHtml(centerText(l.partes.map(p => p.texto).join(''), cols));
  // <s> = tachado (precio original de un producto gratis).
  return l.partes.map(p => (p.tachado ? `<s>${escapeHtml(p.texto)}</s>` : escapeHtml(p.texto))).join('');
}

/**
 * @param opts.columnas Columnas del bloque monoespaciado. Por omisión 32 (la
 *   imagen de siempre); la vista previa del diseñador usa 48 para 80 mm, igual
 *   que la impresora térmica.
 */
export function buildTicketHTML(data: TicketData, opts?: { ticketAncho?: string; forPrint?: boolean; showTax?: boolean; columnas?: number }): string {
  const cols = opts?.columnas ?? COLS_HTML;
  const modelo = construirModeloTicket(data);
  const enc = modelo.encabezado;

  // ── Encabezado (HTML real, centrado) ──
  const hLines: string[] = [];
  if (enc.logoUrl) {
    hLines.push(`<div style="margin-bottom:6px"><img src="${escapeHtml(enc.logoUrl)}" alt="${escapeHtml(data.empresa.nombre)}" style="max-width:160px;max-height:80px;margin:0 auto;display:block" crossorigin="anonymous" /></div>`);
  }
  if (enc.nombre) hLines.push(`<div style="font-weight:700;font-size:22px">${escapeHtml(enc.nombre.toUpperCase())}</div>`);
  for (const l of enc.lineas) hLines.push(`<div style="font-size:${l.chico ? 13 : 14}px">${escapeHtml(l.texto)}</div>`);
  if (enc.textoLibre) hLines.push(`<div style="font-size:13px;white-space:pre-wrap;margin-top:4px">${escapeHtml(enc.textoLibre)}</div>`);

  // ── Cuerpo (bloque monoespaciado) ──
  const m = maquetarTicket(modelo, cols);
  const bodyContent = [...m.cuerpo, ...m.pie, ...m.marca].map(l => lineaHtml(l, cols)).join('\n');
  const width = Math.round((cols * 380) / COLS_HTML);

  return `<div style="box-sizing:content-box;width:${width}px;padding:12px 16px;background:#fff;color:#000;font-family:'Courier New',Courier,monospace;font-size:20px;font-weight:600;line-height:1.2"><div style="text-align:center;margin-bottom:8px">${hLines.join('')}</div><pre style="margin:0;white-space:pre;font:inherit;line-height:1.4">${bodyContent}</pre></div>`;
}
