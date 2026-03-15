/**
 * Professional PDF generator for Ventas (direct sales)
 * Odoo-style clean layout with product lines, taxes & payment info
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_COLORS, MARGIN_L, MARGIN_R, fmtCurrency, fmtDate,
  drawHeader, drawInfoBox, drawSummaryBoxes, drawSectionTitle, drawFooter, drawNotes,
  type EmpresaInfo,
} from './pdfBase';

interface VentaPdfParams {
  empresa: EmpresaInfo;
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
  const { empresa, venta, cliente, vendedor, almacen, lineas, pagos } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();

  const tipoLabel = venta.tipo === 'pedido' ? 'PEDIDO' : 'VENTA';
  const color = venta.tipo === 'pedido' ? PDF_COLORS.primary : PDF_COLORS.teal;

  // Header
  let y = drawHeader(doc, empresa, tipoLabel, venta.folio, color);

  // Client info
  const statusLabel = venta.status.charAt(0).toUpperCase() + venta.status.slice(1);
  const pagoLabel = venta.condicion_pago === 'credito' ? 'Crédito' : venta.condicion_pago === 'contado' ? 'Contado' : 'Por definir';
  y = drawInfoBox(doc, y, cliente.nombre, [
    [
      cliente.codigo ? `Código: ${cliente.codigo}` : null,
      cliente.rfc ? `RFC: ${cliente.rfc}` : null,
      cliente.telefono ? `Tel: ${cliente.telefono}` : null,
    ],
    [
      `Fecha: ${fmtDate(venta.fecha)}`,
      `Estado: ${statusLabel}`,
      `Pago: ${pagoLabel}`,
      vendedor ? `Vendedor: ${vendedor}` : null,
      almacen ? `Almacén: ${almacen}` : null,
    ],
  ]);

  // Summary boxes
  const pagado = pagos.reduce((s, p) => s + p.monto, 0);
  y = drawSummaryBoxes(doc, y, [
    { label: 'SUBTOTAL', value: `$${fmtCurrency(venta.subtotal)}` },
    { label: 'IMPUESTOS', value: `$${fmtCurrency(venta.iva_total + venta.ieps_total)}` },
    {
      label: 'TOTAL',
      value: `$${fmtCurrency(venta.total)}`,
      color,
      bgColor: venta.tipo === 'pedido' ? [239, 246, 255] : [240, 253, 250],
      borderColor: venta.tipo === 'pedido' ? [191, 219, 254] : [153, 246, 228],
    },
    {
      label: 'SALDO',
      value: `$${fmtCurrency(venta.saldo_pendiente)}`,
      color: venta.saldo_pendiente > 0 ? PDF_COLORS.danger : PDF_COLORS.success,
      bgColor: venta.saldo_pendiente > 0 ? [254, 242, 242] : [240, 253, 244],
      borderColor: venta.saldo_pendiente > 0 ? [254, 202, 202] : [187, 247, 208],
    },
  ]);

  // Products table
  y = drawSectionTitle(doc, y, 'PRODUCTOS', color);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_L, right: MARGIN_R },
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
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 14 },
      3: { cellWidth: 16 },
      4: { halign: 'right', cellWidth: 22 },
      5: { halign: 'right', cellWidth: 16 },
      6: { halign: 'right', fontStyle: 'bold', cellWidth: 24 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 4;

  // Totals box
  const totalsX = pageW - MARGIN_R - 60;
  const hasDiscount = venta.descuento_total > 0;
  const totalLines = 2 + (hasDiscount ? 1 : 0) + (venta.iva_total > 0 ? 1 : 0) + (venta.ieps_total > 0 ? 1 : 0);
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(totalsX, y, 60, totalLines * 5 + 6, 1.5, 1.5, 'FD');

  let ty = y + 5;
  const drawTotalLine = (label: string, val: string, c?: [number, number, number], bold = false) => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setTextColor(...PDF_COLORS.muted);
    doc.text(label, totalsX + 4, ty);
    doc.setTextColor(...(c ?? PDF_COLORS.dark));
    doc.text(val, totalsX + 56, ty, { align: 'right' });
    ty += 5;
  };

  drawTotalLine('Subtotal:', `$${fmtCurrency(venta.subtotal)}`);
  if (hasDiscount) drawTotalLine('Descuento:', `-$${fmtCurrency(venta.descuento_total)}`, PDF_COLORS.danger);
  if (venta.iva_total > 0) drawTotalLine('IVA:', `$${fmtCurrency(venta.iva_total)}`);
  if (venta.ieps_total > 0) drawTotalLine('IEPS:', `$${fmtCurrency(venta.ieps_total)}`);
  ty += 1;
  drawTotalLine('Total:', `$${fmtCurrency(venta.total)}`, color, true);

  y = ty + 8;

  // Payments
  if (pagos.length > 0) {
    y = y > 220 ? (doc.addPage(), 14) : y;
    y = drawSectionTitle(doc, y, 'PAGOS REGISTRADOS', PDF_COLORS.success);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN_L, right: MARGIN_R },
      head: [['Fecha', 'Método', 'Referencia', 'Monto']],
      body: pagos.map(p => [fmtDate(p.fecha), p.metodo_pago, p.referencia || '—', `$${fmtCurrency(p.monto)}`]),
      headStyles: { fillColor: PDF_COLORS.success, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold', textColor: PDF_COLORS.success } },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(pageW - MARGIN_R - 50, y, 50, 7, 1, 1, 'F');
    doc.setTextColor(...PDF_COLORS.success);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total pagado: $${fmtCurrency(pagado)}`, pageW - MARGIN_R - 2, y + 5, { align: 'right' });
    y += 12;
  }

  // Notes
  if (venta.notas) {
    y = (doc as any).lastAutoTable?.finalY ?? y;
    y += 6;
    drawNotes(doc, y, venta.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
