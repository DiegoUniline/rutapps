/**
 * Shared PDF document utilities — Rutapp B/N corporate standard
 * Strictly black & white, 100% vector, Helvetica.
 */
import type jsPDF from 'jspdf';

// ── B/N palette (kept under the historical PDF.* names to preserve API) ──
const BLACK: [number, number, number] = [26, 26, 26];          // #1a1a1a
const MUTED: [number, number, number] = [110, 110, 110];       // #6E6E6E
const LIGHT: [number, number, number] = [180, 180, 180];       // #B4B4B4
const BORDER: [number, number, number] = [220, 220, 220];      // #DCDCDC
const WHITE: [number, number, number] = [255, 255, 255];

export const PDF = {
  black: BLACK,
  dark: BLACK,
  muted: MUTED,
  light: LIGHT,
  border: BORDER,
  bgAlt: WHITE,
  white: WHITE,
  // Status colors collapse to black to enforce B/N.
  success: BLACK,
  danger: BLACK,
};

export const ML = 14;
export const MR = 14;

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
}

// ── Format helpers ──
export const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtMoney = (n: number, symbol: string = '$') =>
  `${symbol}${fmtCurrency(n)}`;

export const fmtDate = (d: string) => {
  try {
    const dt = new Date(d + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};

export const fmtDateTime = (d: string) => {
  try {
    const dt = new Date(d);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()} ${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  } catch { return d; }
};

/**
 * Header B/N: empresa+RFC+email izquierda, doc+ref+generado derecha,
 * divisoria negra 2px abajo. Logo opcional máx 12mm (~40px).
 */
export function drawHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docTitle: string,
  docReference: string,
  logoBase64?: string | null,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  let y = 14;
  let leftX = ML;

  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML, 8, 12, 12);
      leftX = ML + 12 + 3;
    } catch { /* ignore */ }
  }

  // Nombre comercial — MAYÚSCULAS, 12pt bold
  doc.setTextColor(...BLACK);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text((empresa.nombre || '').toUpperCase(), leftX, y);
  y += 4.5;

  // RFC · email
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  const ids: string[] = [];
  if (empresa.rfc) ids.push(`RFC: ${empresa.rfc}`);
  if (empresa.email) ids.push(empresa.email);
  if (ids.length) { doc.text(ids.join('  ·  '), leftX, y); y += 4; }

  // Dirección/tel
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado, empresa.cp].filter(Boolean).join(', ');
  const extras: string[] = [];
  if (addr) extras.push(addr);
  if (empresa.telefono) extras.push(`Tel: ${empresa.telefono}`);
  if (extras.length) {
    const line = doc.splitTextToSize(extras.join(' · '), (pageW * 0.55) - leftX)[0];
    doc.text(line, leftX, y);
    y += 4;
  }

  // ── Derecha ──
  doc.setTextColor(...BLACK);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, pageW - MR, 14, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...MUTED);
  let ry = 18.5;
  if (docReference) {
    doc.text(docReference, pageW - MR, ry, { align: 'right' });
    ry += 4;
  }
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  doc.text(
    `Generado: ${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    pageW - MR, ry, { align: 'right' }
  );
  ry += 4;

  // Divisoria negra 2px
  const lineY = Math.max(y, ry) + 2;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.7);
  doc.line(ML, lineY, pageW - MR, lineY);

  return lineY + 6;
}

export function drawInfoSection(
  doc: jsPDF,
  y: number,
  leftRows: [string, string][],
  rightRows: [string, string][],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const midX = pageW / 2;
  const labelW = 32;

  const maxRows = Math.max(leftRows.length, rightRows.length);
  for (let i = 0; i < maxRows; i++) {
    const ly = y + i * 5;
    if (leftRows[i]) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(leftRows[i][0], ML, ly);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(leftRows[i][1], ML + labelW, ly);
    }
    if (rightRows[i]) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...MUTED);
      doc.text(rightRows[i][0], midX + 10, ly);
      doc.setTextColor(...BLACK);
      doc.setFont('helvetica', 'bold');
      doc.text(rightRows[i][1], midX + 10 + labelW, ly);
    }
  }

  return y + maxRows * 5 + 4;
}

/**
 * Totals block right-aligned. La fila bold lleva borde superior negro 1px.
 */
export function drawTotals(
  doc: jsPDF,
  y: number,
  rows: { label: string; value: string; bold?: boolean }[],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const labelX = rightX - 60;

  rows.forEach((row, i) => {
    const ry = y + i * 5.5;

    if (row.bold) {
      // Línea superior negra 1px
      doc.setDrawColor(...BLACK);
      doc.setLineWidth(0.4);
      doc.line(labelX, ry - 3, rightX, ry - 3);
    }

    doc.setFontSize(row.bold ? 10.5 : 9);
    doc.setFont('helvetica', row.bold ? 'bold' : 'normal');
    doc.setTextColor(...(row.bold ? BLACK : MUTED));
    doc.text(row.label, labelX, ry);
    doc.setTextColor(...BLACK);
    doc.text(row.value, rightX, ry, { align: 'right' });
  });

  return y + rows.length * 5.5 + 4;
}

export function drawSectionTitle(doc: jsPDF, y: number, title: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setTextColor(...BLACK);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(title.toUpperCase(), ML, y);

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(ML, y + 2, pageW - MR, y + 2);

  return y + 6;
}

// Tabla: encabezado sobre fondo blanco, sin bordes (los pintamos a mano si se usa).
// Mantener API para autoTable consumers.
export const TABLE_HEAD_STYLE = {
  fillColor: WHITE,
  textColor: BLACK,
  fontSize: 10,
  fontStyle: 'bold' as const,
  cellPadding: 3,
  lineColor: BLACK,
  lineWidth: 0,
};

export const TABLE_BODY_STYLE = {
  fillColor: WHITE,
  fontSize: 9,
  cellPadding: 2.5,
  textColor: BLACK,
  lineColor: BORDER,
  lineWidth: 0,
};

export const TABLE_ALT_STYLE = {
  fillColor: WHITE,
};

/** Footer Rutapp · [empresa]  |  Página X de Y */
export function drawFooter(doc: jsPDF, footerText = 'rutapp.mx') {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();

  // Acepta tanto el formato "rutapp.mx" como un nombre de empresa para retrocompatibilidad.
  const empresaNombre = footerText && footerText !== 'rutapp.mx' ? footerText : '';
  const leftTxt = empresaNombre ? `Rutapp · ${empresaNombre}` : 'Rutapp';

  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.line(ML, pageH - 13, pageW - MR, pageH - 13);
    doc.setTextColor(...MUTED);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(leftTxt, ML, pageH - 8);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MR, pageH - 8, { align: 'right' });
  }
}

export function drawNotes(doc: jsPDF, y: number, notes: string, label = 'Notas'): number {
  const pageW = doc.internal.pageSize.getWidth();
  if (y > 240) { doc.addPage(); y = 14; }
  doc.setTextColor(...MUTED);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(`${label.toUpperCase()}:`, ML, y);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...BLACK);
  const split = doc.splitTextToSize(notes, pageW - ML - MR);
  doc.text(split, ML, y + 4);
  return y + 4 + split.length * 3.6;
}

export function checkPageBreak(doc: jsPDF, y: number, needed = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 14;
  }
  return y;
}

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
