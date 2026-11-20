/**
 * Pedido PDF — Matches the HTML invoice design EXACTLY
 */
import {
  createDoc, ML, MR, C, fmtCurrency, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable, drawTotalsBlock,
  drawImporteConLetra, drawNotes, drawSignatures, drawFooter,
  drawSectionTitle, checkPageBreak, numberToWords,
  type EmpresaInfo,
} from './pdfStyleOdoo';
import { getCurrencyConfig } from '@/lib/currency';
import {
  resolverOpcionesTicket, MOTIVO_DEVOLUCION_LABELS, ACCION_DEVOLUCION_LABELS,
  type TicketCampos,
} from '@/lib/ticketModelo';

interface PedidoPdfPromo {
  descripcion: string;
  descuento: number;
  producto_id?: string;
}

export interface PedidoPdfParams {
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
    saldo_pendiente?: number;
    notas?: string | null;
  };
  cliente: {
    nombre: string;
    codigo?: string | null;
    telefono?: string | null;
    direccion?: string | null;
    rfc?: string | null;
    email?: string | null;
    cp?: string | null;
    colonia?: string | null;
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
    producto_id?: string;
    precio_sugerido_publico?: number;
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
  promociones?: PedidoPdfPromo[];
  devoluciones?: { nombre: string; cantidad: number; motivo: string; accion: string; monto?: number }[];
  /**
   * Opciones del diseñador de ticket (`empresas.ticket_campos`): la nota carta
   * obedece las mismas que el ticket. Sin valor = todo encendido.
   */
  ticketCampos?: TicketCampos | null;
  /** `empresas.notas_ticket` (se muestra si `notas_ticket` está encendido). */
  notasTicket?: string | null;
}

const STATUS_MAP: Record<string, { label: string; color: 'green' | 'red' | 'neutral' }> = {
  borrador: { label: 'Borrador', color: 'neutral' },
  confirmado: { label: 'Confirmada', color: 'green' },
  entregado: { label: 'Entregada', color: 'green' },
  facturado: { label: 'Facturada', color: 'green' },
  cancelado: { label: 'Cancelada', color: 'red' },
  pagado: { label: 'Pagada', color: 'green' },
};

const ENTREGA_STATUS: Record<string, string> = {
  borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
  cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
};

export async function generarPedidoPdf(params: PedidoPdfParams): Promise<Blob> {
  const { empresa, pedido, cliente, almacen, lineas, entregas, devoluciones } = params;
  // Mismas opciones que el ticket (Configuración → Ticket); el diseño carta no cambia.
  const o = resolverOpcionesTicket(params.ticketCampos ?? null);
  const logoBase64 = o.logo ? params.logoBase64 : null;
  const vendedor = o.vendedorNombre ? params.vendedor : undefined;
  const pagos = o.pagosRecibidos ? params.pagos : [];
  const promociones = o.promociones ? params.promociones : undefined;
  const promosEnRenglon = o.promociones && o.lineaPromo ? params.promociones : undefined;
  const empresaEnc: EmpresaInfo = {
    ...empresa,
    nombre: o.nombre ? empresa.nombre : '',
    razon_social: o.razonSocial || !o.nombre ? empresa.razon_social : null,
    rfc: o.rfc ? empresa.rfc : null,
    email: o.email ? empresa.email : null,
    telefono: o.telefono ? empresa.telefono : null,
    direccion: o.direccion ? empresa.direccion : null,
    colonia: o.direccion ? empresa.colonia : null,
    ciudad: o.direccion ? empresa.ciudad : null,
    estado: o.direccion ? empresa.estado : null,
    cp: o.direccion ? empresa.cp : null,
  };
  const doc = await createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const rightX = pageW - MR;
  const cc = getCurrencyConfig(empresa.moneda);
  const s = cc.symbol;

  const statusInfo = STATUS_MAP[pedido.status] || { label: pedido.status.charAt(0).toUpperCase() + pedido.status.slice(1), color: 'neutral' as const };
  const pagoLabel = pedido.condicion_pago === 'credito' ? 'Crédito' : pedido.condicion_pago === 'contado' ? 'Contado' : 'Por definir';

  // ── HEADER with status chip ──
  let y = drawDocHeader(doc, empresaEnc, 'ORDEN DE VENTA', o.folio ? pedido.folio : '', logoBase64, statusInfo.label, statusInfo.color);

  // ── TEXTO LIBRE DEL ENCABEZADO (diseñador de ticket) ──
  if (o.textoEncabezado) y = drawNotes(doc, y, o.textoEncabezado, 'Aviso');

  // ── INFO GRID — Client left, Document info right ──
  const contactoCliente = [cliente.email, o.clienteTelefono ? cliente.telefono : null].filter(Boolean).join(' · ');
  const leftRows: [string, string][] = [
    ...(o.clienteNombre ? [['_name', cliente.nombre] as [string, string]] : []),
    ...(o.clienteRfc && cliente.rfc ? [['RFC:', cliente.rfc] as [string, string]] : []),
    ...(o.clienteDireccion && cliente.direccion ? [['', cliente.direccion] as [string, string]] : []),
    ...(o.clienteDireccion && cliente.colonia ? [['', cliente.colonia] as [string, string]] : []),
    ...(o.clienteDireccion && cliente.cp ? [['C.P.', cliente.cp] as [string, string]] : []),
    ...(contactoCliente ? [['', contactoCliente] as [string, string]] : []),
  ];

  const rightRows: [string, string][] = [
    ...(o.fecha ? [['Fecha de venta:', fmtDate(pedido.fecha)] as [string, string]] : []),
    ...(o.condicionPago ? [['Condiciones de pago:', pagoLabel] as [string, string]] : []),
    ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
    ['Moneda:', `${cc.code} - ${cc.name}`],
  ];

  y = drawInfoGrid(doc, y, 'Cliente', leftRows, 'Información de la venta', rightRows);

  // ── PRODUCTS TABLE (with inline promo rows) ──
  // Columnas según las opciones del ticket (código, P. unitario, descuento,
  // impuestos y sugerido). «Producto», «Cant», «Unidad» e «Importe» siempre van.
  type Celda = string | { content: string; colSpan?: number; styles?: Record<string, unknown> };
  type Columna = { titulo: string; ancho?: number; halign?: 'left' | 'center' | 'right'; celda: (l: PedidoPdfParams['lineas'][number]) => Celda };
  const guion = { content: '—', styles: { halign: 'center', textColor: C.sublabel } };
  const showSugerido = o.lineaPrecioSugerido && lineas.some(l => (l.precio_sugerido_publico ?? 0) > 0);
  const columnas: Columna[] = [
    ...(o.lineaCodigo ? [{ titulo: 'Código', ancho: 18, celda: l => ({ content: l.codigo, styles: { textColor: C.sublabel, fontStyle: 'normal', fontSize: 7 } }) } as Columna] : []),
    { titulo: 'Producto', celda: l => l.nombre },
    { titulo: 'Cant', ancho: 12, halign: 'center', celda: l => ({ content: String(l.cantidad), styles: { halign: 'center' } }) },
    { titulo: 'Unidad', ancho: 15, celda: l => l.unidad || 'Pieza' },
    ...(o.lineaPrecioUnitario ? [{ titulo: 'P. Unit.', ancho: 20, halign: 'right', celda: l => ({ content: `${s}${fmtCurrency(l.precio_unitario)}`, styles: { halign: 'right' } }) } as Columna] : []),
    ...(o.lineaDescuento ? [{ titulo: 'Desc', ancho: 12, halign: 'center', celda: l => (l.descuento_pct > 0
      ? { content: `${l.descuento_pct}%`, styles: { halign: 'center', textColor: C.red } }
      : guion) } as Columna] : []),
    ...(o.impuestos ? [
      { titulo: 'IVA', ancho: 12, halign: 'center', celda: l => ({ content: l.iva_pct > 0 ? `${l.iva_pct}%` : '—', styles: { halign: 'center', textColor: l.iva_pct > 0 ? C.text : C.sublabel } }) } as Columna,
      { titulo: 'IEPS', ancho: 12, halign: 'center', celda: l => ({ content: l.ieps_pct > 0 ? `${l.ieps_pct}%` : '—', styles: { halign: 'center', textColor: l.ieps_pct > 0 ? C.text : C.sublabel } }) } as Columna,
    ] : []),
    ...(showSugerido ? [{ titulo: 'Sug. púb.', ancho: 20, halign: 'right', celda: l => ((l.precio_sugerido_publico ?? 0) > 0
      ? { content: `${s}${fmtCurrency(l.precio_sugerido_publico!)}`, styles: { halign: 'right', fontStyle: 'bold' } }
      : guion) } as Columna] : []),
    { titulo: 'Importe', ancho: showSugerido ? 22 : 24, halign: 'right', celda: l => ({ content: `${s}${fmtCurrency(l.total)}`, styles: { halign: 'right', fontStyle: 'bold' } }) },
  ];
  const idxProducto = columnas.findIndex(c => c.titulo === 'Producto');
  const tableRows: Celda[][] = [];
  for (const l of lineas) {
    tableRows.push(columnas.map(c => c.celda(l)));
    // Renglón de promoción bajo su producto (opción «Renglón de promoción»)
    const linePromos = (promosEnRenglon ?? []).filter(p => p.producto_id && p.producto_id === l.producto_id);
    for (const lp of linePromos) {
      tableRows.push([
        ...Array.from({ length: idxProducto }, () => ''),
        { content: `Promo: ${lp.descripcion}`, colSpan: columnas.length - idxProducto - 1, styles: { textColor: C.muted, fontStyle: 'italic', fontSize: 7.5 } },
        { content: `-${s}${fmtCurrency(lp.descuento)}`, styles: { halign: 'right', textColor: C.text, fontStyle: 'bold', fontSize: 7.5 } },
      ]);
    }
  }
  const columnStyles: Record<number, { cellWidth?: number; halign?: 'left' | 'center' | 'right' }> = {};
  columnas.forEach((c, i) => {
    if (c.ancho || c.halign) columnStyles[i] = { ...(c.ancho ? { cellWidth: c.ancho } : {}), ...(c.halign ? { halign: c.halign } : {}) };
  });
  y = await drawCleanTable(doc, y, columnas.map(c => c.titulo), tableRows, columnStyles);

  // ── AHORRO TOTAL PROMOS (inline per product above) ──
  if (promociones && promociones.length > 0) {
    const totalAhorro = promociones.reduce((sum, p) => sum + p.descuento, 0);
    if (totalAhorro > 0) {
      y = checkPageBreak(doc, y);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'bolditalic');
      doc.setTextColor(...C.muted);
      doc.text(`Ahorro total por promociones: ${s}${fmtCurrency(totalAhorro)}`, ML, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...C.text);
    }
  }

  // ── TOTALS ──
  const subtotalBruto = lineas.reduce((s, l) => s + (l.precio_unitario * l.cantidad), 0);
  const totalRows: { label: string; value: string; bold?: boolean; red?: boolean; separator?: boolean }[] = [];

  // Sin «Desglose de impuestos» solo va el Total (con impuestos incluidos).
  if (o.impuestos) {
    if (o.descuentos && pedido.descuento_total > 0) {
      totalRows.push({ label: 'Subtotal bruto:', value: `${s}${fmtCurrency(subtotalBruto)}` });
      totalRows.push({ label: 'Descuentos:', value: `-${s}${fmtCurrency(pedido.descuento_total)}`, red: true });
      totalRows.push({ label: 'Subtotal neto:', value: `${s}${fmtCurrency(pedido.subtotal)}`, separator: true });
    } else {
      totalRows.push({ label: 'Subtotal:', value: `${s}${fmtCurrency(pedido.subtotal)}` });
    }

    if (o.impuestosDesglose) {
      if (pedido.ieps_total > 0) totalRows.push({ label: 'IEPS:', value: `${s}${fmtCurrency(pedido.ieps_total)}` });
      if (pedido.iva_total > 0) totalRows.push({ label: 'IVA 16%:', value: `${s}${fmtCurrency(pedido.iva_total)}` });
    } else if (pedido.ieps_total + pedido.iva_total > 0) {
      totalRows.push({ label: 'Impuestos:', value: `${s}${fmtCurrency(Math.round((pedido.ieps_total + pedido.iva_total) * 100) / 100)}` });
    }
  }
  totalRows.push({ label: 'Total:', value: `${s}${fmtCurrency(pedido.total)}`, bold: true });
  if ((pedido.saldo_pendiente ?? 0) > 0) {
    totalRows.push({ label: 'Saldo pendiente:', value: `${s}${fmtCurrency(pedido.saldo_pendiente!)}`, bold: true, red: true });
  }

  y = drawTotalsBlock(doc, y, totalRows);

  // ── IMPORTE CON LETRA ──
  const words = numberToWords(pedido.total, cc.wordPlural, cc.code);
  y = drawImporteConLetra(doc, y, words);

  // ── NOTAS ──
  if (pedido.notas) {
    y = drawNotes(doc, y, pedido.notas, 'Notas y condiciones');
  }

  // ── ENTREGAS ──
  if (entregas.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, 'Entregas');
    y = await drawCleanTable(doc, y,
      ['Folio', 'Estado', 'Repartidor', 'Productos'],
      entregas.map(e => [
        { content: e.folio, styles: { fontStyle: 'bold' } },
        ENTREGA_STATUS[e.status] ?? e.status,
        e.repartidor ?? '—',
        e.lineas.map(l => `${l.cantidad_entregada}/${l.cantidad_pedida} ${l.codigo}`).join(', '),
      ]),
      {
        0: { cellWidth: 24 },
        1: { cellWidth: 24 },
        2: { cellWidth: 32 },
      },
    );
  }

  // ── PAGOS ──
  if (pagos.length > 0) {
    y = checkPageBreak(doc, y);
    const totalPagado = pagos.reduce((s, p) => s + p.monto, 0);

    y = drawSectionTitle(doc, y, 'Pagos');
    y = await drawCleanTable(doc, y,
      ['Fecha', 'Método', 'Referencia', 'Monto'],
      pagos.map(p => [
        fmtDate(p.fecha),
        p.metodo_pago ? p.metodo_pago.charAt(0).toUpperCase() + p.metodo_pago.slice(1) : '—',
        p.referencia || '—',
        { content: `${s}${fmtCurrency(p.monto)}`, styles: { halign: 'right', fontStyle: 'bold' } },
      ]),
      { 3: { halign: 'right' } },
    );

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text(`Total pagado: ${s}${fmtCurrency(totalPagado)}`, rightX, y - 3, { align: 'right' });
    y += 7;
  }

  // ── DEVOLUCIONES ──
  if (o.devoluciones && devoluciones && devoluciones.length > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, 'Devoluciones');
    y = await drawCleanTable(doc, y,
      ['Producto', 'Cant', 'Motivo', 'Acción', 'Monto'],
      devoluciones.map(d => [
        d.nombre,
        { content: String(d.cantidad), styles: { halign: 'center' } },
        MOTIVO_DEVOLUCION_LABELS[d.motivo] || d.motivo,
        ACCION_DEVOLUCION_LABELS[d.accion] || d.accion,
        { content: (d.monto ?? 0) > 0 ? `${s}${fmtCurrency(d.monto!)}` : '—', styles: { halign: 'right' } },
      ]),
      { 1: { cellWidth: 14, halign: 'center' }, 4: { cellWidth: 26, halign: 'right' } },
    );
  }

  // ── NOTAS DEL TICKET Y TEXTO DEL PIE (diseñador de ticket) ──
  if (o.notas && params.notasTicket) y = drawNotes(doc, y, params.notasTicket, 'Notas');
  if (o.textoPie) y = drawNotes(doc, y, o.textoPie, 'Aviso');

  // ── SIGNATURES ──
  if (o.firmas) {
    y = drawSignatures(doc, y,
      { title: 'Autorizado por', name: vendedor ? `${vendedor} — Ventas` : undefined },
      { title: 'Recibido y aceptado por', name: o.clienteNombre ? cliente.nombre : undefined },
    );
  }

  // ── FOOTER ──
  drawFooter(doc, empresa);

  return doc.output('blob');
}
