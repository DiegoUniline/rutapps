/**
 * Shared PDF document utilities — Odoo-style professional layout
 * Reusable header, footer, info boxes and summary cards
 */
import jsPDF from 'jspdf';

// ── Color palette ──
export const PDF_COLORS = {
  primary: [37, 99, 235] as [number, number, number],     // blue-600
  indigo: [79, 70, 229] as [number, number, number],      // indigo-600
  dark: [15, 23, 42] as [number, number, number],         // slate-900
  muted: [100, 116, 139] as [number, number, number],     // slate-500
  success: [22, 163, 74] as [number, number, number],     // green-600
  danger: [220, 38, 38] as [number, number, number],      // red-600
  warning: [217, 119, 6] as [number, number, number],     // amber-600
  teal: [13, 148, 136] as [number, number, number],       // teal-600
};

export const MARGIN_L = 14;
export const MARGIN_R = 14;

export interface EmpresaInfo {
  nombre: string;
  razon_social?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  telefono?: string | null;
  email?: string | null;
}

// ── Format helpers ──
export const fmtCurrency = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmtDate = (d: string) => {
  try {
    return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return d; }
};

export const fmtDateTime = (d: string) => {
  try {
    return new Date(d).toLocaleString('es-MX', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return d; }
};

// ── Header bar (colored strip at top) ──
export function drawHeader(
  doc: jsPDF,
  empresa: EmpresaInfo,
  docTitle: string,
  docReference: string,
  color: [number, number, number] = PDF_COLORS.primary,
): number {
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFillColor(...color);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), MARGIN_L, 12);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const details = [
    empresa.razon_social,
    empresa.rfc ? `RFC: ${empresa.rfc}` : null,
    empresa.direccion,
    empresa.telefono ? `Tel: ${empresa.telefono}` : null,
  ].filter(Boolean).join('  ·  ');
  if (details) doc.text(details, MARGIN_L, 18);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(docTitle, pageW - MARGIN_R, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.text(docReference, pageW - MARGIN_R, 18, { align: 'right' });

  return 35;
}

// ── Info box (rounded rect with key-value rows) ──
export function drawInfoBox(
  doc: jsPDF,
  y: number,
  title: string,
  rows: (string | null)[][],
): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN_L - MARGIN_R;
  const rowCount = rows.filter(r => r.some(Boolean)).length;
  const boxH = 6 + rowCount * 6;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(MARGIN_L, y, contentW, boxH, 2, 2, 'FD');

  doc.setTextColor(...PDF_COLORS.dark);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN_L + 4, y + 6);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF_COLORS.muted);

  let ry = y + 12;
  rows.forEach(row => {
    const text = row.filter(Boolean).join('  ·  ');
    if (text) {
      doc.text(text, MARGIN_L + 4, ry);
      ry += 6;
    }
  });

  return y + boxH + 6;
}

// ── Summary metric boxes (up to 4 boxes) ──
export interface SummaryBox {
  label: string;
  value: string;
  color?: [number, number, number];
  bgColor?: [number, number, number];
  borderColor?: [number, number, number];
}

export function drawSummaryBoxes(doc: jsPDF, y: number, boxes: SummaryBox[]): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN_L - MARGIN_R;
  const gap = 4;
  const boxW = (contentW - gap * (boxes.length - 1)) / boxes.length;

  boxes.forEach((box, i) => {
    const x = MARGIN_L + i * (boxW + gap);
    doc.setFillColor(...(box.bgColor ?? [248, 250, 252]));
    doc.setDrawColor(...(box.borderColor ?? [226, 232, 240]));
    doc.roundedRect(x, y, boxW, 18, 1.5, 1.5, 'FD');

    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text(box.label, x + boxW / 2, y + 5.5, { align: 'center' });

    doc.setTextColor(...(box.color ?? PDF_COLORS.dark));
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(box.value, x + boxW / 2, y + 13, { align: 'center' });
  });

  return y + 24;
}

// ── Section title ──
export function drawSectionTitle(
  doc: jsPDF,
  y: number,
  title: string,
  color: [number, number, number] = PDF_COLORS.primary,
): number {
  doc.setTextColor(...color);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(title, MARGIN_L, y + 1);
  return y + 4;
}

// ── Footer on all pages ──
export function drawFooter(doc: jsPDF) {
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN_L, pageH - 14, pageW - MARGIN_R, pageH - 14);
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Elaborado por Uniline — Innovación en la nube', MARGIN_L, pageH - 9);
    doc.text(`Página ${i} de ${totalPages}`, pageW - MARGIN_R, pageH - 9, { align: 'right' });
  }
}

// ── Notes section ──
export function drawNotes(doc: jsPDF, y: number, notes: string): number {
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - MARGIN_L - MARGIN_R;
  if (y > 240) { doc.addPage(); y = 14; }
  doc.setTextColor(...PDF_COLORS.muted);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.text('NOTAS:', MARGIN_L, y);
  doc.setFont('helvetica', 'normal');
  const split = doc.splitTextToSize(notes, contentW);
  doc.text(split, MARGIN_L, y + 5);
  return y + 5 + split.length * 3.5;
}

// ── Check page break ──
export function checkPageBreak(doc: jsPDF, y: number, needed: number = 40): number {
  if (y > doc.internal.pageSize.getHeight() - needed) {
    doc.addPage();
    return 14;
  }
  return y;
}
