import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

interface PedidoPdfParams {
  empresa: {
    nombre: string;
    razon_social?: string | null;
    rfc?: string | null;
    direccion?: string | null;
    telefono?: string | null;
    email?: string | null;
  };
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
  const { empresa, pedido, cliente, vendedor, almacen, lineas, entregas, pagos } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  let y = 14;

  const primaryColor: [number, number, number] = [37, 99, 235];
  const darkColor: [number, number, number] = [15, 23, 42];
  const mutedColor: [number, number, number] = [100, 116, 139];
  const successColor: [number, number, number] = [22, 163, 74];

  // ── HEADER BAR ──
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), marginL, 12);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const companyDetails = [
    empresa.razon_social,
    empresa.rfc ? `RFC: ${empresa.rfc}` : null,
    empresa.direccion,
    empresa.telefono ? `Tel: ${empresa.telefono}` : null,
  ].filter(Boolean).join('  ·  ');
  if (companyDetails) doc.text(companyDetails, marginL, 18);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('PEDIDO', pageW - marginR, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.text(pedido.folio, pageW - marginR, 18, { align: 'right' });

  y = 35;

  // ── CLIENTE & PEDIDO INFO ──
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginL, y, contentW, 24, 2, 2, 'FD');

  doc.setTextColor(...darkColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(cliente.nombre, marginL + 4, y + 6);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);
  const clientInfo = [
    cliente.codigo ? `Código: ${cliente.codigo}` : null,
    cliente.rfc ? `RFC: ${cliente.rfc}` : null,
    cliente.telefono ? `Tel: ${cliente.telefono}` : null,
  ].filter(Boolean).join('  ·  ');
  if (clientInfo) doc.text(clientInfo, marginL + 4, y + 12);

  const metaInfo = [
    `Fecha: ${fmtDate(pedido.fecha)}`,
    `Estado: ${pedido.status.charAt(0).toUpperCase() + pedido.status.slice(1)}`,
    `Pago: ${pedido.condicion_pago === 'credito' ? 'Crédito' : 'Contado'}`,
    vendedor ? `Vendedor: ${vendedor}` : null,
    almacen ? `Almacén: ${almacen}` : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(metaInfo, marginL + 4, y + 18);

  y += 30;

  // ── PRODUCTS TABLE ──
  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('PRODUCTOS', marginL, y + 1);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: marginL, right: marginR },
    head: [['Código', 'Producto', 'Cant.', 'Unidad', 'P. Unit.', 'Desc.%', 'Total']],
    body: lineas.map(l => [
      l.codigo,
      l.nombre,
      String(l.cantidad),
      l.unidad || '—',
      `$${fmt(l.precio_unitario)}`,
      l.descuento_pct > 0 ? `${l.descuento_pct}%` : '—',
      `$${fmt(l.total)}`,
    ]),
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      cellPadding: 2,
    },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: darkColor },
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

  // ── TOTALS ──
  const totalsX = pageW - marginR - 60;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(totalsX, y, 60, pedido.descuento_total > 0 ? 30 : 24, 1.5, 1.5, 'FD');

  let ty = y + 5;
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);
  doc.text('Subtotal:', totalsX + 4, ty);
  doc.setTextColor(...darkColor);
  doc.text(`$${fmt(pedido.subtotal)}`, totalsX + 56, ty, { align: 'right' });

  if (pedido.descuento_total > 0) {
    ty += 5;
    doc.setTextColor(...mutedColor);
    doc.text('Descuento:', totalsX + 4, ty);
    doc.setTextColor(220, 38, 38);
    doc.text(`-$${fmt(pedido.descuento_total)}`, totalsX + 56, ty, { align: 'right' });
  }

  if (pedido.iva_total > 0) {
    ty += 5;
    doc.setTextColor(...mutedColor);
    doc.text('IVA:', totalsX + 4, ty);
    doc.setTextColor(...darkColor);
    doc.text(`$${fmt(pedido.iva_total)}`, totalsX + 56, ty, { align: 'right' });
  }

  if (pedido.ieps_total > 0) {
    ty += 5;
    doc.setTextColor(...mutedColor);
    doc.text('IEPS:', totalsX + 4, ty);
    doc.setTextColor(...darkColor);
    doc.text(`$${fmt(pedido.ieps_total)}`, totalsX + 56, ty, { align: 'right' });
  }

  ty += 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...primaryColor);
  doc.text('Total:', totalsX + 4, ty);
  doc.text(`$${fmt(pedido.total)}`, totalsX + 56, ty, { align: 'right' });

  y = ty + 10;

  // ── ENTREGAS HISTORY ──
  if (entregas.length > 0) {
    if (y > 220) { doc.addPage(); y = 14; }

    doc.setTextColor(...primaryColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('HISTORIAL DE ENTREGAS', marginL, y + 1);
    y += 4;

    const statusLabels: Record<string, string> = {
      borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
      cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
    };

    autoTable(doc, {
      startY: y,
      margin: { left: marginL, right: marginR },
      head: [['Folio', 'Estado', 'Repartidor', 'Productos']],
      body: entregas.map(e => [
        e.folio,
        statusLabels[e.status] ?? e.status,
        e.repartidor ?? '—',
        e.lineas.map(l => `${l.cantidad_entregada}/${l.cantidad_pedida} ${l.codigo}`).join(', '),
      ]),
      headStyles: {
        fillColor: [79, 70, 229] as [number, number, number],
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 2,
      },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: darkColor },
      alternateRowStyles: { fillColor: [245, 243, 255] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        1: { cellWidth: 20 },
        2: { cellWidth: 30 },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ── PAGOS ──
  if (pagos.length > 0) {
    if (y > 220) { doc.addPage(); y = 14; }

    doc.setTextColor(...successColor);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('PAGOS REGISTRADOS', marginL, y + 1);
    y += 4;

    const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);

    autoTable(doc, {
      startY: y,
      margin: { left: marginL, right: marginR },
      head: [['Fecha', 'Método', 'Referencia', 'Monto']],
      body: pagos.map(p => [
        fmtDate(p.fecha),
        p.metodo_pago,
        p.referencia || '—',
        `$${fmt(p.monto)}`,
      ]),
      headStyles: {
        fillColor: successColor,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 2,
      },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: darkColor },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: {
        3: { halign: 'right', fontStyle: 'bold', textColor: successColor },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 2;
    doc.setFillColor(240, 253, 244);
    doc.roundedRect(pageW - marginR - 50, y, 50, 7, 1, 1, 'F');
    doc.setTextColor(...successColor);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total pagado: $${fmt(totalPagado)}`, pageW - marginR - 2, y + 5, { align: 'right' });
  }

  // ── NOTAS ──
  if (pedido.notas) {
    y = (doc as any).lastAutoTable?.finalY ?? y;
    y += 10;
    if (y > 240) { doc.addPage(); y = 14; }
    doc.setTextColor(...mutedColor);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTAS:', marginL, y);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(pedido.notas, contentW);
    doc.text(splitNotes, marginL, y + 5);
  }

  // ── FOOTER ──
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginL, pageH - 14, pageW - marginR, pageH - 14);
    doc.setTextColor(...mutedColor);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Elaborado por Uniline — Innovación en la nube', marginL, pageH - 9);
    doc.text(`Página ${i} de ${totalPages}`, pageW - marginR, pageH - 9, { align: 'right' });
  }

  return doc.output('blob');
}
