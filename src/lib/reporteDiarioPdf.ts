/**
 * Generate a multi-section PDF for "Reporte Diario de Ruta".
 * Mirrors the on-screen sections (KPIs, ventas, productos, cobros, gastos, devoluciones, visitas, stock, resumen).
 */
import { getCurrencyConfig } from '@/lib/currency';

export interface ReporteDiarioPdfData {
  empresa: {
    nombre?: string | null;
    razon_social?: string | null;
    rfc?: string | null;
    direccion?: string | null;
    colonia?: string | null;
    ciudad?: string | null;
    estado?: string | null;
    cp?: string | null;
    telefono?: string | null;
    moneda?: string | null;
  };
  usuarioNombre: string;
  fechaLabel: string;
  totals: {
    totalVentas: number;
    totalContado: number;
    totalCredito: number;
    totalCancelado: number;
    totalCobros: number;
    totalGastos: number;
    totalDevUnidades: number;
    totalDevCredito: number;
    clientesVisitados: number;
    visitasSinCompra: number;
    cobrosPorMetodo: Record<string, number>;
    countVentas: number;
    countContado: number;
    countCredito: number;
    countCobros: number;
    countGastos: number;
    countDevoluciones: number;
  };
  ventasActivas: { folio?: string | null; cliente?: string; condicion_pago?: string; total: number }[];
  ventasCanceladas: { folio?: string | null; cliente?: string; total: number }[];
  productos: { codigo: string; nombre: string; cantidad: number; total: number }[];
  cobros: { cliente?: string; metodo_pago?: string; referencia?: string | null; monto: number }[];
  gastos: { concepto?: string; notas?: string | null; monto: number }[];
  devoluciones: { nombre: string; codigo: string; cantidad: number; motivo: string; accion: string; monto_credito: number; cliente: string }[];
  visitasSinCompra: { cliente?: string; motivo?: string | null; notas?: string | null }[];
  abonosCreditoPrevio?: {
    items: { cliente: string; venta_folio: string; venta_fecha: string; metodo_pago: string; referencia: string | null; monto_aplicado: number; dias_atraso: number }[];
    totalMonto: number;
    clientesUnicos: number;
  };
  stock?: { items: { codigo: string; nombre: string; cantidad: number }[]; almacenNombre: string };
}

const ACCION_LABELS: Record<string, string> = {
  reposicion: 'Reposición',
  nota_credito: 'Nota crédito',
  descuento_venta: 'Desc. venta',
  devolucion_dinero: 'Dev. dinero',
};

export async function generarReporteDiarioPdf(data: ReporteDiarioPdfData): Promise<Blob> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const sym = getCurrencyConfig(data.empresa.moneda).symbol;
  const fmt = (n: number) => `${sym} ${Number(n || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  // ── Header ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(20);
  doc.text(data.empresa.razon_social || data.empresa.nombre || '', margin, 50);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(110);
  let hy = 64;
  if (data.empresa.rfc) { doc.text(data.empresa.rfc, margin, hy); hy += 10; }
  const dirLine = [data.empresa.direccion, data.empresa.colonia, data.empresa.ciudad, data.empresa.estado, data.empresa.cp].filter(Boolean).join(', ');
  if (dirLine) { doc.text(dirLine, margin, hy); hy += 10; }
  if (data.empresa.telefono) { doc.text(`Tel: ${data.empresa.telefono}`, margin, hy); hy += 10; }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(20);
  doc.text('Reporte de Ruta', pageW - margin, 50, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(data.usuarioNombre, pageW - margin, 64, { align: 'right' });
  doc.text(data.fechaLabel, pageW - margin, 76, { align: 'right' });

  // separator
  doc.setDrawColor(220);
  doc.setLineWidth(1);
  doc.line(margin, 92, pageW - margin, 92);

  let y = 108;

  // ── KPI band ──
  const kpis: [string, string, string][] = [
    ['Ventas totales', fmt(data.totals.totalVentas), `${data.totals.countVentas} ventas`],
    ['Contado', fmt(data.totals.totalContado), `${data.totals.countContado}`],
    ['Crédito', fmt(data.totals.totalCredito), `${data.totals.countCredito}`],
    ['Cobros', fmt(data.totals.totalCobros), `${data.totals.countCobros}`],
    ['Gastos', `- ${fmt(data.totals.totalGastos)}`, `${data.totals.countGastos}`],
    ['Devoluciones', `${data.totals.totalDevUnidades} uds`, `${data.totals.countDevoluciones} reg.`],
    ['Visitados', `${data.totals.clientesVisitados}`, ''],
  ];
  const kpiCols = 4;
  const kpiW = (pageW - margin * 2 - (kpiCols - 1) * 8) / kpiCols;
  const kpiH = 44;
  kpis.forEach((k, i) => {
    const col = i % kpiCols;
    const row = Math.floor(i / kpiCols);
    const x = margin + col * (kpiW + 8);
    const ky = y + row * (kpiH + 8);
    doc.setDrawColor(220);
    doc.setFillColor(252, 252, 252);
    doc.roundedRect(x, ky, kpiW, kpiH, 3, 3, 'FD');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(k[0].toUpperCase(), x + kpiW / 2, ky + 12, { align: 'center' });
    doc.setFontSize(11);
    doc.setTextColor(20);
    doc.text(k[1], x + kpiW / 2, ky + 27, { align: 'center' });
    if (k[2]) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(k[2], x + kpiW / 2, ky + 38, { align: 'center' });
    }
  });
  const kpiRows = Math.ceil(kpis.length / kpiCols);
  y = y + kpiRows * (kpiH + 8) + 6;

  const sectionTitle = (title: string) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(60);
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(220);
    doc.line(margin, y + 4, pageW - margin, y + 4);
    y += 12;
  };

  const drawTable = (head: string[], body: any[][], foot?: any[]) => {
    autoTable(doc, {
      startY: y,
      head: [head],
      body,
      foot: foot ? [foot] : undefined,
      theme: 'plain',
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
      headStyles: { fontStyle: 'bold', fontSize: 7, textColor: 80, fillColor: [247, 247, 247], lineWidth: { bottom: 1 }, lineColor: [220, 220, 220] },
      footStyles: { fontStyle: 'bold', fillColor: [250, 250, 250], lineWidth: { top: 1 }, lineColor: [220, 220, 220] },
      bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    });
    y = (doc as any).lastAutoTable?.finalY ?? y + 20;
    y += 12;
  };

  // ── Stock (optional) ──
  if (data.stock && data.stock.items.length > 0) {
    sectionTitle(`Stock — ${data.stock.almacenNombre}`);
    drawTable(
      ['Código', 'Producto', 'Existencia'],
      data.stock.items.map(p => [p.codigo, p.nombre, { content: String(p.cantidad), styles: { halign: 'right' } }]),
    );
  }

  // ── Ventas ──
  if (data.ventasActivas.length > 0) {
    sectionTitle(`Ventas (${data.ventasActivas.length})`);
    drawTable(
      ['Folio', 'Cliente', 'Pago', 'Total'],
      data.ventasActivas.map(v => [
        v.folio ?? '—',
        v.cliente ?? '—',
        v.condicion_pago ?? '',
        { content: fmt(v.total), styles: { halign: 'right' } },
      ]),
      ['', '', { content: 'Total', styles: { halign: 'right' } }, { content: fmt(data.totals.totalVentas), styles: { halign: 'right' } }],
    );
  }

  // ── Canceladas ──
  if (data.ventasCanceladas.length > 0) {
    sectionTitle(`Canceladas (${data.ventasCanceladas.length})`);
    drawTable(
      ['Folio', 'Cliente', 'Total'],
      data.ventasCanceladas.map(v => [v.folio ?? '—', v.cliente ?? '—', { content: fmt(v.total), styles: { halign: 'right' } }]),
      ['', { content: 'Total cancelado', styles: { halign: 'right' } }, { content: fmt(data.totals.totalCancelado), styles: { halign: 'right' } }],
    );
  }

  // ── Productos vendidos ──
  if (data.productos.length > 0) {
    sectionTitle(`Productos vendidos (${data.productos.length})`);
    drawTable(
      ['Código', 'Producto', 'Cantidad', 'Total'],
      data.productos.map(p => [
        p.codigo,
        p.nombre,
        { content: String(p.cantidad), styles: { halign: 'right' } },
        { content: fmt(p.total), styles: { halign: 'right' } },
      ]),
    );
  }

  // ── Cobros ──
  if (data.cobros.length > 0) {
    sectionTitle(`Cobros (${data.cobros.length})`);
    // breakdown by metodo
    const breakdown = Object.entries(data.totals.cobrosPorMetodo)
      .map(([m, t]) => `${m}: ${fmt(t)}`)
      .join('   ');
    if (breakdown) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(breakdown, margin, y);
      y += 12;
    }
    drawTable(
      ['Cliente', 'Método', 'Referencia', 'Monto'],
      data.cobros.map(c => [
        c.cliente ?? '—',
        c.metodo_pago ?? '',
        c.referencia || '—',
        { content: fmt(c.monto), styles: { halign: 'right' } },
      ]),
      ['', '', { content: 'Total cobros', styles: { halign: 'right' } }, { content: fmt(data.totals.totalCobros), styles: { halign: 'right' } }],
    );
  }

  // ── Gastos ──
  if (data.gastos.length > 0) {
    sectionTitle(`Gastos (${data.gastos.length})`);
    drawTable(
      ['Concepto', 'Notas', 'Monto'],
      data.gastos.map(g => [g.concepto ?? '', g.notas || '—', { content: `- ${fmt(g.monto)}`, styles: { halign: 'right' } }]),
      ['', { content: 'Total gastos', styles: { halign: 'right' } }, { content: `- ${fmt(data.totals.totalGastos)}`, styles: { halign: 'right' } }],
    );
  }

  // ── Devoluciones ──
  if (data.devoluciones.length > 0) {
    sectionTitle(`Devoluciones (${data.totals.totalDevUnidades} uds)`);
    drawTable(
      ['Producto', 'Cliente', 'Motivo', 'Acción', 'Cant.'],
      data.devoluciones.map(d => [
        `${d.nombre} ${d.codigo}`.trim(),
        d.cliente,
        d.motivo.replace(/_/g, ' '),
        ACCION_LABELS[d.accion] || d.accion,
        { content: String(d.cantidad), styles: { halign: 'right' } },
      ]),
      data.totals.totalDevCredito > 0
        ? ['', '', '', { content: 'Total crédito', styles: { halign: 'right' } }, { content: fmt(data.totals.totalDevCredito), styles: { halign: 'right' } }]
        : undefined,
    );
  }

  // ── Visitas sin compra ──
  if (data.visitasSinCompra.length > 0) {
    sectionTitle(`Visitas sin compra (${data.visitasSinCompra.length})`);
    drawTable(
      ['Cliente', 'Motivo', 'Notas'],
      data.visitasSinCompra.map(v => [v.cliente ?? '—', v.motivo || '—', v.notas || '—']),
    );
  }

  // ── Resumen final ──
  sectionTitle('Resumen del período');
  const resumenRows: any[][] = [
    ['Ventas (contado)', { content: fmt(data.totals.totalContado), styles: { halign: 'right' } }],
    ['Ventas (crédito)', { content: fmt(data.totals.totalCredito), styles: { halign: 'right' } }],
    ['Cobros recibidos', { content: fmt(data.totals.totalCobros), styles: { halign: 'right' } }],
    ['Gastos', { content: `- ${fmt(data.totals.totalGastos)}`, styles: { halign: 'right' } }],
    ['Canceladas', { content: fmt(data.totals.totalCancelado), styles: { halign: 'right' } }],
    ['Clientes visitados', { content: String(data.totals.clientesVisitados), styles: { halign: 'right' } }],
    ['Visitas sin compra', { content: String(data.totals.visitasSinCompra), styles: { halign: 'right' } }],
    ['Devoluciones', { content: `${data.totals.totalDevUnidades} uds`, styles: { halign: 'right' } }],
  ];
  if (data.totals.totalDevCredito > 0) {
    resumenRows.push(['Crédito por devolución', { content: `- ${fmt(data.totals.totalDevCredito)}`, styles: { halign: 'right' } }]);
  }
  const efectivoEsperado = (data.totals.cobrosPorMetodo['efectivo'] || 0) - data.totals.totalGastos;
  resumenRows.push([
    { content: 'Efectivo esperado', styles: { fontStyle: 'bold', fillColor: [240, 240, 240] } },
    { content: fmt(efectivoEsperado), styles: { halign: 'right', fontStyle: 'bold', fillColor: [240, 240, 240] } },
  ]);

  autoTable(doc, {
    startY: y,
    body: resumenRows,
    theme: 'plain',
    margin: { left: margin, right: pageW - margin - 280 },
    styles: { fontSize: 9, cellPadding: 4, textColor: 30 },
    bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    tableWidth: 280,
  });

  // Footer on every page
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(160);
    const footY = doc.internal.pageSize.getHeight() - 24;
    doc.text(
      `Generado por Rutapp · ${new Date().toLocaleString('es-MX')}  ·  Página ${i} de ${pageCount}`,
      pageW / 2,
      footY,
      { align: 'center' },
    );
  }

  return doc.output('blob');
}
