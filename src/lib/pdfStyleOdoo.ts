/**
 * Shared PDF style module — Rutapp B/N corporate standard
 * Strictly black & white, 100% vector, Helvetica.
 * All exported symbols preserve their previous signatures so the 10+ generators
 * that import from this module render in the new style without code changes.
 */
import type jsPDF from 'jspdf';

export const ML = 14;
export const MR = 14;

// ── B/N palette (all "color" tokens collapse to grayscale) ──
// Kept as named entries to preserve the C.* API used across generators.
const BLACK: [number, number, number] = [26, 26, 26];           // #1a1a1a
const MUTED: [number, number, number] = [110, 110, 110];        // #6E6E6E
const LIGHT: [number, number, number] = [180, 180, 180];        // #B4B4B4
const BORDER: [number, number, number] = [220, 220, 220];       // #DCDCDC
const BORDER_LIGHT: [number, number, number] = [235, 235, 235]; // #EBEBEB
const WHITE: [number, number, number] = [255, 255, 255];

export const C = {
  text: BLACK,
  label: MUTED,
  muted: MUTED,
  sublabel: MUTED,
  light: LIGHT,
  // Status colors collapse to black to enforce strict B/W look.
  green: BLACK,
  greenBg: WHITE,
  red: BLACK,
  border: BORDER,
  borderLight: BORDER_LIGHT,
  headBg: WHITE,
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
// HEADER — Empresa+RFC+email | Doc + Folio + Estado (texto plano)
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
  const logoMaxH = 12; // ≈ 40px

  // Logo (única imagen rasterizada permitida)
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 8, logoMaxH, logoMaxH);
      emisorX = ML + logoMaxH + 3;
    } catch { /* ignore */ }
  }

  // Nombre comercial en MAYÚSCULAS — 12pt bold
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  const companyName = (empresa.nombre || empresa.razon_social || '').toUpperCase();
  doc.text(companyName, emisorX, y);
  y += 4.5;

  // RFC · email — 9pt gris
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const ids: string[] = [];
  if (empresa.rfc) ids.push(`RFC: ${empresa.rfc}`);
  if (empresa.email) ids.push(empresa.email);
  if (ids.length) {
    doc.text(ids.join('  ·  '), emisorX, y);
    y += 4;
  }

  // Dirección/teléfono opcional, una línea — 9pt gris
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado].filter(Boolean).join(', ');
  const extras: string[] = [];
  if (addr) extras.push(addr);
  if (empresa.telefono) extras.push(`Tel: ${empresa.telefono}`);
  if (extras.length) {
    const line = doc.splitTextToSize(extras.join(' · '), (pageW * 0.55) - emisorX)[0];
    doc.text(line, emisorX, y);
    y += 4;
  }

  // ── Derecha ──
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(docType, rightX, 14, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  let ry = 18.5;
  if (folio) {
    doc.text(`Folio: ${folio}`, rightX, ry, { align: 'right' });
    ry += 4;
  }
  // Generado
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  doc.text(
    `Generado: ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    rightX, ry, { align: 'right' }
  );
  ry += 4;

  if (statusLabel) {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(`Estado: ${statusLabel.toUpperCase()}`, rightX, ry, { align: 'right' });
    ry += 4;
  }

  // Divisoria negra 2 px (≈ 0.7 mm)
  const dividerY = Math.max(y, ry) + 2;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.7);
  doc.line(ML, dividerY, rightX, dividerY);

  return dividerY + 6;
}

// ══════════════════════════════════════════════════════════
// INFO GRID — Dos columnas, separadores en negro suave
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
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text(leftTitle.toUpperCase(), colL, y);
  doc.text(rightTitle.toUpperCase(), colR, y);
  y += 5;

  // Línea separadora bajo títulos
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(ML, y - 2, rightX, y - 2);

  // Left rows
  let ly = y;
  for (const [lbl, val] of leftRows) {
    if (lbl === '_name') {
      doc.setFontSize(10.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(val, colL, ly);
      ly += 4.8;
    } else {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(lbl, colL, ly);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(val, colL + 32, ly);
      ly += 4.5;
    }
  }

  // Right rows
  let ry = y;
  for (const [lbl, val] of rightRows) {
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(lbl, colR, ry);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(val, colR + 42, ry);
    ry += 4.5;
  }

  return Math.max(ly, ry) + 5;
}

// ══════════════════════════════════════════════════════════
// TABLE — B/N estricto, sin zebra, sin fills, sin colores
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
      fontSize: 9,
      cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 },
      lineWidth: 0,
      font: 'helvetica',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: WHITE,
      textColor: BLACK,
      fontSize: 10,
      fontStyle: 'bold',
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      lineWidth: 0, // borde dibujado a mano en didDrawCell
      overflow: 'visible',
      minCellHeight: 0,
    },
    bodyStyles: { fillColor: WHITE },
    alternateRowStyles: { fillColor: WHITE },
    columnStyles: columnStyles || {},
    didParseCell: (data: any) => {
      if (data.section === 'head' && columnStyles && columnStyles[data.column.index]?.halign) {
        data.cell.styles.halign = columnStyles[data.column.index].halign;
      }
      if (didParseCell) didParseCell(data);
    },
    didDrawCell: (data: any) => {
      if (data.section === 'head') {
        // Borde inferior negro 1px bajo el encabezado
        doc.setDrawColor(...BLACK);
        doc.setLineWidth(0.4);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
      if (data.section === 'body') {
        // Borde inferior gris claro 0.5px en cada fila
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.15);
        doc.line(data.cell.x, data.cell.y + data.cell.height, data.cell.x + data.cell.width, data.cell.y + data.cell.height);
      }
    },
  });

  return (doc as any).lastAutoTable.finalY + 6;
}

// ══════════════════════════════════════════════════════════
// TOTALS — Borde superior negro 1px en la fila TOTAL
// ══════════════════════════════════════════════════════════
export function drawTotalsBlock(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean; red?: boolean; separator?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const totLabelX = rightX - 56;

  // Borde superior suave del bloque
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(totLabelX - 10, y - 2, rightX, y - 2);
  y += 3;

  for (const row of rows) {
    if (row.separator) {
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(totLabelX - 10, y, rightX, y);
      y += 4;
    }

    if (row.bold) {
      // Fila Total — borde superior negro 1 px
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.4);
      doc.line(totLabelX - 10, y - 1, rightX, y - 1);
      y += 4;

      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 7;
    } else {
      doc.setFontSize(9.5);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(row.label, totLabelX, y, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...BLACK);
      doc.text(row.value, rightX, y, { align: 'right' });
      y += 5;
    }
  }
  return y;
}

// ══════════════════════════════════════════════════════════
// IMPORTE CON LETRA
// ══════════════════════════════════════════════════════════
export function drawImporteConLetra(doc: jsPDF, y: number, text: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const midX = pageW / 2;

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 6;

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLACK);
  doc.text(text.toUpperCase(), midX, y, { align: 'center' });
  y += 5;

  doc.line(ML, y, rightX, y);
  return y + 7;
}

// ══════════════════════════════════════════════════════════
// NOTES — Caja simple con borde gris (sin fondo)
// ══════════════════════════════════════════════════════════
export function drawNotes(doc: jsPDF, y: number, notes: string, title = 'NOTAS'): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const contentW = rightX - ML;
  y = checkPageBreak(doc, y, 25);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const textLines = doc.splitTextToSize(notes, contentW - 12);
  const boxH = 8 + textLines.length * 4 + 5;

  // Caja blanca con borde gris (sin relleno gris)
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.rect(ML, y, contentW, boxH, 'S');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...MUTED);
  doc.text(title.toUpperCase(), ML + 6, y + 6);

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  doc.text(textLines, ML + 6, y + 11);

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
  const rightX = pageW - MR;
  y = checkPageBreak(doc, y, 40);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(ML, y, rightX, y);
  y += 16;

  const sigW = (pageW - ML - MR - 28) / 2;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(ML + 8, y, ML + 8 + sigW, y);
  doc.line(pageW - MR - 8 - sigW, y, pageW - MR - 8, y);

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(left.title, ML + 8 + sigW / 2, y + 5, { align: 'center' });
  if (left.name) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(left.name, ML + 8 + sigW / 2, y + 10, { align: 'center' });
  }

  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  doc.setFont('helvetica', 'normal');
  doc.text(right.title, pageW - MR - 8 - sigW / 2, y + 5, { align: 'center' });
  if (right.name) {
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BLACK);
    doc.text(right.name, pageW - MR - 8 - sigW / 2, y + 10, { align: 'center' });
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

    doc.setFontSize(9);
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
