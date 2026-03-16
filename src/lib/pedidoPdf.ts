import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtCurrency, fmtDate,
  drawHeader, drawInfoSection, drawTotals, drawSectionTitle, drawFooter, drawNotes,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

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

export function generarPedidoPdf(params: PedidoPdfParams): Blob {
  const { empresa, logoBase64, pedido, cliente, vendedor, almacen, lineas, entregas, pagos } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  // Header
  let y = drawHeader(doc, empresa, 'PEDIDO', pedido.folio, logoBase64);

  // Info section
  const statusLabel = pedido.status.charAt(0).toUpperCase() + pedido.status.slice(1);
  y = drawInfoSection(doc, y, [
    ['Cliente:', cliente.nombre],
    ...(cliente.codigo ? [['Código:', cliente.codigo] as [string, string]] : []),
    ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
    ...(cliente.telefono ? [['Teléfono:', cliente.telefono] as [string, string]] : []),
  ], [
    ['Fecha:', fmtDate(pedido.fecha)],
    ['Estado:', statusLabel],
    ['Pago:', pedido.condicion_pago === 'credito' ? 'Crédito' : 'Contado'],
    ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
  ]);

  // Products table
  y = drawSectionTitle(doc, y, 'Productos');

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Código', 'Producto', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.%', 'Total']],
    body: lineas.map(l => [
      l.codigo,
      l.nombre,
      String(l.cantidad),
      l.unidad || '—',
      `$${fmtCurrency(l.precio_unitario)}`,
      l.descuento_pct > 0 ? `${l.descuento_pct}%` : '—',
      `$${fmtCurrency(l.total)}`,
    ]),
    headStyles: TABLE_HEAD_STYLE,
    bodyStyles: TABLE_BODY_STYLE,
    alternateRowStyles: TABLE_ALT_STYLE,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 14 },
      3: { cellWidth: 16 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Totals
  const totalRows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal:', value: `$${fmtCurrency(pedido.subtotal)}` },
  ];
  if (pedido.descuento_total > 0) totalRows.push({ label: 'Descuento:', value: `-$${fmtCurrency(pedido.descuento_total)}` });
  if (pedido.iva_total > 0) totalRows.push({ label: 'IVA:', value: `$${fmtCurrency(pedido.iva_total)}` });
  if (pedido.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `$${fmtCurrency(pedido.ieps_total)}` });
  totalRows.push({ label: 'Total:', value: `$${fmtCurrency(pedido.total)}`, bold: true });

  y = drawTotals(doc, y, totalRows);

  // Entregas
  if (entregas.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, 'Historial de Entregas');

    const statusLabels: Record<string, string> = {
      borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
      cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
    };

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Folio', 'Estado', 'Repartidor', 'Productos']],
      body: entregas.map(e => [
        e.folio,
        statusLabels[e.status] ?? e.status,
        e.repartidor ?? '—',
        e.lineas.map(l => `${l.cantidad_entregada}/${l.cantidad_pedida} ${l.codigo}`).join(', '),
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: TABLE_BODY_STYLE,
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        1: { cellWidth: 20 },
        2: { cellWidth: 30 },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Pagos
  if (pagos.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, 'Pagos Registrados');
    const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Fecha', 'Método', 'Referencia', 'Monto']],
      body: pagos.map(p => [
        fmtDate(p.fecha), p.metodo_pago, p.referencia || '—', `$${fmtCurrency(p.monto)}`,
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: TABLE_BODY_STYLE,
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
    doc.setTextColor(...PDF.dark);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total pagado: $${fmtCurrency(totalPagado)}`, doc.internal.pageSize.getWidth() - MR, y + 4, { align: 'right' });
    y += 10;
  }

  // Notes
  if (pedido.notas) {
    y = checkPageBreak(doc, y);
    drawNotes(doc, y, pedido.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}

function checkPageBreak(doc: jsPDF, y: number): number {
  if (y > 220) { doc.addPage(); return 14; }
  return y;
}
