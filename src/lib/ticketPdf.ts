/**
 * Ticket en PDF generado por código (D-051): dibuja el MISMO documento que el
 * HTML, el ESC/POS y el texto (`ticketModelo` → `maquetarTicket`) con texto
 * monoespaciado real (Courier), sin capturas de pantalla.
 *
 * - Ancho del papel según el diseñador: 80 mm (48 columnas) o 58 mm (32
 *   columnas, por omisión), igual que la impresora térmica.
 * - Alto dinámico: la hoja mide lo que mide el ticket (si fuera enorme se parte
 *   en varias hojas del mismo ancho).
 * - Logo con `addImage` cuando existe y el diseñador lo tiene encendido.
 *
 * Se usa para compartir (WhatsApp / Web Share) y descargar el ticket de venta,
 * de entrega y la liquidación de ruta.
 */
import type jsPDF from 'jspdf';
import type { TicketData } from './ticketHtml';
import { construirModeloTicket } from './ticketModelo';
import { maquetarTicket, centerText, textoLinea, type DocumentoTicket, type LineaTicket } from './ticketLayout';

export interface OpcionesTicketPdf {
  /** '58' o '80' (empresas.ticket_ancho). Sin valor o cualquier otro = 58 mm. */
  ticketAncho?: string | null;
  /**
   * Logo ya cargado (data URL). `undefined` = se descarga de `encabezado.logoUrl`;
   * `null` = sin logo.
   */
  logoDataUrl?: string | null;
  /** Título del PDF (propiedades del documento). */
  titulo?: string;
  /** Comprimir el contenido (por omisión sí; las pruebas lo apagan para leer el texto). */
  comprimir?: boolean;
}

const MM_POR_PT = 25.4 / 72;
/** Ancho de un carácter Courier en «em». */
const COURIER_EM = 0.6;
/** Ancho imprimible de la térmica: 72 mm en papel de 80, 48 mm en papel de 58. */
const IMPRIMIBLE = { 80: 72, 58: 48 } as const;
/** Alto máximo de una hoja PDF (límite práctico de los visores: 200 in ≈ 5080 mm). */
const ALTO_MAX_MM = 5000;
const MARGEN_VERTICAL_MM = 4;

/** Ancho cuando la empresa no lo tiene configurado (decisión del dueño 2026-11-21: 58 mm). */
export const TICKET_ANCHO_POR_OMISION = '58' as const;

export function anchoTicketMm(ticketAncho?: string | null): 58 | 80 {
  return ticketAncho === '80' ? 80 : 58;
}

/** Ancho efectivo ('58' | '80') para impresión, PDF y ESC/POS de una empresa. */
export function ticketAnchoEmpresa(empresa: unknown): '58' | '80' {
  return ticketAnchoDe(empresa) === '80' ? '80' : TICKET_ANCHO_POR_OMISION;
}

/** `empresas.ticket_ancho` de un objeto empresa cualquiera (el tipo `Empresa` no lo declara). */
export function ticketAnchoDe(empresa: unknown): string | null {
  if (!empresa || typeof empresa !== 'object') return null;
  const v = (empresa as { ticket_ancho?: unknown }).ticket_ancho;
  return typeof v === 'string' ? v : null;
}

/** Columnas del ticket según el ancho: 32 en 58 mm, 48 en 80 mm (las del ESC/POS). */
export function columnasTicket(ticketAncho?: string | null): number {
  return anchoTicketMm(ticketAncho) === 58 ? 32 : 48;
}

const REEMPLAZOS: Record<string, string> = {
  '–': '-', '—': '-', '─': '-', '‐': '-', '‑': '-',
  '‘': "'", '’': "'", '“': '"', '”': '"', '…': '.', '•': '*', '·': '.', '✓': 'v',
};

/**
 * Deja cada carácter dentro de lo que pinta la fuente estándar del PDF
 * (Latin-1): quita acentos raros y emojis SIN cambiar el largo, para que las
 * columnas sigan alineadas (se aplica antes de medir en `maquetarTicket`).
 */
export function limpiarTextoPdf(s: string): string {
  let out = '';
  for (const ch of Array.from(s)) {
    const code = ch.codePointAt(0) ?? 0;
    if (code === 0x09) { out += ' '; continue; }
    if (code < 0x20 || (code >= 0x7f && code < 0xa0)) continue;
    if (code <= 0xff) { out += ch; continue; }
    if (REEMPLAZOS[ch]) { out += REEMPLAZOS[ch]; continue; }
    const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
    out += base.length === 1 && (base.codePointAt(0) ?? 0) <= 0xff ? base : '?';
  }
  return out;
}

/** Descarga el logo como data URL de imagen; null si no se puede (sin red, 404, CORS). */
export async function cargarLogoDataUrl(url: string): Promise<string | null> {
  if (url.startsWith('data:image/')) return url;
  try {
    const resp = await fetch(url, { mode: 'cors' });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    if (!blob.type.startsWith('image/')) return null;
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch (err) {
    // Sin conexión o bloqueado por CORS: el ticket sale sin logo (no es un error para el usuario).
    if (import.meta.env?.DEV) console.warn('[ticketPdf] logo no disponible:', err);
    return null;
  }
}

interface LogoMedido { dataUrl: string; formato: string; w: number; h: number }

function medirLogo(doc: jsPDF, dataUrl: string, maxW: number, maxH: number): LogoMedido | null {
  try {
    const p = doc.getImageProperties(dataUrl);
    if (!p.width || !p.height) return null;
    const escala = Math.min(maxW / p.width, maxH / p.height);
    return { dataUrl, formato: p.fileType, w: p.width * escala, h: p.height * escala };
  } catch (err) {
    // Formato que jsPDF no lee (p. ej. SVG): el ticket sale sin logo.
    if (import.meta.env?.DEV) console.warn('[ticketPdf] logo no compatible:', err);
    return null;
  }
}

/**
 * Dibuja un documento de ticket en un PDF del ancho del papel. Función base:
 * la usan el ticket de venta/entrega y la liquidación de ruta.
 */
export async function documentoTicketPdf(documento: DocumentoTicket, opts: OpcionesTicketPdf = {}): Promise<jsPDF> {
  const { default: JsPDF } = await import('jspdf');
  const anchoMm = anchoTicketMm(opts.ticketAncho);
  const cols = columnasTicket(opts.ticketAncho);
  const imprimible = IMPRIMIBLE[anchoMm];
  const margenX = (anchoMm - imprimible) / 2;
  const charW = imprimible / cols;
  const fontPt = charW / COURIER_EM / MM_POR_PT;
  const lineaMm = fontPt * 1.3 * MM_POR_PT;

  const m = maquetarTicket(documento, cols, limpiarTextoPdf);
  const lineas: LineaTicket[] = [...m.encabezado, ...(m.encabezado.length ? [{ partes: [{ texto: '' }] }] : []), ...m.cuerpo, ...m.pie, ...m.marca];

  const logoUrl = opts.logoDataUrl !== undefined
    ? opts.logoDataUrl
    : documento.encabezado.logoUrl ? await cargarLogoDataUrl(documento.encabezado.logoUrl) : null;

  // Hoja provisional solo para medir el logo.
  const medidor = new JsPDF({ unit: 'mm', format: [anchoMm, 100] });
  const logo = logoUrl ? medirLogo(medidor, logoUrl, imprimible * 0.6, 22) : null;
  const logoAlto = logo ? logo.h + 2 : 0;

  // Reparto en hojas (normalmente una sola).
  const porHojaPrimera = Math.max(1, Math.floor((ALTO_MAX_MM - 2 * MARGEN_VERTICAL_MM - logoAlto) / lineaMm));
  const porHoja = Math.max(1, Math.floor((ALTO_MAX_MM - 2 * MARGEN_VERTICAL_MM) / lineaMm));
  const hojas: LineaTicket[][] = [lineas.slice(0, porHojaPrimera)];
  for (let i = porHojaPrimera; i < lineas.length; i += porHoja) hojas.push(lineas.slice(i, i + porHoja));

  // jsPDF voltea la hoja si el alto es menor que el ancho: se fuerza vertical.
  const altoHoja = (n: number, conLogo: boolean) =>
    Math.max(anchoMm + 1, 2 * MARGEN_VERTICAL_MM + (conLogo ? logoAlto : 0) + n * lineaMm);

  const doc = new JsPDF({ unit: 'mm', format: [anchoMm, altoHoja(hojas[0].length, true)], orientation: 'portrait', compress: opts.comprimir ?? true });
  doc.setProperties({ title: opts.titulo ?? 'Ticket', creator: 'Rutapp' });
  doc.setTextColor(0, 0, 0);
  doc.setDrawColor(0, 0, 0);
  doc.setFontSize(fontPt);

  hojas.forEach((hoja, i) => {
    if (i > 0) doc.addPage([anchoMm, altoHoja(hoja.length, false)], 'portrait');
    let y = MARGEN_VERTICAL_MM;
    if (i === 0 && logo) {
      doc.addImage(logo.dataUrl, logo.formato, (anchoMm - logo.w) / 2, y, logo.w, logo.h);
      y += logoAlto;
    }
    for (const l of hoja) {
      y += lineaMm;
      const base = y - lineaMm * 0.28; // línea base del texto dentro del renglón
      doc.setFont('courier', l.negrita ? 'bold' : 'normal');
      if (l.centro) {
        const t = centerText(textoLinea(l), cols).replace(/\s+$/, '');
        if (t) doc.text(t, margenX, base);
        continue;
      }
      // Partes contiguas con el mismo estilo se dibujan de una pieza.
      const tramos: { texto: string; tachado: boolean }[] = [];
      for (const p of l.partes) {
        const ult = tramos[tramos.length - 1];
        if (ult && ult.tachado === !!p.tachado) ult.texto += p.texto;
        else tramos.push({ texto: p.texto, tachado: !!p.tachado });
      }
      let col = 0;
      for (const p of tramos) {
        const x = margenX + col * charW;
        const t = p.texto.replace(/\s+$/, '');
        if (t) doc.text(t, x, base);
        if (p.tachado && t) {
          doc.setLineWidth(0.2);
          doc.line(x, base - fontPt * MM_POR_PT * 0.3, x + t.length * charW, base - fontPt * MM_POR_PT * 0.3);
        }
        col += p.texto.length;
      }
    }
  });
  return doc;
}

/** Nombre de archivo seguro para el ticket: «Ticket-V-0001.pdf». */
export function nombreArchivoTicket(folio: string, prefijo = 'Ticket'): string {
  const limpio = `${prefijo}-${folio || 'sin-folio'}`.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.-]+/g, '_');
  return `${limpio}.pdf`;
}

/** PDF del ticket de venta/entrega desde el modelo único, con los campos del diseñador. */
export async function generarTicketPdf(data: TicketData, opts: OpcionesTicketPdf = {}): Promise<Blob> {
  const doc = await documentoTicketPdf(construirModeloTicket(data), { titulo: `Ticket ${data.folio}`, ...opts });
  return doc.output('blob');
}
