import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtCurrency, fmtDate,
  drawHeader, drawInfoSection, drawSectionTitle, drawFooter, checkPageBreak,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

interface EstadoCuentaParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
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
  const { empresa, logoBase64, cliente, ventas, cobros } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();

  let y = drawHeader(doc, empresa, 'ESTADO DE CUENTA',
    `Fecha: ${new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    logoBase64,
  );

  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventas.reduce((s, v) => s + v.saldo_pendiente, 0);
  const totalCobrado = cobros.reduce((s, c) => s + c.monto, 0);

  y = drawInfoSection(doc, y, [
    ['Cliente:', cliente.nombre],
    ...(cliente.codigo ? [['Código:', cliente.codigo] as [string, string]] : []),
    ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
    ...(cliente.telefono ? [['Teléfono:', cliente.telefono] as [string, string]] : []),
  ], [
    ['Total vendido:', `$${fmtCurrency(totalVendido)}`],
    ['Total cobrado:', `$${fmtCurrency(totalCobrado)}`],
    ['Saldo pendiente:', `$${fmtCurrency(totalPendiente)}`],
    ...(cliente.credito ? [['Crédito:', `${cliente.dias_credito ?? 0} días · Límite: $${fmtCurrency(cliente.limite_credito ?? 0)}`] as [string, string]] : []),
  ]);

  // Ventas with pending balance
  const ventasConSaldo = ventas.filter(v => v.saldo_pendiente > 0);
  const ventasSaldadas = ventas.filter(v => v.saldo_pendiente <= 0);

  if (ventasConSaldo.length > 0) {
    y = drawSectionTitle(doc, y, 'Ventas con saldo pendiente');

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Folio', 'Fecha', 'Condición', 'Estado', 'Total', 'Pagado', 'Pendiente']],
      body: ventasConSaldo.map(v => [
        v.folio || '—',
        fmtDate(v.fecha),
        v.condicion_pago === 'credito' ? 'Crédito' : v.condicion_pago === 'contado' ? 'Contado' : 'Por definir',
        v.status.charAt(0).toUpperCase() + v.status.slice(1),
        `$${fmtCurrency(v.total)}`,
        `$${fmtCurrency(v.total - v.saldo_pendiente)}`,
        `$${fmtCurrency(v.saldo_pendiente)}`,
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: TABLE_BODY_STYLE,
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right', fontStyle: 'bold', textColor: PDF.danger },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 3;
    doc.setTextColor(...PDF.dark);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total pendiente: $${fmtCurrency(totalPendiente)}`, pageW - MR, y, { align: 'right' });
    y += 8;
  }

  // Settled sales
  if (ventasSaldadas.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, `Ventas saldadas (${ventasSaldadas.length})`);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Folio', 'Fecha', 'Total', 'Estado']],
      body: ventasSaldadas.slice(0, 20).map(v => [
        v.folio || '—', fmtDate(v.fecha), `$${fmtCurrency(v.total)}`,
        v.status.charAt(0).toUpperCase() + v.status.slice(1),
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: { ...TABLE_BODY_STYLE, textColor: PDF.muted },
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'right' },
      },
    });
    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Cobros
  y = checkPageBreak(doc, y);
  y = drawSectionTitle(doc, y, 'Historial de Pagos');

  if (cobros.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Fecha', 'Método', 'Referencia', 'Monto']],
      body: cobros.map(c => [
        fmtDate(c.fecha),
        c.metodo_pago === 'efectivo' ? 'Efectivo' : c.metodo_pago === 'transferencia' ? 'Transferencia' : c.metodo_pago === 'tarjeta' ? 'Tarjeta' : c.metodo_pago,
        c.referencia || '—',
        `$${fmtCurrency(c.monto)}`,
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: TABLE_BODY_STYLE,
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: { 3: { halign: 'right', fontStyle: 'bold' } },
    });

    y = (doc as any).lastAutoTable.finalY + 3;
    doc.setTextColor(...PDF.dark);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total cobrado: $${fmtCurrency(totalCobrado)}`, pageW - MR, y, { align: 'right' });
  } else {
    doc.setTextColor(...PDF.muted);
    doc.setFontSize(7.5);
    doc.text('Sin pagos registrados', ML, y + 4);
  }

  drawFooter(doc);
  return doc.output('blob');
}
