/**
 * Estado de Cuenta PDF — Professional clean layout
 */
import {
  createDoc, ML, MR, C, fmtCurrency, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawFooter, checkPageBreak,
  type EmpresaInfo,
} from './pdfStyleOdoo';

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
  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;

  const fechaHoy = new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' });

  let y = drawDocHeader(doc, empresa, 'ESTADO DE CUENTA', fechaHoy, logoBase64);

  const totalVendido = ventas.reduce((s, v) => s + v.total, 0);
  const totalPendiente = ventas.reduce((s, v) => s + v.saldo_pendiente, 0);
  const totalCobrado = cobros.reduce((s, c) => s + c.monto, 0);

  y = drawInfoGrid(doc, y,
    'Cliente',
    [
      ['Nombre:', cliente.nombre],
      ...(cliente.codigo ? [['Código:', cliente.codigo] as [string, string]] : []),
      ...(cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
      ...(cliente.telefono ? [['Teléfono:', cliente.telefono] as [string, string]] : []),
    ],
    'Resumen financiero',
    [
      ['Total vendido:', `$${fmtCurrency(totalVendido)}`],
      ['Total cobrado:', `$${fmtCurrency(totalCobrado)}`],
      ['Saldo pendiente:', `$${fmtCurrency(totalPendiente)}`],
      ...(cliente.credito ? [['Crédito:', `${cliente.dias_credito ?? 0} días · Límite: $${fmtCurrency(cliente.limite_credito ?? 0)}`] as [string, string]] : []),
    ],
  );

  // Ventas con saldo pendiente
  const ventasConSaldo = ventas.filter(v => v.saldo_pendiente > 0);
  const ventasSaldadas = ventas.filter(v => v.saldo_pendiente <= 0);

  if (ventasConSaldo.length > 0) {
    y = drawCleanTable(doc, y,
      ['Folio', 'Fecha', 'Condición', 'Estado', 'Total', 'Pagado', 'Pendiente'],
      ventasConSaldo.map(v => [
        { content: v.folio || '—', styles: { fontStyle: 'bold' } },
        fmtDate(v.fecha),
        v.condicion_pago === 'credito' ? 'Crédito' : v.condicion_pago === 'contado' ? 'Contado' : 'Por definir',
        v.status.charAt(0).toUpperCase() + v.status.slice(1),
        { content: `$${fmtCurrency(v.total)}`, styles: { halign: 'right' } },
        { content: `$${fmtCurrency(v.total - v.saldo_pendiente)}`, styles: { halign: 'right' } },
        { content: `$${fmtCurrency(v.saldo_pendiente)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.danger } },
      ]),
      {
        0: { cellWidth: 24 },
        4: { halign: 'right' },
        5: { halign: 'right' },
        6: { halign: 'right' },
      },
    );

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total pendiente: $${fmtCurrency(totalPendiente)}`, rightX, y - 3, { align: 'right' });
    y += 7;
  }

  // Ventas saldadas
  if (ventasSaldadas.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawCleanTable(doc, y,
      ['Folio', 'Fecha', 'Total', 'Estado'],
      ventasSaldadas.slice(0, 20).map(v => [
        { content: v.folio || '—', styles: { fontStyle: 'bold' } },
        fmtDate(v.fecha),
        { content: `$${fmtCurrency(v.total)}`, styles: { halign: 'right' } },
        v.status.charAt(0).toUpperCase() + v.status.slice(1),
      ]),
      { 0: { cellWidth: 24 }, 2: { halign: 'right' } },
    );
  }

  // Cobros
  y = checkPageBreak(doc, y);
  if (cobros.length > 0) {
    y = drawCleanTable(doc, y,
      ['Fecha', 'Método', 'Referencia', 'Monto'],
      cobros.map(c => [
        fmtDate(c.fecha),
        c.metodo_pago === 'efectivo' ? 'Efectivo' : c.metodo_pago === 'transferencia' ? 'Transferencia' : c.metodo_pago === 'tarjeta' ? 'Tarjeta' : c.metodo_pago,
        c.referencia || '—',
        { content: `$${fmtCurrency(c.monto)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      { 3: { halign: 'right' } },
    );

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total cobrado: $${fmtCurrency(totalCobrado)}`, rightX, y - 3, { align: 'right' });
  } else {
    doc.setTextColor(...C.text);
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Sin pagos registrados', ML, y + 4);
  }

  drawFooter(doc, empresa);
  return doc.output('blob');
}
