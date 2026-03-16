/**
 * Pedido PDF — Matches the HTML invoice design EXACTLY
 */
import {
  createDoc, ML, MR, C, fmtCurrency, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable, drawTotalsBlock,
  drawImporteConLetra, drawNotes, drawSignatures, drawFooter,
  checkPageBreak, numberToWords,
  type EmpresaInfo,
} from './pdfStyleOdoo';

interface PedidoPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  pedido: {
    folio: string;
    fecha: string;
    status: string;
    condicion_pago: string;
    subtotal: number;
    descuento_total: number;
    iva_total: number;
    ieps_total: number;
    total: number;
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
    colonia?: string | null;
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
  entregas: {
    folio: string;
    status: string;
    fecha?: string;
    repartidor?: string;
    lineas: { codigo: string; nombre: string; cantidad_pedida: number; cantidad_entregada: number }[];
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

const ENTREGA_STATUS: Record<string, string> = {
  borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
  cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
};

export function generarPedidoPdf(params: PedidoPdfParams): Blob {
  const { empresa, logoBase64, pedido, cliente, vendedor, almacen, lineas, entregas, pagos } = params;
  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;

  const statusInfo = STATUS_MAP[pedido.status] || { label: pedido.status.charAt(0).toUpperCase() + pedido.status.slice(1), color: 'neutral' as const };
  const pagoLabel = pedido.condicion_pago === 'credito' ? 'Crédito' : pedido.condicion_pago === 'contado' ? 'Contado' : 'Por definir';

  // ── HEADER with status chip ──
  let y = drawDocHeader(doc, empresa, 'ORDEN DE VENTA', pedido.folio, logoBase64, statusInfo.label, statusInfo.color);

  // ── INFO GRID — Client left, Document info right ──
  const leftRows: [string, string][] = [
    ['_name', cliente.nombre],
    ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
    ...(cliente.direccion ? [['', cliente.direccion] as [string, string]] : []),
    ...(cliente.colonia ? [['', cliente.colonia] as [string, string]] : []),
    ...(cliente.cp ? [['C.P.', cliente.cp] as [string, string]] : []),
    ...(cliente.email || cliente.telefono ? [['', [cliente.email, cliente.telefono].filter(Boolean).join(' · ')] as [string, string]] : []),
  ];

  const rightRows: [string, string][] = [
    ['Fecha de venta:', fmtDate(pedido.fecha)],
    ['Condiciones de pago:', pagoLabel],
    ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
    ['Moneda:', 'MXN - Peso Mexicano'],
  ];

  y = drawInfoGrid(doc, y, 'Cliente', leftRows, 'Información de la venta', rightRows);

  // ── PRODUCTS TABLE ──
  y = drawCleanTable(doc, y,
    ['Código', 'Producto', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.', 'Importe'],
    lineas.map(l => [
      { content: l.codigo, styles: { textColor: C.sublabel, fontStyle: 'normal', fontSize: 7 } },
      l.nombre,
      { content: String(l.cantidad), styles: { halign: 'center' } },
      l.unidad || 'Pieza',
      { content: `$${fmtCurrency(l.precio_unitario)}`, styles: { halign: 'right' } },
      l.descuento_pct > 0
        ? { content: `${l.descuento_pct}%`, styles: { halign: 'center', textColor: C.red } }
        : { content: '—', styles: { halign: 'center', textColor: C.sublabel } },
      { content: `$${fmtCurrency(l.total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 24 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 22 },
      4: { cellWidth: 26, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 28, halign: 'right' },
    },
  );

  // ── TOTALS ──
  const subtotalBruto = lineas.reduce((s, l) => s + (l.precio_unitario * l.cantidad), 0);
  const totalRows: { label: string; value: string; bold?: boolean; red?: boolean; separator?: boolean }[] = [];

  if (pedido.descuento_total > 0) {
    totalRows.push({ label: 'Subtotal bruto:', value: `$${fmtCurrency(subtotalBruto)}` });
    totalRows.push({ label: 'Descuentos:', value: `-$${fmtCurrency(pedido.descuento_total)}`, red: true });
    totalRows.push({ label: 'Subtotal neto:', value: `$${fmtCurrency(pedido.subtotal)}`, separator: true });
  } else {
    totalRows.push({ label: 'Subtotal:', value: `$${fmtCurrency(pedido.subtotal)}` });
  }

  if (pedido.iva_total > 0) totalRows.push({ label: 'IVA 16%:', value: `$${fmtCurrency(pedido.iva_total)}` });
  if (pedido.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `$${fmtCurrency(pedido.ieps_total)}` });
  totalRows.push({ label: 'Total:', value: `$${fmtCurrency(pedido.total)}`, bold: true });

  y = drawTotalsBlock(doc, y, totalRows);

  // ── IMPORTE CON LETRA ──
  const words = numberToWords(pedido.total);
  y = drawImporteConLetra(doc, y, words);

  // ── NOTAS ──
  if (pedido.notas) {
    y = drawNotes(doc, y, pedido.notas, 'Notas y condiciones');
  }

  // ── ENTREGAS ──
  if (entregas.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawCleanTable(doc, y,
      ['Folio', 'Estado', 'Repartidor', 'Productos'],
      entregas.map(e => [
        { content: e.folio, styles: { fontStyle: 'bold' } },
        ENTREGA_STATUS[e.status] ?? e.status,
        e.repartidor ?? '—',
        e.lineas.map(l => `${l.cantidad_entregada}/${l.cantidad_pedida} ${l.codigo}`).join(', '),
      ]),
      {
        0: { cellWidth: 24 },
        1: { cellWidth: 24 },
        2: { cellWidth: 32 },
      },
    );
  }

  // ── PAGOS ──
  if (pagos.length > 0) {
    y = checkPageBreak(doc, y);
    const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);

    y = drawCleanTable(doc, y,
      ['Fecha', 'Método', 'Referencia', 'Monto'],
      pagos.map(p => [
        fmtDate(p.fecha),
        p.metodo_pago,
        p.referencia || '—',
        { content: `$${fmtCurrency(p.monto)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      { 3: { halign: 'right' } },
    );

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total pagado: $${fmtCurrency(totalPagado)}`, rightX, y - 3, { align: 'right' });
    y += 7;
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
