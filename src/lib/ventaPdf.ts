/**
 * Venta/Remisión PDF — Professional clean layout
 */
import {
  createDoc, ML, MR, C, fmtCurrency, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable, drawTotalsBlock,
  drawNotes, drawFooter, checkPageBreak,
  type EmpresaInfo,
} from './pdfStyleOdoo';

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
  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;

  const tipoLabel = venta.tipo === 'pedido' ? 'PEDIDO' : 'VENTA';
  const statusLabel = venta.status.charAt(0).toUpperCase() + venta.status.slice(1);
  const pagoLabel = venta.condicion_pago === 'credito' ? 'Crédito' : venta.condicion_pago === 'contado' ? 'Contado' : 'Por definir';

  let y = drawDocHeader(doc, empresa, tipoLabel, venta.folio, logoBase64);

  // Info grid — Client + Document info
  y = drawInfoGrid(doc, y,
    'Cliente',
    [
      ['Nombre:', cliente.nombre],
      ...(cliente.codigo ? [['Código:', cliente.codigo] as [string, string]] : []),
      ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
      ...(cliente.telefono ? [['Teléfono:', cliente.telefono] as [string, string]] : []),
      ...(cliente.direccion ? [['Dirección:', cliente.direccion] as [string, string]] : []),
    ],
    'Información del documento',
    [
      ['Fecha:', fmtDate(venta.fecha)],
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
    { label: 'Subtotal:', value: `$${fmtCurrency(venta.subtotal)}` },
  ];
  if (venta.descuento_total > 0) totalRows.push({ label: 'Descuento:', value: `-$${fmtCurrency(venta.descuento_total)}` });
  if (venta.iva_total > 0) totalRows.push({ label: 'IVA:', value: `$${fmtCurrency(venta.iva_total)}` });
  if (venta.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `$${fmtCurrency(venta.ieps_total)}` });
  totalRows.push({ label: 'Total:', value: `$${fmtCurrency(venta.total)}`, bold: true });
  if (venta.saldo_pendiente > 0) totalRows.push({ label: 'Saldo pendiente:', value: `$${fmtCurrency(venta.saldo_pendiente)}` });

  y = drawTotalsBlock(doc, y, totalRows);

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

  if (venta.notas) {
    y = drawNotes(doc, y, venta.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
