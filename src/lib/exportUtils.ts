/**
 * Professional export utilities — Odoo-style clean Excel & PDF
 *
 * xlsx (≈424 KB) y jspdf se cargan de forma DIFERIDA (import dinámico dentro de
 * cada función), así que NO pesan en la carga inicial: solo se descargan cuando
 * el usuario realmente exporta. No cambia el resultado del export.
 */
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

export interface ExportEmpresaInfo {
  nombre: string;
  rfc?: string | null;
  email?: string | null;
  logo_url?: string | null;
}

export interface ExportOptions {
  fileName: string;
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  data: Record<string, any>[];
  empresa?: string;
  empresaInfo?: ExportEmpresaInfo;
  dateRange?: { from: string; to: string };
  totals?: Record<string, number>; // key → total value for footer row
  resumenGeneral?: ResumenGeneralExport;
  /** Currency code of the empresa (e.g. 'MXN','USD'). Used for symbol in formatted output. */
  currencyCode?: string | null;
  /** Si se pasa, exporta con encabezados y subtotales por grupo. */
  groups?: ExportGroup[];
  /** Etiqueta de la dimensión por la que se agrupó (p.ej. "Vendedor"). */
  groupByLabel?: string;
  /** Filtros aplicados en pantalla; el PDF los muestra bajo el encabezado. */
  filtros?: { label: string; value: string }[];
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
export async function exportToExcel(options: ExportOptions) {
  const { fileName, title, subtitle, columns, data, empresa, dateRange, totals, resumenGeneral, groups, groupByLabel } = options;

  const XLSX = await import('xlsx');
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


// ─── PDF EXPORT (B/N corporativo, 100% vectorial) ───────────────
const BW_BLACK: [number, number, number] = [26, 26, 26];
const BW_MUTED: [number, number, number] = [110, 110, 110];
const BW_BORDER_LIGHT: [number, number, number] = [220, 220, 220];

async function loadLogoDataUrl(url: string): Promise<{ dataUrl: string; w: number; h: number } | null> {
  try {
    const res = await fetch(url, { mode: 'cors' });
    if (!res.ok) return null;
    const blob = await res.blob();
    const dataUrl: string = await new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result as string);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
    const dims: { w: number; h: number } = await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
      img.onerror = () => resolve({ w: 1, h: 1 });
      img.src = dataUrl;
    });
    return { dataUrl, w: dims.w, h: dims.h };
  } catch {
    return null;
  }
}

/** Descarga el PDF del reporte (B/N corporativo). */
export async function exportToPDF(options: ExportOptions) {
  const doc = await construirPdfExport(options);
  doc.save(`${options.fileName}.pdf`);
}

/** El mismo PDF de `exportToPDF`, como archivo (para abrirlo e imprimir). */
export async function generarPdfExport(options: ExportOptions): Promise<Blob> {
  const doc = await construirPdfExport(options);
  return doc.output('blob');
}

async function construirPdfExport(options: ExportOptions) {
  const { title, columns, data, empresa, empresaInfo, dateRange, groups, filtros, resumenGeneral } = options;

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

  const empresaNombre = (empresaInfo?.nombre || empresa || '').toUpperCase();
  const rfc = empresaInfo?.rfc?.trim();
  const email = empresaInfo?.email?.trim();
  const logoUrl = empresaInfo?.logo_url?.trim();

  // ─── Logo opcional ──────────────────────────────────────────────
  let logoWidthMm = 0;
  if (logoUrl) {
    const logo = await loadLogoDataUrl(logoUrl);
    if (logo) {
      const maxH = 12; // ≈ 40px
      const ratio = logo.w / logo.h || 1;
      const h = maxH;
      const w = Math.min(maxH * ratio, 35);
      try {
        const fmt = /png/i.test(logo.dataUrl) ? 'PNG' : 'JPEG';
        doc.addImage(logo.dataUrl, fmt, margin, 10, w, h);
        logoWidthMm = w + 3;
      } catch { /* ignore */ }
    }
  }

  // ─── Encabezado izquierda: empresa / rfc / email ────────────────
  const leftX = margin + logoWidthMm;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BW_BLACK);
  doc.text(empresaNombre || '—', leftX, 14);

  const subParts: string[] = [];
  if (rfc) subParts.push(`RFC: ${rfc}`);
  if (email) subParts.push(email);
  if (subParts.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...BW_MUTED);
    doc.text(subParts.join('  ·  '), leftX, 19);
  }

  // ─── Encabezado derecha: título / periodo / generado ────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BW_BLACK);
  doc.text(title, pageWidth - margin, 14, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BW_MUTED);
  let rightY = 19;
  if (dateRange) {
    doc.text(
      `Periodo: ${fmtDateDDMMYYYY(dateRange.from)} – ${fmtDateDDMMYYYY(dateRange.to)}`,
      pageWidth - margin, rightY, { align: 'right' }
    );
    rightY += 4;
  }
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const yyyy = now.getFullYear();
  const hh = String(now.getHours()).padStart(2, '0');
  const mi = String(now.getMinutes()).padStart(2, '0');
  doc.text(`Generado: ${dd}/${mm}/${yyyy} ${hh}:${mi}`, pageWidth - margin, rightY, { align: 'right' });

  // Línea divisoria negra 2px (≈ 0.7mm)
  const dividerY = 28;
  doc.setDrawColor(...BW_BLACK);
  doc.setLineWidth(0.7);
  doc.line(margin, dividerY, pageWidth - margin, dividerY);

  // ─── Filtros aplicados (los mismos que muestra la pantalla) ─────
  let inicioTabla = dividerY + 4;
  const filtrosActivos = (filtros ?? []).filter(f => f.value);
  if (filtrosActivos.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...BW_MUTED);
    const lineas = doc.splitTextToSize(`Filtros: ${filtrosActivos.map(f => `${f.label}: ${f.value}`).join(' · ')}`, pageWidth - margin * 2) as string[];
    doc.text(lineas, margin, dividerY + 5);
    inicioTabla = dividerY + 5 + lineas.length * 4;
  }

  // ─── Datos: ordenar por fecha si existe la columna ──────────────
  const fechaCol = columns.find(c => c.format === 'date' || /fecha/i.test(c.key) || /fecha/i.test(c.header));
  let rows = [...data];
  if (fechaCol) {
    rows.sort((a, b) => {
      const av = a[fechaCol.key]; const bv = b[fechaCol.key];
      const at = av ? new Date(av).getTime() : 0;
      const bt = bv ? new Date(bv).getTime() : 0;
      return at - bt;
    });
  }

  // Si vinieron agrupados, aplanamos para respetar el spec (sin agrupación visual)
  if (!rows.length && groups && groups.length) {
    rows = groups.flatMap(g => g.rows);
    if (fechaCol) {
      rows.sort((a, b) => {
        const at = a[fechaCol.key] ? new Date(a[fechaCol.key]).getTime() : 0;
        const bt = b[fechaCol.key] ? new Date(b[fechaCol.key]).getTime() : 0;
        return at - bt;
      });
    }
  }

  // ─── Totales generales (Cantidad + currency cols) ───────────────
  const sumKeys = columns
    .filter(c => c.format === 'currency' || c.format === 'number' || /cantidad/i.test(c.key) || /cantidad/i.test(c.header))
    .map(c => c.key);
  const totalsRow: Record<string, number> = {};
  for (const k of sumKeys) {
    let s = 0;
    for (const r of rows) {
      const v = Number(r[k]);
      if (!Number.isNaN(v) && Number.isFinite(v)) s += v;
    }
    totalsRow[k] = s;
  }

  const intFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
  const cellFmt = (val: any, format?: ExportColumn['format']) => {
    if (val == null || val === '') return '';
    if (format === 'date') return fmtDateDDMMYYYY(val);
    if (format === 'currency') {
      const n = Number(val); if (Number.isNaN(n)) return String(val);
      return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    }
    if (format === 'number') {
      const n = Number(val); if (Number.isNaN(n)) return String(val);
      // cantidades sin decimales por defecto
      return intFmt.format(n);
    }
    if (format === 'percent') {
      const n = Number(val); if (Number.isNaN(n)) return String(val);
      return `${n.toFixed(1)}%`;
    }
    return String(val);
  };

  const head = [columns.map(c => c.header)];
  const body = rows.map(r => columns.map(c => cellFmt(r[c.key], c.format)));

  const foot: any[][] = [];
  const footRow = columns.map((c, i) => {
    if (i === 0) return { content: 'Total general', styles: { fontStyle: 'bold' as const, halign: 'left' as const } };
    if (c.key in totalsRow) {
      const formatted = c.format === 'currency'
        ? `$${totalsRow[c.key].toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : c.format === 'number' || /cantidad/i.test(c.key) || /cantidad/i.test(c.header)
          ? intFmt.format(totalsRow[c.key])
          : '';
      return { content: formatted, styles: { fontStyle: 'bold' as const, halign: 'right' as const } };
    }
    return { content: '', styles: { fontStyle: 'bold' as const } };
  });
  foot.push(footRow);

  const colAligns: ('left' | 'center' | 'right')[] = columns.map(c => {
    if (c.align) return c.align;
    if (c.format === 'currency' || c.format === 'number' || c.format === 'percent') return 'right';
    if (/cantidad/i.test(c.key) || /cantidad/i.test(c.header)) return 'right';
    return 'left';
  });

  autoTable(doc, {
    startY: inicioTabla,
    head,
    body,
    foot,
    theme: 'plain',
    showFoot: 'lastPage',
    showHead: 'everyPage',
    styles: {
      font: 'helvetica',
      fontSize: 9,
      cellPadding: { top: 2.4, bottom: 2.4, left: 3, right: 3 },
      textColor: BW_BLACK,
      lineColor: BW_BORDER_LIGHT,
      lineWidth: 0,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: BW_BLACK,
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'left',
      cellPadding: { top: 3, bottom: 3, left: 3, right: 3 },
      lineColor: BW_BLACK,
      lineWidth: { top: 0, right: 0, bottom: 0.4, left: 0 } as any,
    },
    bodyStyles: {
      lineColor: BW_BORDER_LIGHT,
      lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 } as any,
    },
    footStyles: {
      fillColor: [255, 255, 255],
      textColor: BW_BLACK,
      fontStyle: 'bold',
      lineColor: BW_BLACK,
      lineWidth: { top: 0.4, right: 0, bottom: 0, left: 0 } as any,
    },
    columnStyles: Object.fromEntries(
      columns.map((_, i) => [i, { halign: colAligns[i] }])
    ),
    didDrawPage: (d: any) => {
      // Footer
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...BW_MUTED);
      const empresaFooter = empresaInfo?.nombre || empresa || '';
      doc.text(`Rutapp · ${empresaFooter}`, margin, pageHeight - 8);
      const pageStr = `Página ${d.pageNumber} de {totalPages}`;
      doc.text(pageStr, pageWidth - margin, pageHeight - 8, { align: 'right' });
    },
    margin: { left: margin, right: margin, top: dividerY + 4, bottom: 14 },
  });

  if (resumenGeneral) dibujarResumenGeneralPdf(doc, autoTable, resumenGeneral, margin, empresaInfo?.nombre || empresa || '');

  // Reemplazar {totalPages} usando putTotalPages
  if ((doc as any).putTotalPages) {
    (doc as any).putTotalPages('{totalPages}');
  }

  return doc;
}

/** Resumen general de ventas (totales, vendedores y métodos de pago), como el pie de la pantalla. */
function dibujarResumenGeneralPdf(
  doc: import('jspdf').jsPDF,
  autoTable: typeof import('jspdf-autotable').default,
  r: ResumenGeneralExport,
  margin: number,
  empresaFooter: string,
) {
  const money = (n: number) => `$${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = (n: number) => `${Number(n || 0).toFixed(1)}%`;
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const ultimaY = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 40;
  let ultimaConPie = doc.getNumberOfPages();
  let y = ultimaY + 10;
  if (y > pageHeight - 50) { doc.addPage(); y = 20; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...BW_BLACK);
  doc.text('RESUMEN GENERAL', margin, y);
  const tabla = (head: string[], body: string[][], startY: number) => {
    autoTable(doc, {
      startY,
      head: [head],
      body,
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 9, cellPadding: { top: 1.8, bottom: 1.8, left: 3, right: 3 }, textColor: BW_BLACK },
      headStyles: { fontStyle: 'bold', fillColor: [255, 255, 255], textColor: BW_BLACK },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: (d: { section: string; column: { index: number }; cell: { styles: { halign: string } } }) => {
        if (d.section === 'head' && d.column.index > 0) d.cell.styles.halign = 'right';
      },
      margin: { left: margin, right: margin, top: 20, bottom: 14 },
      didDrawPage: () => {
        // Pie solo en hojas nuevas (las anteriores ya lo traen de la tabla principal).
        const n = doc.getCurrentPageInfo().pageNumber;
        if (n <= ultimaConPie) return;
        ultimaConPie = n;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(...BW_MUTED);
        doc.text(`Rutapp · ${empresaFooter}`, margin, pageHeight - 8);
        doc.text(`Página ${n} de {totalPages}`, pageWidth - margin, pageHeight - 8, { align: 'right' });
      },
    });
    return ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY) + 5;
  };
  y = tabla(['Concepto', 'Total'], [
    ['Total ventas generales', money(r.totalVentas)],
    ['Total ventas de contado', money(r.totalContado)],
    ['Total ventas a crédito', money(r.totalCredito)],
  ], y + 3);
  if (r.vendedores.length) y = tabla(['Vendedor', 'Total', '%'], r.vendedores.map(v => [v.nombre, money(v.total), pct(v.pct)]), y);
  if (r.metodosPago.length) tabla(['Método de pago', 'Total', '%'], r.metodosPago.map(m => [m.metodo, money(m.total), pct(m.pct)]), y);
}




// ─── Quick table export (for list pages) ────────────────────────
export function exportTableToExcel(
  data: Record<string, any>[],
  columns: ExportColumn[],
  fileName: string,
  title: string,
) {
  return exportToExcel({ fileName, title, columns, data });
}
