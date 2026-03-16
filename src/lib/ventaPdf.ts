import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtCurrency, fmtDate,
  drawHeader, drawInfoSection, drawTotals, drawSectionTitle, drawFooter, drawNotes, checkPageBreak,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

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
    total: number;
  }[];
  pagos: {
    fecha: string;
    metodo_pago: string;
    monto: number;
    referencia?: string;
  }[];
}

export function generarVentaPdf(params: VentaPdfParams): Blob {
  const { empresa, logoBase64, venta, cliente, vendedor, almacen, lineas, pagos } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const tipoLabel = venta.tipo === 'pedido' ? 'PEDIDO' : 'VENTA';

  let y = drawHeader(doc, empresa, tipoLabel, venta.folio, logoBase64);

  const statusLabel = venta.status.charAt(0).toUpperCase() + venta.status.slice(1);
  const pagoLabel = venta.condicion_pago === 'credito' ? 'Crédito' : venta.condicion_pago === 'contado' ? 'Contado' : 'Por definir';
  y = drawInfoSection(doc, y, [
    ['Cliente:', cliente.nombre],
    ...(cliente.codigo ? [['Código:', cliente.codigo] as [string, string]] : []),
    ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
    ...(cliente.telefono ? [['Teléfono:', cliente.telefono] as [string, string]] : []),
  ], [
    ['Fecha:', fmtDate(venta.fecha)],
    ['Estado:', statusLabel],
    ['Pago:', pagoLabel],
    ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
  ]);

  y = drawSectionTitle(doc, y, 'Productos');

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Código', 'Producto', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.%', 'Total']],
    body: lineas.map(l => [
      l.codigo, l.nombre, String(l.cantidad), l.unidad || '—',
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
    { label: 'Subtotal:', value: `$${fmtCurrency(venta.subtotal)}` },
  ];
  if (venta.descuento_total > 0) totalRows.push({ label: 'Descuento:', value: `-$${fmtCurrency(venta.descuento_total)}` });
  if (venta.iva_total > 0) totalRows.push({ label: 'IVA:', value: `$${fmtCurrency(venta.iva_total)}` });
  if (venta.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `$${fmtCurrency(venta.ieps_total)}` });
  totalRows.push({ label: 'Total:', value: `$${fmtCurrency(venta.total)}`, bold: true });
  if (venta.saldo_pendiente > 0) totalRows.push({ label: 'Saldo pendiente:', value: `$${fmtCurrency(venta.saldo_pendiente)}` });

  y = drawTotals(doc, y, totalRows);

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

  if (venta.notas) {
    y = checkPageBreak(doc, y);
    drawNotes(doc, y, venta.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
