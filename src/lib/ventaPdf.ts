/**
 * Venta/Remisión PDF — Matches the HTML design EXACTLY
 */
import {
  createDoc, ML, MR, C, fmtCurrency, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable, drawTotalsBlock,
  drawImporteConLetra, drawNotes, drawSignatures, drawFooter,
  checkPageBreak, numberToWords,
  type EmpresaInfo,
} from './pdfStyleOdoo';
import { getCurrencyConfig } from '@/lib/currency';

interface VentaPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  venta: {
    folio: string;
    fecha: string;
    tipo: string;
    status: string;
    condicion_pago: string;
    subtotal: number;
    descuento_total: number;
    iva_total: number;
    ieps_total: number;
    total: number;
    saldo_pendiente: number;
    notas?: string | null;
  };
  cliente: {
    nombre: string;
    codigo?: string | null;
    telefono?: string | null;
    direccion?: string | null;
    rfc?: string | null;
    email?: string | null;
    cp?: string | null;
  };
  vendedor?: string;
  almacen?: string;
  lineas: {
    codigo: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
    precio_unitario: number;
    descuento_pct: number;
    iva_pct: number;
    ieps_pct: number;
    total: number;
  }[];
  pagos: {
    fecha: string;
    metodo_pago: string;
    monto: number;
    referencia?: string;
  }[];
}

const STATUS_MAP: Record<string, { label: string; color: 'green' | 'red' | 'neutral' }> = {
  borrador: { label: 'Borrador', color: 'neutral' },
  confirmado: { label: 'Confirmada', color: 'green' },
  entregado: { label: 'Entregada', color: 'green' },
  facturado: { label: 'Facturada', color: 'green' },
  cancelado: { label: 'Cancelada', color: 'red' },
  pagado: { label: 'Pagada', color: 'green' },
};

export function generarVentaPdf(params: VentaPdfParams): Blob {
  const { empresa, logoBase64, venta, cliente, vendedor, almacen, lineas, pagos } = params;
  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const cc = getCurrencyConfig(empresa.moneda);
  const s = cc.symbol;

  const tipoLabel = venta.tipo === 'pedido' ? 'ORDEN DE VENTA' : 'VENTA';
  const statusInfo = STATUS_MAP[venta.status] || { label: venta.status.charAt(0).toUpperCase() + venta.status.slice(1), color: 'neutral' as const };
  const pagoLabel = venta.condicion_pago === 'credito' ? 'Crédito' : venta.condicion_pago === 'contado' ? 'Contado' : 'Por definir';

  // ── HEADER ──
  let y = drawDocHeader(doc, empresa, tipoLabel, venta.folio, logoBase64, statusInfo.label, statusInfo.color);

  // ── INFO GRID — Client left, Document info right ──
  const leftRows: [string, string][] = [
    ['_name', cliente.nombre],
    ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
    ...(cliente.direccion ? [['', cliente.direccion] as [string, string]] : []),
    ...(cliente.cp ? [['C.P.', cliente.cp] as [string, string]] : []),
    ...(cliente.email || cliente.telefono ? [['', [cliente.email, cliente.telefono].filter(Boolean).join(' · ')] as [string, string]] : []),
  ];

  const rightRows: [string, string][] = [
    ['Fecha de venta:', fmtDate(venta.fecha)],
    ['Condiciones de pago:', pagoLabel],
    ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
    ['Moneda:', `${cc.code} - ${cc.name}`],
  ];

  y = drawInfoGrid(doc, y, 'Cliente', leftRows, 'Información de la venta', rightRows);

  // ── PRODUCTS TABLE ──
  y = drawCleanTable(doc, y,
    ['Código', 'Producto', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.', 'IVA', 'IEPS', 'Importe'],
    lineas.map(l => [
      { content: l.codigo, styles: { textColor: C.sublabel, fontStyle: 'normal', fontSize: 7 } },
      l.nombre,
      { content: String(l.cantidad), styles: { halign: 'center' } },
      l.unidad || 'Pieza',
      { content: `${s}${fmtCurrency(l.precio_unitario)}`, styles: { halign: 'right' } },
      l.descuento_pct > 0
        ? { content: `${l.descuento_pct}%`, styles: { halign: 'center', textColor: C.red } }
        : { content: '—', styles: { halign: 'center', textColor: C.sublabel } },
      { content: l.iva_pct > 0 ? `${l.iva_pct}%` : '—', styles: { halign: 'center', textColor: l.iva_pct > 0 ? C.text : C.sublabel } },
      { content: l.ieps_pct > 0 ? `${l.ieps_pct}%` : '—', styles: { halign: 'center', textColor: l.ieps_pct > 0 ? C.text : C.sublabel } },
      { content: `${s}${fmtCurrency(l.total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 20 },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 18 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 14, halign: 'center' },
      6: { cellWidth: 14, halign: 'center' },
      7: { cellWidth: 14, halign: 'center' },
      8: { cellWidth: 24, halign: 'right' },
    },
  );

  // ── TOTALS ──
  const subtotalBruto = lineas.reduce((s, l) => s + (l.precio_unitario * l.cantidad), 0);
  const totalRows: { label: string; value: string; bold?: boolean; red?: boolean; separator?: boolean }[] = [];

  if (venta.descuento_total > 0) {
    totalRows.push({ label: 'Subtotal bruto:', value: `${s}${fmtCurrency(subtotalBruto)}` });
    totalRows.push({ label: 'Descuentos:', value: `-${s}${fmtCurrency(venta.descuento_total)}`, red: true });
    totalRows.push({ label: 'Subtotal neto:', value: `${s}${fmtCurrency(venta.subtotal)}`, separator: true });
  } else {
    totalRows.push({ label: 'Subtotal:', value: `${s}${fmtCurrency(venta.subtotal)}` });
  }

  if (venta.iva_total > 0) totalRows.push({ label: 'IVA 16%:', value: `${s}${fmtCurrency(venta.iva_total)}` });
  if (venta.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `${s}${fmtCurrency(venta.ieps_total)}` });
  totalRows.push({ label: 'Total:', value: `${s}${fmtCurrency(venta.total)}`, bold: true });

  y = drawTotalsBlock(doc, y, totalRows);

  // ── IMPORTE CON LETRA ──
  const words = numberToWords(venta.total);
  y = drawImporteConLetra(doc, y, words);

  // ── NOTAS ──
  if (venta.notas) {
    y = drawNotes(doc, y, venta.notas, 'Notas y condiciones');
  }

  // ── PAGOS TABLE ──
  if (pagos.length > 0) {
    y = checkPageBreak(doc, y);
    const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);

    y = drawCleanTable(doc, y,
      ['Fecha', 'Método', 'Referencia', 'Monto'],
      pagos.map(p => [
        fmtDate(p.fecha),
        p.metodo_pago,
        p.referencia || '—',
        { content: `${s}${fmtCurrency(p.monto)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      { 3: { halign: 'right' } },
    );

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total pagado: ${s}${fmtCurrency(totalPagado)}`, rightX, y - 2, { align: 'right' });
    y += 6;
  }

  // ── SIGNATURES ──
  y = drawSignatures(doc, y,
    { title: 'Autorizado por', name: vendedor ? `${vendedor} — Ventas` : undefined },
    { title: 'Recibido y aceptado por', name: cliente.nombre },
  );

  // ── FOOTER ──
  drawFooter(doc, empresa);

  return doc.output('blob');
}
