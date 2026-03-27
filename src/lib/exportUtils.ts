/**
 * Professional export utilities — Odoo-style clean Excel & PDF
 */
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// ─── Types ──────────────────────────────────────────────────────
export interface ExportColumn {
  key: string;
  header: string;
  width?: number; // Excel col width in chars
  format?: 'text' | 'number' | 'currency' | 'date' | 'percent';
  align?: 'left' | 'center' | 'right';
}

export interface ResumenGeneralExport {
  totalVentas: number;
  totalContado: number;
  totalCredito: number;
  vendedores: { nombre: string; total: number; pct: number }[];
  metodosPago: { metodo: string; total: number; pct: number }[];
}

export interface ExportOptions {
  fileName: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
  empresa?: string;
  dateRange?: { from: string; to: string };
  totals?: Record<string, number>; // key → total value for footer row
  resumenGeneral?: ResumenGeneralExport;
}

// ─── Format Helpers ─────────────────────────────────────────────
const fmt = (value: any, format?: ExportColumn['format']): string => {
  if (value === null || value === undefined) return '';
  switch (format) {
    case 'currency': return `$ ${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'number': return Number(value).toLocaleString('es-MX');
    case 'percent': return `${Number(value).toFixed(1)}%`;
    case 'date': {
      if (!value) return '';
      const d = new Date(value);
      return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    default: return String(value);
  }
};

// ─── EXCEL EXPORT ───────────────────────────────────────────────
export function exportToExcel(options: ExportOptions) {
  const { fileName, title, subtitle, columns, data, empresa, dateRange, totals } = options;

  const wb = XLSX.utils.book_new();
  const rows: any[][] = [];

  // Header rows
  rows.push([title]);
  if (empresa) rows.push([empresa]);
  if (subtitle) rows.push([subtitle]);
  if (dateRange) rows.push([`Periodo: ${dateRange.from} al ${dateRange.to}`]);
  rows.push([]); // Blank row

  // Column headers
  rows.push(columns.map(c => c.header));

  // Data rows
  data.forEach(item => {
    rows.push(columns.map(col => {
      const val = item[col.key];
      // Keep raw numbers for Excel
      if ((col.format === 'currency' || col.format === 'number' || col.format === 'percent') && val !== null && val !== undefined) {
        return Number(val);
      }
      if (col.format === 'date' && val) return val;
      return val ?? '';
    }));
  });

  // Totals row
  if (totals) {
    rows.push(columns.map(col => {
      if (col.key in totals) return totals[col.key];
      if (columns.indexOf(col) === 0) return 'TOTAL';
      return '';
    }));
  }

  // Resumen General sheet
  if (resumenGeneral) {
    rows.push([]);
    rows.push([]);
    rows.push(['RESUMEN GENERAL DE VENTAS']);
    rows.push([]);
    rows.push(['Total Ventas Generales', resumenGeneral.totalVentas]);
    rows.push(['Total Ventas de Contado', resumenGeneral.totalContado]);
    rows.push(['Total Ventas a Crédito', resumenGeneral.totalCredito]);
    rows.push([]);
    rows.push(['DESGLOSE POR VENDEDOR']);
    rows.push(['Vendedor', 'Total', '% Participación']);
    for (const v of resumenGeneral.vendedores) {
      rows.push([v.nombre, v.total, `${v.pct.toFixed(1)}%`]);
    }
    rows.push([]);
    rows.push(['DESGLOSE POR MÉTODO DE PAGO']);
    rows.push(['Método', 'Total', '% Participación']);
    const metodoPagoLabels: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', cheque: 'Cheque', deposito: 'Depósito' };
    for (const m of resumenGeneral.metodosPago) {
      rows.push([metodoPagoLabels[m.metodo] ?? m.metodo, m.total, `${m.pct.toFixed(1)}%`]);
    }
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths
  ws['!cols'] = columns.map(c => ({ wch: c.width ?? Math.max(c.header.length + 2, 12) }));

  // Merge title row
  const titleRow = 0;
  ws['!merges'] = [
    { s: { r: titleRow, c: 0 }, e: { r: titleRow, c: columns.length - 1 } },
  ];

  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}

// ─── PDF EXPORT ─────────────────────────────────────────────────
export function exportToPDF(options: ExportOptions) {
  const { fileName, title, subtitle, columns, data, empresa, dateRange, totals } = options;

  const doc = new jsPDF({
    orientation: data.length > 0 && columns.length > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // Company name
  if (empresa) {
    doc.setFontSize(10);
    doc.setTextColor(120, 120, 120);
    doc.text(empresa, pageWidth / 2, y, { align: 'center' });
    y += 6;
  }

  // Title
  doc.setFontSize(16);
  doc.setTextColor(30, 30, 50);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, y, { align: 'center' });
  y += 6;

  // Subtitle / date range
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  if (subtitle) {
    doc.text(subtitle, pageWidth / 2, y, { align: 'center' });
    y += 5;
  }
  if (dateRange) {
    doc.text(`Periodo: ${dateRange.from} al ${dateRange.to}`, pageWidth / 2, y, { align: 'center' });
    y += 5;
  }

  // Separator line
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.3);
  doc.line(14, y, pageWidth - 14, y);
  y += 4;

  // Table
  const head = [columns.map(c => c.header)];
  const body = data.map(item =>
    columns.map(col => fmt(item[col.key], col.format))
  );

  // Add totals row
  if (totals) {
    body.push(columns.map(col => {
      if (col.key in totals) return fmt(totals[col.key], col.format);
      if (columns.indexOf(col) === 0) return 'TOTAL';
      return '';
    }));
  }

  const colAligns = columns.map(c => {
    if (c.align) return c.align;
    if (c.format === 'currency' || c.format === 'number' || c.format === 'percent') return 'right';
    return 'left';
  }) as ('left' | 'center' | 'right')[];

  autoTable(doc, {
    startY: y,
    head,
    body,
    styles: {
      fontSize: 8,
      cellPadding: 2,
      lineColor: [220, 220, 220],
      lineWidth: 0.1,
    },
    headStyles: {
      fillColor: [55, 65, 81],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
    },
    bodyStyles: {
      textColor: [50, 50, 50],
    },
    alternateRowStyles: {
      fillColor: [248, 249, 250],
    },
    columnStyles: Object.fromEntries(
      columns.map((col, i) => [i, { halign: colAligns[i] }])
    ),
    // Bold totals row
    didParseCell: (data: any) => {
      if (totals && data.section === 'body' && data.row.index === body.length - 1) {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = [235, 235, 240];
      }
    },
    // Footer
    didDrawPage: (data: any) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      doc.setFontSize(7);
      doc.setTextColor(150);
      doc.text(
        `Página ${data.pageNumber} de ${pageCount}`,
        pageWidth - 14,
        doc.internal.pageSize.getHeight() - 8,
        { align: 'right' }
      );
      doc.text(
        `Generado: ${new Date().toLocaleString('es-MX')}`,
        14,
        doc.internal.pageSize.getHeight() - 8,
      );
    },
    margin: { left: 14, right: 14 },
  });

  doc.save(`${fileName}.pdf`);
}

// ─── Quick table export (for list pages) ────────────────────────
export function exportTableToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  fileName: string,
  title: string,
) {
  exportToExcel({ fileName, title, columns, data });
}
