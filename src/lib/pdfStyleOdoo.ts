/**
 * Shared PDF style module — Rutapp corporate standard
 * Printer-friendly grayscale, 100% vector, Helvetica.
 * Structured look: light-gray table header bands, subtle zebra rows,
 * bordered status chip, clear section hierarchy.
 * All exported symbols preserve their previous signatures so the 10+ generators
 * that import from this module render in the new style without code changes.
 */
import type jsPDF from 'jspdf';

export const ML = 14;
export const MR = 14;

// ── Grayscale palette ──
const BLACK: [number, number, number] = [26, 26, 26];           // #1a1a1a
const MUTED: [number, number, number] = [110, 110, 110];        // #6E6E6E
const LIGHT: [number, number, number] = [150, 150, 150];        // #969696
const BORDER: [number, number, number] = [214, 214, 214];       // #D6D6D6
const BORDER_LIGHT: [number, number, number] = [232, 232, 232]; // #E8E8E8
const HEAD_BG: [number, number, number] = [240, 240, 240];      // #F0F0F0
const ZEBRA_BG: [number, number, number] = [249, 249, 249];     // #F9F9F9
const WHITE: [number, number, number] = [255, 255, 255];

export const C = {
  text: BLACK,
  label: MUTED,
  muted: MUTED,
  sublabel: MUTED,
  light: LIGHT,
  // Status colors collapse to black to keep documents printer-friendly.
  green: BLACK,
  greenBg: WHITE,
  red: BLACK,
  border: BORDER,
  borderLight: BORDER_LIGHT,
  headBg: HEAD_BG,
  noteBg: WHITE,
  noteBorder: BORDER,
  white: WHITE,
  success: BLACK,
  danger: BLACK,
};

export interface EmpresaInfo {
  nombre: string;
  razon_social?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  regimen_fiscal?: string | null;
  moneda?: string | null;
}

export async function createDoc(): Promise<jsPDF> {
  const { default: jsPDF } = await import('jspdf');
  return new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'letter',
    compress: false,
    putOnlyUsedFonts: true,
  });
}

export const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtCurrencySymbol = (n: number, symbol: string = '$') =>
  `${symbol}${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const fmtDate = (d: string) => {
  try {
    const dt = new Date(d + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};

// ══════════════════════════════════════════════════════════
// HEADER — Empresa+RFC+email | Doc grande + Folio + chip de estado
// ══════════════════════════════════════════════════════════
export function drawDocHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docType: string,
  folio: string,
  logoBase64?: string | null,
  statusLabel?: string,
  _statusColor?: 'green' | 'red' | 'neutral',
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  let y = 14;
  let emisorX = ML;
  const logoMaxH = 14;

  // Logo (única imagen rasterizada permitida)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 9, logoMaxH, logoMaxH);
      emisorX = ML + logoMaxH + 4;
    } catch { /* ignore */ }
  }

  // Nombre comercial en MAYÚSCULAS — 13pt bold
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  const companyName = (empresa.nombre || empresa.razon_social || '').toUpperCase();
  doc.text(companyName, emisorX, y);
  y += 5;

  // RFC · email — 8.5pt gris
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const ids: string[] = [];
  if (empresa.rfc) ids.push(`RFC: ${empresa.rfc}`);
  if (empresa.email) ids.push(empresa.email);
  if (ids.length) {
    doc.text(ids.join('  ·  '), emisorX, y);
    y += 4;
  }

  // Dirección/teléfono, hasta dos líneas — 8.5pt gris
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean).join(', ');
  const extras: string[] = [];
  if (addr) extras.push(addr);
  if (empresa.telefono) extras.push(`Tel: ${empresa.telefono}`);
  if (extras.length) {
    const lines = doc.splitTextToSize(extras.join(' · '), (pageW * 0.58) - emisorX).slice(0, 2);
    doc.text(lines, emisorX, y);
    y += lines.length * 3.8;
  }

  // ── Derecha: tipo de documento grande + folio ──
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(docType, rightX, 15, { align: 'right' });

  let ry = 21;
  if (folio) {
    doc.setFontSize(10.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(folio, rightX, ry, { align: 'right' });
    ry += 4.6;
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  doc.text(
    `Generado: ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    rightX, ry, { align: 'right' }
  );
  ry += 4;

  // Chip de estado: pastilla con borde
  if (statusLabel) {
    const label = statusLabel.toUpperCase();
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    const txtW = doc.getTextWidth(label);
    const chipW = txtW + 8;
    const chipH = 6;
    const chipX = rightX - chipW;
    const chipY = ry - 1;
    doc.setFillColor(...HEAD_BG);
    doc.setDrawColor(...BLACK);
    doc.setLineWidth(0.3);
    doc.roundedRect(chipX, chipY, chipW, chipH, 1.2, 1.2, 'FD');
    doc.setTextColor(...BLACK);
    doc.text(label, chipX + chipW / 2, chipY + 4.1, { align: 'center' });
    ry += chipH + 2;
  }

  // Divisoria negra
  const dividerY = Math.max(y, ry) + 2.5;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.6);
  doc.line(ML, dividerY, rightX, dividerY);

  return dividerY + 7;
}

// ══════════════════════════════════════════════════════════
// INFO GRID — Dos columnas con títulos de sección
// ══════════════════════════════════════════════════════════
export function drawInfoGrid(
  doc: jsPDF,
  y: number,
  leftTitle: string,
  leftRows: [string, string][],
  rightTitle: string,
  rightRows: [string, string][],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const midX = pageW / 2;
  const colL = ML;
  const colR = midX + 6;

  // Títulos de sección
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text(leftTitle.toUpperCase(), colL, y);
  doc.text(rightTitle.toUpperCase(), colR, y);
  y += 2;

  // Línea separadora bajo títulos
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 5;

  // Left rows — el bloque de cliente fluye como una ficha:
  // '_name' en bold, filas sin etiqueta como texto corrido.
  let ly = y;
  for (const [lbl, val] of leftRows) {
    if (lbl === '_name') {
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(val, colL, ly);
      ly += 5;
    } else if (!lbl) {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...BLACK);
      doc.text(val, colL, ly);
      ly += 4.2;
    } else {
      doc.setFontSize(8.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(lbl, colL, ly);
      doc.setTextColor(...BLACK);
      doc.text(val, colL + 24, ly);
      ly += 4.2;
    }
  }

  // Right rows — etiqueta gris, valor negro
  let ry = y;
  for (const [lbl, val] of rightRows) {
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(lbl, colR, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(val, colR + 40, ry);
    doc.setFont('helvetica', 'normal');
    ry += 4.2;
  }

  return Math.max(ly, ry) + 6;
}

// ══════════════════════════════════════════════════════════
// SECTION TITLE — Título de bloque con línea
// ══════════════════════════════════════════════════════════
export function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(title.toUpperCase(), ML, y);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(ML, y + 1.5, pageW - MR, y + 1.5);
  return y + 6;
}

// ══════════════════════════════════════════════════════════
// TABLE — Banda gris en encabezado, zebra sutil
// ══════════════════════════════════════════════════════════
export async function drawCleanTable(
  doc: jsPDF,
  y: number,
  head: string[],
  body: any[][],
  columnStyles?: Record<number, any>,
  didParseCell?: (data: any) => void,
): Promise<number> {
  const { default: autoTable } = await import('jspdf-autotable');
  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    theme: 'plain',
    head: [head],
    body,
    styles: {
      fillColor: WHITE,
      textColor: BLACK,
      fontSize: 8.5,
      cellPadding: { top: 2.2, bottom: 2.2, left: 2.5, right: 2.5 },
      lineWidth: 0,
      font: 'helvetica',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: HEAD_BG,
      textColor: BLACK,
      fontSize: 8.5,
      fontStyle: 'bold',
      cellPadding: { top: 2.6, bottom: 2.6, left: 2.5, right: 2.5 },
      lineWidth: 0, // borde inferior dibujado a mano en didDrawCell
      overflow: 'linebreak',
      minCellHeight: 0,
    },
    bodyStyles: { fillColor: WHITE },
    alternateRowStyles: { fillColor: ZEBRA_BG },
    columnStyles: columnStyles || {},
    didParseCell: (data: any) => {
      if (data.section === 'head' && columnStyles && columnStyles[data.column.index]?.halign) {
        data.cell.styles.halign = columnStyles[data.column.index].halign;
      }
      if (didParseCell) didParseCell(data);
    },
    didDrawCell: (data: any) => {
      if (data.section === 'head') {
        // Borde inferior negro bajo el encabezado
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.35);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      if (data.section === 'body') {
        // Borde inferior gris claro en cada fila
        doc.setDrawColor(...BORDER_LIGHT);
        doc.setLineWidth(0.15);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 6;
}

// ══════════════════════════════════════════════════════════
// TOTALS — Bloque alineado a la derecha; la fila Total lleva
// regla negra arriba. Filas bold posteriores (p.ej. saldo) se
// muestran más discretas para no competir con el Total.
// ══════════════════════════════════════════════════════════
export function drawTotalsBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean; red?: boolean; separator?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const totLabelX = rightX - 58;
  const blockX = totLabelX - 8;
  let boldSeen = false;

  y += 2;
  for (const row of rows) {
    if (row.separator) {
      doc.setDrawColor(...BORDER_LIGHT);
      doc.setLineWidth(0.2);
      doc.line(blockX, y - 1.5, rightX, y - 1.5);
      y += 2;
    }

    if (row.bold && !boldSeen) {
      boldSeen = true;
      // Fila Total — regla negra arriba
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.4);
      doc.line(blockX, y - 1, rightX, y - 1);
      y += 4.5;

      doc.setFontSize(11.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 6.5;
    } else if (row.bold) {
      // Filas destacadas posteriores (saldo pendiente, etc.)
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 5;
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 5;
    }
  }
  return y + 1;
}

// ══════════════════════════════════════════════════════════
// IMPORTE CON LETRA — Línea discreta, sin doble regla
// ══════════════════════════════════════════════════════════
export function drawImporteConLetra(doc: jsPDF, y: number, text: string): number {
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text('IMPORTE CON LETRA', ML, y);
  y += 3.6;
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  doc.text(text.toUpperCase(), ML, y);
  return y + 7;
}

// ══════════════════════════════════════════════════════════
// NOTES — Caja con borde gris y padding cómodo
// ══════════════════════════════════════════════════════════
export function drawNotes(doc: jsPDF, y: number, notes: string, title = 'NOTAS'): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const contentW = rightX - ML;
  const pad = 5;
  y = checkPageBreak(doc, y, 25);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const textLines = doc.splitTextToSize(notes, contentW - pad * 2);
  const boxH = 8 + textLines.length * 4 + 3;

  doc.setFillColor(...ZEBRA_BG);
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(ML, y, contentW, boxH, 1.5, 1.5, 'FD');

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text(title.toUpperCase(), ML + pad, y + 5.5);

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  doc.text(textLines, ML + pad, y + 10.5);

  return y + boxH + 6;
}

// ══════════════════════════════════════════════════════════
// SIGNATURES — Dos columnas con líneas
// ══════════════════════════════════════════════════════════
export function drawSignatures(
  doc: jsPDF,
  y: number,
  left: { title: string; name?: string },
  right: { title: string; name?: string },
): number {
  const pageW = doc.internal.pageSize.getWidth();
  y = checkPageBreak(doc, y, 40);
  y += 14;

  const sigW = (pageW - ML - MR - 28) / 2;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(ML + 8, y, ML + 8 + sigW, y);
  doc.line(pageW - MR - 8 - sigW, y, pageW - MR - 8, y);

  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(left.title, ML + 8 + sigW / 2, y + 4.5, { align: 'center' });
  if (left.name) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(left.name, ML + 8 + sigW / 2, y + 9.5, { align: 'center' });
  }

  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(right.title, pageW - MR - 8 - sigW / 2, y + 4.5, { align: 'center' });
  if (right.name) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(right.name, pageW - MR - 8 - sigW / 2, y + 9.5, { align: 'center' });
  }

  return y + 16;
}

// ══════════════════════════════════════════════════════════
// PAGE BREAK CHECK
// ══════════════════════════════════════════════════════════
export function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 16;
  }
  return y;
}

// ══════════════════════════════════════════════════════════
// FOOTER — Rutapp · [empresa]  |  Página X de Y
// ══════════════════════════════════════════════════════════
export function drawFooter(doc: jsPDF, empresa?: EmpresaInfo) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  const empresaNombre = empresa?.nombre || empresa?.razon_social || '';

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);

    // Línea superior gris clara
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 13, pageW - MR, pageH - 13);

    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);

    const leftTxt = empresaNombre ? `Rutapp · ${empresaNombre}` : 'Rutapp';
    doc.text(leftTxt, ML, pageH - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 8, { align: 'right' });
  }
}

// ══════════════════════════════════════════════════════════
// NUMBER TO WORDS (Spanish) — currency-aware
// ══════════════════════════════════════════════════════════
export function numberToWords(n: number, wordPlural: string = 'PESOS', code: string = 'MXN'): string {
  const units = ['', 'UN', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE'];
  const teens = ['DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE', 'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE'];
  const tens = ['', '', 'VEINTE', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];
  const hundreds = ['', 'CIEN', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

  const int = Math.floor(n);
  const cents = Math.round((n - int) * 100);

  if (int === 0) return `CERO ${wordPlural} ${String(cents).padStart(2, '0')}/100 ${code}`;

  function convert(num: number): string {
    if (num === 0) return '';
    if (num < 10) return units[num];
    if (num < 20) return teens[num - 10];
    if (num < 100) {
      const t = Math.floor(num / 10);
      const u = num % 10;
      if (num >= 21 && num <= 29) return 'VEINTI' + units[u].toLowerCase();
      return tens[t] + (u ? ' Y ' + units[u] : '');
    }
    if (num < 1000) {
      const h = Math.floor(num / 100);
      const rest = num % 100;
      if (num === 100) return 'CIEN';
      return hundreds[h] + (rest ? ' ' + convert(rest) : '');
    }
    if (num < 1000000) {
      const th = Math.floor(num / 1000);
      const rest = num % 1000;
      if (th === 1) return 'MIL' + (rest ? ' ' + convert(rest) : '');
      return convert(th) + ' MIL' + (rest ? ' ' + convert(rest) : '');
    }
    return String(num);
  }

  return `${convert(int)} ${wordPlural} ${String(cents).padStart(2, '0')}/100 ${code}`;
}

// ══════════════════════════════════════════════════════════
// LOAD LOGO
// ══════════════════════════════════════════════════════════
export async function loadLogoBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}
