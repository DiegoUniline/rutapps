/**
 * Liquidación / Descarga de Ruta — PDF profesional tamaño carta
 */
import {
  createDoc, ML, MR, C, fmtDate, fmtCurrency,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawNotes, drawSignatures, drawFooter, checkPageBreak,
  type EmpresaInfo,
} from './pdfStyleOdoo';

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
};

export interface LiquidacionPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  vendedorNombre: string;
  fecha: string;
  fechaInicio: string;
  fechaFin: string;
  status: string;
  efectivoEntregado: number;
  notas?: string | null;
  notasSupervisor?: string | null;
  ventas: {
    folio: string;
    cliente: string;
    condicion: string;
    status: string;
    total: number;
  }[];
  ventasCanceladas: {
    folio: string;
    cliente: string;
    total: number;
  }[];
  productos: {
    codigo: string;
    nombre: string;
    cantidad: number;
    total: number;
  }[];
  cobros: {
    cliente: string;
    metodo: string;
    referencia: string;
    monto: number;
  }[];
  gastos: {
    concepto: string;
    notas: string;
    monto: number;
  }[];
  devoluciones: {
    nombre: string;
    codigo: string;
    cantidad: number;
    motivo: string;
  }[];
  cuadre: {
    totalContado: number;
    totalCredito: number;
    cobrosEfectivo: number;
    totalGastos: number;
    efectivoEsperado: number;
    diferencia: number;
  };
  stockAlmacen?: {
    almacenNombre: string;
    lineas: { nombre: string; codigo: string; cantidad: number }[];
  };
}

export function generarLiquidacionPdf(params: LiquidacionPdfParams): Blob {
  const {
    empresa, logoBase64, vendedorNombre, fecha, fechaInicio, fechaFin,
    status, efectivoEntregado, notas, notasSupervisor,
    ventas, ventasCanceladas, productos, cobros, gastos, devoluciones, cuadre,
  } = params;

  const doc = createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;

  const statusColor = status === 'aprobada' ? 'green' : status === 'rechazada' ? 'red' : 'neutral';

  let y = drawDocHeader(doc, empresa, 'LIQUIDACIÓN', '', logoBase64, STATUS_LABELS[status] ?? status, statusColor);

  // Info grid
  const periodoLabel = fechaInicio === fechaFin
    ? fmtDate(fechaInicio)
    : `${fmtDate(fechaInicio)} al ${fmtDate(fechaFin)}`;

  y = drawInfoGrid(doc, y,
    'Vendedor',
    [
      ['_name', vendedorNombre],
      ['Periodo:', periodoLabel],
    ],
    'Resumen',
    [
      ['Ventas contado:', `$${fmtCurrency(cuadre.totalContado)}`],
      ['Ventas crédito:', `$${fmtCurrency(cuadre.totalCredito)}`],
      ['Total cobros:', `$${fmtCurrency(cobros.reduce((s, c) => s + c.monto, 0))}`],
      ['Total gastos:', `-$${fmtCurrency(cuadre.totalGastos)}`],
    ],
  );

  // ═══ CUADRE DE EFECTIVO ═══
  y = checkPageBreak(doc, y, 45);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('CUADRE DE EFECTIVO', ML, y);
  y += 6;

  const cuadreRows: [string, string][] = [
    ['Ventas contado:', `$${fmtCurrency(cuadre.totalContado)}`],
    ['+ Cobros en efectivo:', `$${fmtCurrency(cuadre.cobrosEfectivo)}`],
    ['− Gastos:', `-$${fmtCurrency(cuadre.totalGastos)}`],
  ];

  doc.setFontSize(9.5);
  for (const [lbl, val] of cuadreRows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.muted);
    doc.text(lbl, ML + 4, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(val, ML + 70, y);
    y += 5;
  }

  // Divider
  doc.setDrawColor(...C.border);
  doc.setLineWidth(0.4);
  doc.line(ML + 4, y, ML + 100, y);
  y += 5;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text('Efectivo esperado:', ML + 4, y);
  doc.text(`$${fmtCurrency(cuadre.efectivoEsperado)}`, ML + 70, y);
  y += 6;

  doc.text('Efectivo entregado:', ML + 4, y);
  doc.text(`$${fmtCurrency(efectivoEntregado)}`, ML + 70, y);
  y += 6;

  // Diferencia
  const dif = cuadre.diferencia;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  if (dif > 0) {
    doc.setTextColor(...C.green);
    doc.text(`Diferencia: +$${fmtCurrency(dif)} (Sobra)`, ML + 4, y);
  } else if (dif < 0) {
    doc.setTextColor(...C.red);
    doc.text(`Diferencia: -$${fmtCurrency(Math.abs(dif))} (Falta)`, ML + 4, y);
  } else {
    doc.setTextColor(...C.green);
    doc.text('Diferencia: $0.00 (Cuadra)', ML + 4, y);
  }
  y += 10;

  // ═══ VENTAS ═══
  if (ventas.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = drawCleanTable(doc, y,
      ['Folio', 'Cliente', 'Condición', 'Estado', 'Total'],
      ventas.map(v => [
        v.folio,
        v.cliente,
        v.condicion === 'contado' ? 'Contado' : 'Crédito',
        v.status,
        { content: `$${fmtCurrency(v.total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      {
        0: { cellWidth: 24 },
        2: { cellWidth: 22 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28, halign: 'right' },
      },
    );

    // Total ventas
    const totalVentas = ventas.reduce((s, v) => s + v.total, 0);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total ventas: $${fmtCurrency(totalVentas)}`, rightX, y - 3, { align: 'right' });
    y += 4;
  }

  // Cancelled
  if (ventasCanceladas.length > 0) {
    y = checkPageBreak(doc, y, 20);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.red);
    doc.text(`VENTAS CANCELADAS (${ventasCanceladas.length})`, ML, y);
    y += 5;
    for (const v of ventasCanceladas) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.muted);
      doc.text(`${v.folio} — ${v.cliente}`, ML + 4, y);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...C.red);
      doc.text(`$${fmtCurrency(v.total)}`, rightX, y, { align: 'right' });
      y += 4.5;
      y = checkPageBreak(doc, y, 10);
    }
    y += 4;
  }

  // ═══ PRODUCTOS VENDIDOS ═══
  if (productos.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = drawCleanTable(doc, y,
      ['Código', 'Producto', 'Cantidad', 'Total'],
      productos.map(p => [
        p.codigo,
        p.nombre,
        { content: String(p.cantidad), styles: { halign: 'right' } },
        { content: `$${fmtCurrency(p.total)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      {
        0: { cellWidth: 28 },
        2: { cellWidth: 22, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
      },
    );
  }

  // ═══ COBROS ═══
  if (cobros.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = drawCleanTable(doc, y,
      ['Cliente', 'Método', 'Referencia', 'Monto'],
      cobros.map(c => [
        c.cliente,
        c.metodo,
        c.referencia || '—',
        { content: `$${fmtCurrency(c.monto)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      {
        1: { cellWidth: 26 },
        2: { cellWidth: 30 },
        3: { cellWidth: 28, halign: 'right' },
      },
    );
    const totalCobros = cobros.reduce((s, c) => s + c.monto, 0);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total cobros: $${fmtCurrency(totalCobros)}`, rightX, y - 3, { align: 'right' });
    y += 4;
  }

  // ═══ GASTOS ═══
  if (gastos.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = drawCleanTable(doc, y,
      ['Concepto', 'Notas', 'Monto'],
      gastos.map(g => [
        g.concepto,
        g.notas || '—',
        { content: `-$${fmtCurrency(g.monto)}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.red } },
      ]),
      {
        2: { cellWidth: 28, halign: 'right' },
      },
    );
    const totalG = gastos.reduce((s, g) => s + g.monto, 0);
    doc.setFontSize(9.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.red);
    doc.text(`Total gastos: -$${fmtCurrency(totalG)}`, rightX, y - 3, { align: 'right' });
    y += 4;
  }

  // ═══ DEVOLUCIONES ═══
  if (devoluciones.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = drawCleanTable(doc, y,
      ['Código', 'Producto', 'Motivo', 'Cantidad'],
      devoluciones.map(d => [
        d.codigo,
        d.nombre,
        d.motivo,
        { content: String(d.cantidad), styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      {
        0: { cellWidth: 28 },
        2: { cellWidth: 30 },
        3: { cellWidth: 22, halign: 'right' },
      },
    );
  }

  // ═══ STOCK ALMACÉN ═══
  if (params.stockAlmacen && params.stockAlmacen.lineas.length > 0) {
    y = checkPageBreak(doc, y, 30);
    y = drawCleanTable(doc, y,
      ['Código', `Producto — ${params.stockAlmacen.almacenNombre}`, 'Existencia'],
      params.stockAlmacen.lineas.map(s => [
        s.codigo,
        s.nombre,
        { content: String(s.cantidad), styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      {
        0: { cellWidth: 28 },
        2: { cellWidth: 25, halign: 'right' },
      },
    );
  }
  if (notas) {
    y = drawNotes(doc, y, notas, 'Observaciones del vendedor');
  }
  if (notasSupervisor) {
    y = drawNotes(doc, y, notasSupervisor, 'Notas del administrador');
  }

  // ═══ FIRMAS ═══
  y = drawSignatures(doc, y, { title: 'Vendedor', name: vendedorNombre }, { title: 'Supervisor / Administrador' });

  drawFooter(doc, empresa);
  return doc.output('blob');
}
