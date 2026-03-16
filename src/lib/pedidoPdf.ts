/**
 * Pedido PDF — Professional clean layout
 */
import {
  createDoc, ML, MR, C, fmtCurrency, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable, drawTotalsBlock,
  drawNotes, drawFooter, checkPageBreak,
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

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', confirmado: 'Confirmado', entregado: 'Entregado',
  facturado: 'Facturado', cancelado: 'Cancelado',
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

  const statusLabel = STATUS_LABELS[pedido.status] ?? pedido.status;
  const pagoLabel = pedido.condicion_pago === 'credito' ? 'Crédito' : pedido.condicion_pago === 'contado' ? 'Contado' : 'Por definir';

  let y = drawDocHeader(doc, empresa, 'PEDIDO', pedido.folio, logoBase64);

  y = drawInfoGrid(doc, y,
    'Cliente',
    [
      ['Nombre:', cliente.nombre],
      ...(cliente.codigo ? [['Código:', cliente.codigo] as [string, string]] : []),
      ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
      ...(cliente.telefono ? [['Teléfono:', cliente.telefono] as [string, string]] : []),
    ],
    'Información del documento',
    [
      ['Fecha:', fmtDate(pedido.fecha)],
      ['Estado:', statusLabel],
      ['Condición de pago:', pagoLabel],
      ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
      ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
    ],
  );

  // Products table
  y = drawCleanTable(doc, y,
    ['Código', 'Producto', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.%', 'Importe'],
    lineas.map(l => [
      l.codigo,
      l.nombre,
      { content: String(l.cantidad), styles: { halign: 'center' } },
      l.unidad || '—',
      { content: `$${fmtCurrency(l.precio_unitario)}`, styles: { halign: 'right' } },
      { content: l.descuento_pct > 0 ? `${l.descuento_pct}%` : '—', styles: { halign: 'center' } },
      { content: `$${fmtCurrency(l.total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 24 },
      2: { cellWidth: 16, halign: 'center' },
      3: { cellWidth: 20 },
      4: { cellWidth: 24, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 26, halign: 'right' },
    },
  );

  // Totals
  const totalRows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal:', value: `$${fmtCurrency(pedido.subtotal)}` },
  ];
  if (pedido.descuento_total > 0) totalRows.push({ label: 'Descuento:', value: `-$${fmtCurrency(pedido.descuento_total)}` });
  if (pedido.iva_total > 0) totalRows.push({ label: 'IVA:', value: `$${fmtCurrency(pedido.iva_total)}` });
  if (pedido.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `$${fmtCurrency(pedido.ieps_total)}` });
  totalRows.push({ label: 'Total:', value: `$${fmtCurrency(pedido.total)}`, bold: true });

  y = drawTotalsBlock(doc, y, totalRows);

  // Entregas
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

  // Pagos
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

  if (pedido.notas) {
    y = drawNotes(doc, y, pedido.notas);
  }

  drawFooter(doc, empresa);
  return doc.output('blob');
}
