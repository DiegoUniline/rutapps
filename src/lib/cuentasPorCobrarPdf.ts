/**
 * Cuentas por Cobrar PDF — mismo diseño agrupado del reporte en pantalla.
 * Header corporativo + KPIs + tabla agrupada por cliente
 * (Concepto · Documento · Num · Fecha aplic · Fecha venc · Cargos · Abonos · Saldos).
 */
import { getCurrencyConfig } from '@/lib/currency';

const ML = 14;
const MR = 14;

const PRIMARY: [number, number, number] = [0, 96, 230];
const TEXT: [number, number, number] = [26, 26, 26];
const MUTED: [number, number, number] = [110, 110, 110];
const BORDER: [number, number, number] = [225, 228, 232];
const CARD_BG: [number, number, number] = [250, 251, 253];
const ACCENT_BG: [number, number, number] = [239, 246, 255];
const DANGER: [number, number, number] = [220, 38, 38];

export interface CxCPdfRow {
  folio: string | null;
  fecha: string;
  cliente: string;
  tipo: string;
  vencimiento: string | null;
  total: number;
  abonado: number;
  saldo: number;
  vencido: boolean;
  esSaldoInicial: boolean;
}

export interface CxCPdfParams {
  empresa: {
    nombre: string;
    razon_social?: string | null;
    rfc?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    moneda?: string | null;
    logo_url?: string | null;
  };
  logoBase64?: string | null;
  rows: CxCPdfRow[];
}

const fmtC = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtD = (d: string | null) => {
  if (!d) return '—';
  try {
    const dt = new Date(String(d).slice(0, 10) + 'T12:00:00');
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};
const padDoc = (folio: string | null) => (folio ? folio.replace(/\D/g, '').padStart(10, '0') || folio : '—');

export async function generarCuentasPorCobrarPdf(params: CxCPdfParams): Promise<Blob> {
  const { empresa, logoBase64, rows } = params;
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter', compress: true });
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - ML - MR;
  const sym = getCurrencyConfig(empresa.moneda).symbol;
  const hoy = new Date().toISOString().slice(0, 10);

  // Header
  let y = 14;
  if (logoBase64) {
    try { doc.addImage(logoBase64, 'PNG', ML, y - 2, 22, 22); } catch { /* ignore */ }
  }
  const headerX = logoBase64 ? ML + 26 : ML;
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...TEXT);
  doc.text(empresa.nombre || 'Empresa', headerX, y + 3);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  const meta = [empresa.razon_social, empresa.rfc, empresa.telefono, empresa.direccion].filter(Boolean).join(' · ');
  if (meta) doc.text(meta, headerX, y + 8, { maxWidth: contentW - (headerX - ML) - 55 });

  // Título derecha
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...PRIMARY);
  doc.text('CUENTAS POR COBRAR', pageW - MR, y + 3, { align: 'right' });
  doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(...MUTED);
  doc.text(`Emitido: ${fmtD(hoy)}`, pageW - MR, y + 8, { align: 'right' });

  y += 20;
  doc.setDrawColor(...BORDER); doc.setLineWidth(0.3);
  doc.line(ML, y, pageW - MR, y);
  y += 4;

  // KPIs
  const totalSaldos = rows.reduce((s, r) => s + r.saldo, 0);
  const totalVencido = rows.filter(r => r.vencido).reduce((s, r) => s + r.saldo, 0);
  const numFolios = rows.length;
  const numClientes = new Set(rows.map(r => r.cliente)).size;
  const kpis = [
    { label: 'Por cobrar', value: `${sym}${fmtC(totalSaldos)}`, tone: PRIMARY },
    { label: 'Vencido', value: `${sym}${fmtC(totalVencido)}`, tone: totalVencido > 0 ? DANGER : MUTED },
    { label: 'Folios', value: String(numFolios), tone: TEXT },
    { label: 'Clientes', value: String(numClientes), tone: TEXT },
  ];
  const kpiW = (contentW - 6) / 4;
  kpis.forEach((k, i) => {
    const x = ML + i * (kpiW + 2);
    doc.setFillColor(...CARD_BG);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(x, y, kpiW, 14, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(k.label.toUpperCase(), x + 2.5, y + 4.5);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...k.tone);
    doc.text(k.value, x + 2.5, y + 11);
  });
  y += 18;

  // Agrupar por cliente
  const map = new Map<string, CxCPdfRow[]>();
  for (const r of rows) {
    if (!map.has(r.cliente)) map.set(r.cliente, []);
    map.get(r.cliente)!.push(r);
  }
  const grupos = Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cliente, items], idx) => {
      items.sort((a, b) => a.fecha.localeCompare(b.fecha));
      const cargos = items.reduce((s, r) => s + r.total, 0);
      const abonos = items.reduce((s, r) => s + r.abonado, 0);
      const saldos = items.reduce((s, r) => s + r.saldo, 0);
      return { cliente, num: idx + 1, items, cargos, abonos, saldos };
    });

  // Body rows
  type CellDef = { content: string; styles?: any; colSpan?: number };
  const body: CellDef[][] = [];
  const clienteHeaderRows = new Set<number>();
  const subtotalRows = new Set<number>();
  const overdueRows = new Set<number>();

  for (const g of grupos) {
    clienteHeaderRows.add(body.length);
    body.push([
      { content: String(g.num) },
      { content: g.cliente.toUpperCase(), colSpan: 8 },
    ]);
    for (const r of g.items) {
      const rowIdx = body.length;
      if (r.vencido) overdueRows.add(rowIdx);
      body.push([
        { content: '' },
        { content: r.esSaldoInicial ? 'Saldo inicial' : 'Nota de venta' },
        { content: padDoc(r.folio), styles: { font: 'courier' } },
        { content: '1', styles: { halign: 'center' } },
        { content: fmtD(r.fecha) },
        { content: fmtD(r.vencimiento ?? r.fecha) },
        { content: `${sym}${fmtC(r.total)}`, styles: { halign: 'right' } },
        { content: r.abonado > 0 ? `${sym}${fmtC(r.abonado)}` : `${sym}${fmtC(0)}`, styles: { halign: 'right', textColor: MUTED } },
        { content: `${sym}${fmtC(r.saldo)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]);
    }
    subtotalRows.add(body.length);
    body.push([
      { content: '' },
      { content: 'Subtotal cliente', colSpan: 5, styles: { halign: 'right', fontStyle: 'bold', textColor: MUTED } },
      { content: `${sym}${fmtC(g.cargos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${sym}${fmtC(g.abonos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${sym}${fmtC(g.saldos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
    ]);
  }

  const totalCargos = grupos.reduce((s, g) => s + g.cargos, 0);
  const totalAbonos = grupos.reduce((s, g) => s + g.abonos, 0);

  autoTable(doc, {
    startY: y,
    head: [[
      { content: '#', styles: { halign: 'left' } },
      'Concepto', 'Documento',
      { content: 'Num.', styles: { halign: 'center' } },
      'Fecha aplic.', 'Fecha venc.',
      { content: 'Cargos', styles: { halign: 'right' } },
      { content: 'Abonos', styles: { halign: 'right' } },
      { content: 'Saldos', styles: { halign: 'right' } },
    ]],
    body: body as any,
    foot: [[
      { content: 'TOTAL GENERAL', colSpan: 6, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${sym}${fmtC(totalCargos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${sym}${fmtC(totalAbonos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      { content: `${sym}${fmtC(totalSaldos)}`, styles: { halign: 'right', fontStyle: 'bold' } },
    ]],
    styles: { font: 'helvetica', fontSize: 8, cellPadding: { top: 1.6, right: 2, bottom: 1.6, left: 2 }, textColor: TEXT, lineColor: BORDER, lineWidth: 0.1 },
    headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: 'bold', fontSize: 8 },
    footStyles: { fillColor: ACCENT_BG, textColor: TEXT, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'left' },
      1: { cellWidth: 26 },
      2: { cellWidth: 26 },
      3: { cellWidth: 10, halign: 'center' },
      4: { cellWidth: 22 },
      5: { cellWidth: 22 },
      6: { halign: 'right' },
      7: { halign: 'right' },
      8: { halign: 'right' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const r = data.row.index;
      if (clienteHeaderRows.has(r)) {
        data.cell.styles.fillColor = ACCENT_BG;
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.textColor = PRIMARY as any;
      } else if (subtotalRows.has(r)) {
        data.cell.styles.fillColor = [248, 250, 252] as any;
        data.cell.styles.lineWidth = { top: 0.3, right: 0.1, bottom: 0.1, left: 0.1 } as any;
        data.cell.styles.lineColor = BORDER as any;
      } else if (overdueRows.has(r) && data.column.index === 5) {
        data.cell.styles.textColor = DANGER as any;
        data.cell.styles.fontStyle = 'bold';
      }
    },
    margin: { left: ML, right: MR },
  });

  // Pie con numeración
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7); doc.setTextColor(...MUTED);
    doc.text(`Página ${i} de ${pageCount}`, pageW - MR, doc.internal.pageSize.getHeight() - 6, { align: 'right' });
    doc.text(`Cuentas por Cobrar · ${empresa.nombre || ''}`, ML, doc.internal.pageSize.getHeight() - 6);
  }

  return doc.output('blob');
}
