/**
 * Professional export utilities — Odoo-style clean Excel & PDF
 */
import * as XLSX from 'xlsx';
import { getCurrencyConfig } from '@/lib/currency';
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

export interface ExportGroup {
  key: string;
  label: string;
  rows: Record<string, any>[];
  subtotals: Record<string, number>;
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
  /** Currency code of the empresa (e.g. 'MXN','USD'). Used for symbol in formatted output. */
  currencyCode?: string | null;
  /** Si se pasa, exporta con encabezados y subtotales por grupo. */
  groups?: ExportGroup[];
  /** Etiqueta de la dimensión por la que se agrupó (p.ej. "Vendedor"). */
  groupByLabel?: string;
}

// ─── Format Helpers ─────────────────────────────────────────────
const fmtDateDDMMYYYY = (value: any): string => {
  if (!value) return '';
  const s = String(value);
  const hasTime = /T\d{2}:\d{2}/.test(s);
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  if (hasTime) {
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
  }
  return `${dd}/${mm}/${yyyy}`;
};

const makeFmt = (currencyCode?: string | null) => {
  const sym = getCurrencyConfig(currencyCode).symbol;
  return (value: any, format?: ExportColumn['format']): string => {
    if (value === null || value === undefined) return '';
    switch (format) {
      case 'currency': return `${sym} ${Number(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'number': return Number(value).toLocaleString('es-MX');
      case 'percent': return `${Number(value).toFixed(1)}%`;
      case 'date': return fmtDateDDMMYYYY(value);
      default: return String(value);
    }
  };
};


// ─── EXCEL EXPORT ───────────────────────────────────────────────
export function exportToExcel(options: ExportOptions) {
  const { fileName, title, subtitle, columns, data, empresa, dateRange, totals, resumenGeneral, groups, groupByLabel } = options;

  const wb = XLSX.utils.book_new();
  const rows: any[][] = [];

  // Header rows
  rows.push([title]);
  if (empresa) rows.push([empresa]);
  if (subtitle) rows.push([subtitle]);
  if (dateRange) rows.push([`Periodo: ${fmtDateDDMMYYYY(dateRange.from)} al ${fmtDateDDMMYYYY(dateRange.to)}`]);
  if (groups && groupByLabel) rows.push([`Agrupado por: ${groupByLabel}`]);
  rows.push([]); // Blank row

  // Column headers
  rows.push(columns.map(c => c.header));

  const renderRow = (item: Record<string, any>) => columns.map(col => {
    const val = item[col.key];
    if ((col.format === 'currency' || col.format === 'number' || col.format === 'percent') && val !== null && val !== undefined && val !== '') {
      return Number(val);
    }
    if (col.format === 'date' && val) return fmtDateDDMMYYYY(val);
    return val ?? '';
  });

  if (groups && groups.length) {
    for (const g of groups) {
      const headerRowIdx = rows.length;
      rows.push([`▸ ${g.label}  (${g.rows.length})`]);
      // merge header across columns
      if (!Array.isArray((rows as any).__merges)) (rows as any).__merges = [];
      (rows as any).__merges.push({ s: { r: headerRowIdx, c: 0 }, e: { r: headerRowIdx, c: columns.length - 1 } });
      for (const r of g.rows) rows.push(renderRow(r));
      rows.push(columns.map((c, i) => {
        if (i === 0) return `Subtotal ${g.label}`;
        if (c.key in g.subtotals) return g.subtotals[c.key];
        return '';
      }));
    }
  } else {
    data.forEach(item => rows.push(renderRow(item)));
  }

  // Totals row
  if (totals) {
    rows.push(columns.map((col, i) => {
      if (col.key in totals) return totals[col.key];
      if (i === 0) return 'TOTAL';
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

  // Merges
  const merges: any[] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: columns.length - 1 } }];
  if ((rows as any).__merges) merges.push(...(rows as any).__merges);
  ws['!merges'] = merges;

  XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}


// ─── PDF EXPORT ─────────────────────────────────────────────────
// Paleta de marca Rutapp
const BRAND_PRIMARY: [number, number, number] = [37, 99, 235];   // azul Rutapp
const BRAND_DARK: [number, number, number] = [17, 24, 39];
const BRAND_MUTED: [number, number, number] = [107, 114, 128];
const ROW_ALT: [number, number, number] = [248, 250, 252];
const BORDER: [number, number, number] = [229, 231, 235];
const GROUP_HEADER: [number, number, number] = [238, 242, 255];
const SUBTOTAL_BG: [number, number, number] = [243, 244, 246];

export async function exportToPDF(options: ExportOptions) {
  const { fileName, title, subtitle, columns, data, empresa, dateRange, totals, resumenGeneral, currencyCode, groups, groupByLabel } = options;
  const fmt = makeFmt(currencyCode);

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({
    orientation: columns.length > 6 ? 'landscape' : 'portrait',
    unit: 'mm',
    format: 'letter',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 14;

  // ─── HEADER BAND (banda primaria) ──────────────────────────────
  doc.setFillColor(...BRAND_PRIMARY);
  doc.rect(0, 0, pageWidth, 22, 'F');

  // Brand
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text('Rutapp.mx', margin, 10);

  // Empresa
  if (empresa) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(219, 234, 254);
    doc.text(empresa, margin, 16);
  }

  // Título (derecha)
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.text(title, pageWidth - margin, 10, { align: 'right' });

  if (dateRange) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(219, 234, 254);
    doc.text(
      `Periodo: ${fmtDateDDMMYYYY(dateRange.from)} — ${fmtDateDDMMYYYY(dateRange.to)}`,
      pageWidth - margin, 16, { align: 'right' }
    );
  }

  let y = 28;

  // Subtitle + group label line
  const subLine: string[] = [];
  if (subtitle) subLine.push(subtitle);
  if (groups && groupByLabel) subLine.push(`Agrupado por: ${groupByLabel}`);
  if (subLine.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BRAND_MUTED);
    doc.text(subLine.join('  •  '), margin, y);
    y += 5;
  }

  // ─── TABLE BUILDING ───────────────────────────────────────────
  const head = [columns.map(c => c.header)];
  const body: any[][] = [];
  // Track each body row's "kind": data | group-header | subtotal | total
  const rowKinds: ('data' | 'group-header' | 'subtotal' | 'total')[] = [];

  const dataRow = (item: Record<string, any>) =>
    columns.map(col => fmt(item[col.key], col.format));

  if (groups && groups.length) {
    for (const g of groups) {
      body.push([{
        content: `${g.label}   (${g.rows.length})`,
        colSpan: columns.length,
        styles: {
          fillColor: GROUP_HEADER,
          textColor: BRAND_PRIMARY,
          fontStyle: 'bold' as const,
          halign: 'left' as const,
        },
      }]);
      rowKinds.push('group-header');
      for (const r of g.rows) {
        body.push(dataRow(r));
        rowKinds.push('data');
      }
      body.push(columns.map((col, i) => {
        if (i === 0) return `Subtotal ${g.label}`;
        if (col.key in g.subtotals) return fmt(g.subtotals[col.key], col.format);
        return '';
      }));
      rowKinds.push('subtotal');
    }
  } else {
    for (const item of data) {
      body.push(dataRow(item));
      rowKinds.push('data');
    }
  }

  if (totals) {
    body.push(columns.map((col, i) => {
      if (col.key in totals) return fmt(totals[col.key], col.format);
      if (i === 0) return 'TOTAL GENERAL';
      return '';
    }));
    rowKinds.push('total');
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
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2.2, bottom: 2.2, left: 3, right: 3 },
      lineColor: BORDER,
      lineWidth: 0.1,
      textColor: BRAND_DARK,
    },
    headStyles: {
      fillColor: BRAND_PRIMARY,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      halign: 'left',
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
    },
    bodyStyles: { textColor: BRAND_DARK },
    alternateRowStyles: { fillColor: ROW_ALT },
    columnStyles: Object.fromEntries(
      columns.map((col, i) => [i, { halign: colAligns[i] }])
    ),
    didParseCell: (data: any) => {
      if (data.section !== 'body') return;
      const kind = rowKinds[data.row.index];
      if (kind === 'subtotal') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = SUBTOTAL_BG;
        data.cell.styles.textColor = BRAND_DARK;
      } else if (kind === 'total') {
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fillColor = BRAND_PRIMARY;
        data.cell.styles.textColor = [255, 255, 255];
      } else if (kind === 'group-header') {
        // ya viene con estilos inline
      }
    },
    didDrawPage: (d: any) => {
      const pageCount = (doc as any).internal.getNumberOfPages();
      // Footer line
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.2);
      doc.line(margin, pageHeight - 12, pageWidth - margin, pageHeight - 12);
      // Footer text
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...BRAND_MUTED);
      const now = new Date();
      const dd = String(now.getDate()).padStart(2, '0');
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const hh = String(now.getHours()).padStart(2, '0');
      const mi = String(now.getMinutes()).padStart(2, '0');
      doc.text(
        `Rutapp.mx  ·  Generado el ${dd}/${mm}/${now.getFullYear()} ${hh}:${mi}`,
        margin, pageHeight - 6
      );
      doc.text(
        `Página ${d.pageNumber} de ${pageCount}`,
        pageWidth - margin, pageHeight - 6, { align: 'right' }
      );
    },
    margin: { left: margin, right: margin, top: 28, bottom: 16 },
  });

  // ─── RESUMEN GENERAL ───────────────────────────────────────────
  if (resumenGeneral) {
    const sym = getCurrencyConfig(currencyCode).symbol;
    const fmtCur = (n: number) => `${sym} ${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const metodoPagoLabels: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', cheque: 'Cheque', deposito: 'Depósito' };

    let ry = (doc as any).lastAutoTable?.finalY ?? 180;
    ry += 12;

    if (ry > pageHeight - 80) { doc.addPage(); ry = 28; }

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...BRAND_DARK);
    doc.text('Resumen General de Ventas', margin, ry);
    ry += 6;

    const totalsData = [
      ['Total Ventas Generales', fmtCur(resumenGeneral.totalVentas)],
      ['Total Ventas de Contado', fmtCur(resumenGeneral.totalContado)],
      ['Total Ventas a Crédito', fmtCur(resumenGeneral.totalCredito)],
    ];

    const halfRight = pageWidth / 2 + 6;

    autoTable(doc, {
      startY: ry,
      head: [['Concepto', 'Monto']],
      body: totalsData,
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 2.2, lineColor: BORDER, lineWidth: 0.1, textColor: BRAND_DARK },
      headStyles: { fillColor: BRAND_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
      columnStyles: { 1: { halign: 'right' } },
      margin: { left: margin, right: halfRight },
    });

    ry = (doc as any).lastAutoTable?.finalY ?? ry + 30;
    ry += 8;

    if (ry > pageHeight - 60) { doc.addPage(); ry = 28; }

    if (resumenGeneral.vendedores.length > 0) {
      autoTable(doc, {
        startY: ry,
        head: [['Vendedor', 'Total', '% Part.']],
        body: resumenGeneral.vendedores.map(v => [v.nombre, fmtCur(v.total), `${v.pct.toFixed(1)}%`]),
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2.2, lineColor: BORDER, lineWidth: 0.1, textColor: BRAND_DARK },
        headStyles: { fillColor: BRAND_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        margin: { left: margin, right: halfRight },
      });
      ry = (doc as any).lastAutoTable?.finalY ?? ry + 30;
      ry += 8;
    }

    if (ry > pageHeight - 60) { doc.addPage(); ry = 28; }

    if (resumenGeneral.metodosPago.length > 0) {
      autoTable(doc, {
        startY: ry,
        head: [['Método de Pago', 'Total', '% Part.']],
        body: resumenGeneral.metodosPago.map(m => [metodoPagoLabels[m.metodo] ?? m.metodo, fmtCur(m.total), `${m.pct.toFixed(1)}%`]),
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 2.2, lineColor: BORDER, lineWidth: 0.1, textColor: BRAND_DARK },
        headStyles: { fillColor: BRAND_PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 9 },
        columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
        margin: { left: margin, right: halfRight },
      });
    }
  }

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
