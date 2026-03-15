import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });
const fmtDate = (d: string) => {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

interface EstadoCuentaParams {
  empresa: {
    nombre: string;
    razon_social?: string;
    rfc?: string;
    direccion?: string;
    telefono?: string;
    email?: string;
    logo_url?: string;
  };
  cliente: {
    nombre: string;
    codigo?: string;
    telefono?: string;
    direccion?: string;
    rfc?: string;
    credito?: boolean;
    limite_credito?: number;
    dias_credito?: number;
  };
  ventas: {
    folio: string;
    fecha: string;
    total: number;
    saldo_pendiente: number;
    status: string;
    condicion_pago: string;
  }[];
  cobros: {
    fecha: string;
    monto: number;
    metodo_pago: string;
    referencia?: string;
  }[];
}

export function generarEstadoCuentaPdf(params: EstadoCuentaParams): Blob {
  const { empresa, cliente, ventas, cobros } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  let y = 14;

  // ── Colors ──
  const primaryColor: [number, number, number] = [37, 99, 235]; // blue-600
  const darkColor: [number, number, number] = [15, 23, 42]; // slate-900
  const mutedColor: [number, number, number] = [100, 116, 139]; // slate-500
  const successColor: [number, number, number] = [22, 163, 74]; // green-600
  const dangerColor: [number, number, number] = [220, 38, 38]; // red-600

  // ══════════════════════════════════════
  // ── HEADER BAR ──
  // ══════════════════════════════════════
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageW, 28, 'F');

  // Company name
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), marginL, 12);

  // Company details
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const companyDetails = [
    empresa.razon_social,
    empresa.rfc ? `RFC: ${empresa.rfc}` : null,
    empresa.direccion,
    empresa.telefono ? `Tel: ${empresa.telefono}` : null,
  ].filter(Boolean).join('  ·  ');
  if (companyDetails) {
    doc.text(companyDetails, marginL, 18);
  }

  // Document title
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ESTADO DE CUENTA', pageW - marginR, 12, { align: 'right' });
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.text(`Fecha: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`, pageW - marginR, 18, { align: 'right' });

  y = 35;

  // ══════════════════════════════════════
  // ── CLIENT INFO BOX ──
  // ══════════════════════════════════════
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.roundedRect(marginL, y, contentW, 22, 2, 2, 'FD');

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

  const creditInfo = cliente.credito
    ? `Crédito: ${cliente.dias_credito ?? 0} días  ·  Límite: $${fmt(cliente.limite_credito ?? 0)}`
    : 'Condición: Contado';
  doc.text(creditInfo, marginL + 4, y + 18);

  y += 28;

  // ══════════════════════════════════════
  // ── SUMMARY BOXES ──
  // ══════════════════════════════════════
  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventas.reduce((s, v) => s + v.saldo_pendiente, 0);
  const totalCobrado = cobros.reduce((s, c) => s + c.monto, 0);
  const boxW = (contentW - 8) / 3;

  // Box 1 - Total vendido
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginL, y, boxW, 18, 1.5, 1.5, 'FD');
  doc.setTextColor(...mutedColor);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL VENDIDO', marginL + boxW / 2, y + 5.5, { align: 'center' });
  doc.setTextColor(...darkColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${fmt(totalVendido)}`, marginL + boxW / 2, y + 13, { align: 'center' });

  // Box 2 - Total cobrado
  doc.setFillColor(240, 253, 244); // green-50
  doc.setDrawColor(187, 247, 208); // green-200
  doc.roundedRect(marginL + boxW + 4, y, boxW, 18, 1.5, 1.5, 'FD');
  doc.setTextColor(...mutedColor);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('TOTAL COBRADO', marginL + boxW + 4 + boxW / 2, y + 5.5, { align: 'center' });
  doc.setTextColor(...successColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${fmt(totalCobrado)}`, marginL + boxW + 4 + boxW / 2, y + 13, { align: 'center' });

  // Box 3 - Total pendiente
  doc.setFillColor(254, 242, 242); // red-50
  doc.setDrawColor(254, 202, 202); // red-200
  doc.roundedRect(marginL + (boxW + 4) * 2, y, boxW, 18, 1.5, 1.5, 'FD');
  doc.setTextColor(...mutedColor);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('SALDO PENDIENTE', marginL + (boxW + 4) * 2 + boxW / 2, y + 5.5, { align: 'center' });
  doc.setTextColor(...dangerColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`$${fmt(totalPendiente)}`, marginL + (boxW + 4) * 2 + boxW / 2, y + 13, { align: 'center' });

  y += 24;

  // ══════════════════════════════════════
  // ── VENTAS TABLE ──
  // ══════════════════════════════════════
  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE VENTAS', marginL, y + 1);
  y += 4;

  const ventasConSaldo = ventas.filter(v => v.saldo_pendiente > 0);
  const ventasSaldadas = ventas.filter(v => v.saldo_pendiente <= 0);

  // Pending first
  if (ventasConSaldo.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginL, right: marginR },
      head: [['Folio', 'Fecha', 'Condición', 'Estado', 'Total', 'Pagado', 'Pendiente']],
      body: ventasConSaldo.map(v => [
        v.folio || '—',
        fmtDate(v.fecha),
        v.condicion_pago === 'credito' ? 'Crédito' : v.condicion_pago === 'contado' ? 'Contado' : 'Por definir',
        v.status.charAt(0).toUpperCase() + v.status.slice(1),
        `$${fmt(v.total)}`,
        `$${fmt(v.total - v.saldo_pendiente)}`,
        `$${fmt(v.saldo_pendiente)}`,
      ]),
      headStyles: {
        fillColor: primaryColor,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: darkColor,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        4: { halign: 'right' },
        5: { halign: 'right', textColor: successColor },
        6: { halign: 'right', fontStyle: 'bold', textColor: dangerColor },
      },
      didDrawPage: () => {},
    });

    y = (doc as any).lastAutoTable.finalY + 2;

    // Subtotal pending
    doc.setFillColor(254, 242, 242);
    doc.roundedRect(pageW - marginR - 55, y, 55, 7, 1, 1, 'F');
    doc.setTextColor(...dangerColor);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total pendiente: $${fmt(totalPendiente)}`, pageW - marginR - 2, y + 5, { align: 'right' });
    y += 12;
  }

  // Settled sales
  if (ventasSaldadas.length > 0 && y < 230) {
    doc.setTextColor(...mutedColor);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.text(`Ventas saldadas (${ventasSaldadas.length})`, marginL, y);
    y += 3;

    autoTable(doc, {
      startY: y,
      margin: { left: marginL, right: marginR },
      head: [['Folio', 'Fecha', 'Total', 'Estado']],
      body: ventasSaldadas.slice(0, 20).map(v => [
        v.folio || '—',
        fmtDate(v.fecha),
        `$${fmt(v.total)}`,
        v.status.charAt(0).toUpperCase() + v.status.slice(1),
      ]),
      headStyles: {
        fillColor: [100, 116, 139],
        textColor: [255, 255, 255],
        fontSize: 6.5,
        fontStyle: 'bold',
        cellPadding: 1.5,
      },
      bodyStyles: {
        fontSize: 6.5,
        cellPadding: 1.5,
        textColor: mutedColor,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // ══════════════════════════════════════
  // ── COBROS TABLE ──
  // ══════════════════════════════════════
  if (y > 230) { doc.addPage(); y = 14; }

  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('HISTORIAL DE PAGOS', marginL, y + 1);
  y += 4;

  if (cobros.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: marginL, right: marginR },
      head: [['Fecha', 'Método', 'Referencia', 'Monto']],
      body: cobros.map(c => [
        fmtDate(c.fecha),
        c.metodo_pago === 'efectivo' ? 'Efectivo' : c.metodo_pago === 'transferencia' ? 'Transferencia' : c.metodo_pago === 'tarjeta' ? 'Tarjeta' : c.metodo_pago,
        c.referencia || '—',
        `$${fmt(c.monto)}`,
      ]),
      headStyles: {
        fillColor: successColor,
        textColor: [255, 255, 255],
        fontSize: 7,
        fontStyle: 'bold',
        cellPadding: 2,
      },
      bodyStyles: {
        fontSize: 7,
        cellPadding: 2,
        textColor: darkColor,
      },
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
    doc.text(`Total cobrado: $${fmt(totalCobrado)}`, pageW - marginR - 2, y + 5, { align: 'right' });
  } else {
    doc.setTextColor(...mutedColor);
    doc.setFontSize(7.5);
    doc.text('Sin pagos registrados', marginL, y + 4);
  }

  // ══════════════════════════════════════
  // ── FOOTER ──
  // ══════════════════════════════════════
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    // Separator line
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
