// Reporte Diario en formato TICKET (80mm) optimizado para WhatsApp móvil.
// Layout angosto, una columna, sin necesidad de zoom.
import { jsPDF } from "npm:jspdf@2.5.1";

export interface ReportePdfData {
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
  fechaISO?: string;
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

const MONEDA_SYMBOLS: Record<string, string> = {
  MXN: "$", USD: "US$", EUR: "€", GTQ: "Q", COP: "$", ARS: "$", PEN: "S/", CLP: "$", BRL: "R$",
};

const ACCION_LABELS: Record<string, string> = {
  reposicion: "Reposición",
  nota_credito: "Nota crédito",
  descuento_venta: "Desc. venta",
  devolucion_dinero: "Dev. dinero",
};

// Ticket: ancho 80mm (~226pt). Alto generoso, paginado automático.
const TICKET_W = 226;
const TICKET_H = 1600;
const M = 8;
const INNER = TICKET_W - M * 2;

export async function generarReporteBotPdf(data: ReportePdfData): Promise<Uint8Array> {
  const sym = MONEDA_SYMBOLS[(data.empresa.moneda || "MXN").toUpperCase()] || "$";
  const fmt = (n: number) =>
    `${sym}${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doc = new jsPDF({ unit: "pt", format: [TICKET_W, TICKET_H] });
  let y = M + 4;

  const ensure = (need: number) => {
    if (y + need > TICKET_H - M) {
      doc.addPage([TICKET_W, TICKET_H], "p");
      y = M + 4;
    }
  };

  const setFont = (size: number, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };

  const txt = (s: string, x: number, opts?: { align?: "left" | "right" | "center" }) => {
    doc.text(s, x, y, opts as any);
  };

  const center = (s: string, size: number, bold = false, color = 20) => {
    setFont(size, bold);
    doc.setTextColor(color);
    ensure(size + 2);
    y += size;
    txt(s, TICKET_W / 2, { align: "center" });
  };

  const line = (dashed = false) => {
    ensure(6);
    y += 4;
    doc.setDrawColor(160);
    doc.setLineWidth(0.4);
    if (dashed) {
      let x = M;
      while (x < TICKET_W - M) {
        doc.line(x, y, Math.min(x + 2, TICKET_W - M), y);
        x += 4;
      }
    } else {
      doc.line(M, y, TICKET_W - M, y);
    }
    y += 2;
  };

  const wrap = (s: string, maxW: number, size: number): string[] => {
    setFont(size);
    return doc.splitTextToSize(s, maxW) as string[];
  };

  // Fila etiqueta : valor (valor a la derecha)
  const kv = (label: string, value: string, size = 9, bold = false) => {
    setFont(size, bold);
    doc.setTextColor(20);
    ensure(size + 4);
    y += size;
    doc.text(label, M, y);
    doc.text(value, TICKET_W - M, y, { align: "right" });
    y += 2;
  };

  // Fila de detalle: izquierda con wrap, derecha alineada
  const row = (left: string, right: string, size = 8) => {
    setFont(size);
    doc.setTextColor(30);
    const rightW = doc.getTextWidth(right);
    const leftW = INNER - rightW - 6;
    const lines = wrap(left, leftW, size);
    ensure(lines.length * (size + 1) + 2);
    y += size;
    doc.text(lines, M, y);
    doc.text(right, TICKET_W - M, y, { align: "right" });
    y += (lines.length - 1) * (size + 1) + 2;
  };

  const section = (title: string) => {
    ensure(20);
    y += 6;
    setFont(9, true);
    doc.setTextColor(20);
    y += 9;
    doc.text(title.toUpperCase(), TICKET_W / 2, y, { align: "center" });
    y += 2;
    line(true);
  };

  // ── ENCABEZADO ──
  center(data.empresa.razon_social || data.empresa.nombre || "Empresa", 11, true);
  if (data.empresa.rfc) center(`RFC: ${data.empresa.rfc}`, 7, false, 110);
  const dirLine = [data.empresa.direccion, data.empresa.colonia, data.empresa.ciudad].filter(Boolean).join(", ");
  if (dirLine) {
    setFont(7);
    doc.setTextColor(110);
    const lns = wrap(dirLine, INNER, 7);
    lns.forEach((l) => { ensure(8); y += 8; doc.text(l, TICKET_W / 2, y, { align: "center" }); });
  }
  if (data.empresa.telefono) center(`Tel: ${data.empresa.telefono}`, 7, false, 110);

  y += 4;
  line();
  center("REPORTE DE RUTA", 12, true);
  center(data.usuarioNombre, 9, false, 70);
  center(data.fechaLabel, 9, false, 70);
  line();

  // ── RESUMEN PRINCIPAL ──
  section("Resumen");
  kv("Ventas", fmt(data.totals.totalVentas), 10, true);
  kv(`  Contado (${data.totals.countContado})`, fmt(data.totals.totalContado), 9);
  kv(`  Crédito (${data.totals.countCredito})`, fmt(data.totals.totalCredito), 9);
  if (data.totals.totalCancelado > 0) kv("  Canceladas", fmt(data.totals.totalCancelado), 9);
  y += 2;
  kv("Cobros", fmt(data.totals.totalCobros), 10, true);
  Object.entries(data.totals.cobrosPorMetodo).forEach(([m, v]) => {
    if (v > 0) kv(`  ${m}`, fmt(v), 9);
  });
  y += 2;
  if (data.totals.totalGastos > 0) kv("Gastos", `- ${fmt(data.totals.totalGastos)}`, 10, true);
  if (data.totals.countDevoluciones > 0) {
    kv("Devoluciones", `${data.totals.totalDevUnidades} uds`, 10, true);
    if (data.totals.totalDevCredito > 0) kv("  Crédito generado", fmt(data.totals.totalDevCredito), 9);
  }
  y += 2;
  kv("Visitados", String(data.totals.clientesVisitados), 9);
  if (data.totals.visitasSinCompra > 0) kv("Sin compra", String(data.totals.visitasSinCompra), 9);

  line();
  const efectivoEsperado = (data.totals.cobrosPorMetodo["efectivo"] || 0) - data.totals.totalGastos;
  kv("EFECTIVO ESPERADO", fmt(efectivoEsperado), 11, true);
  line();

  // ── VENTAS ──
  if (data.ventasActivas.length > 0) {
    section(`Ventas (${data.ventasActivas.length})`);
    data.ventasActivas.forEach((v) => {
      const label = `${v.folio ?? "—"} · ${v.cliente ?? "—"}${v.condicion_pago ? ` (${v.condicion_pago})` : ""}`;
      row(label, fmt(v.total));
    });
    line(true);
    kv("Total", fmt(data.totals.totalVentas), 9, true);
  }

  // ── CANCELADAS ──
  if (data.ventasCanceladas.length > 0) {
    section(`Canceladas (${data.ventasCanceladas.length})`);
    data.ventasCanceladas.forEach((v) => row(`${v.folio ?? "—"} · ${v.cliente ?? "—"}`, fmt(v.total)));
    line(true);
    kv("Total", fmt(data.totals.totalCancelado), 9, true);
  }

  // ── PRODUCTOS ──
  if (data.productos.length > 0) {
    section(`Productos (${data.productos.length})`);
    data.productos.forEach((p) => {
      const label = `${p.cantidad}x ${p.nombre}${p.codigo ? ` [${p.codigo}]` : ""}`;
      row(label, fmt(p.total));
    });
  }

  // ── COBROS ──
  if (data.cobros.length > 0) {
    section(`Cobros (${data.cobros.length})`);
    data.cobros.forEach((c) => {
      const meta = [c.metodo_pago, c.referencia].filter(Boolean).join(" · ");
      row(`${c.cliente ?? "—"}${meta ? `\n  ${meta}` : ""}`, fmt(c.monto));
    });
    line(true);
    kv("Total cobros", fmt(data.totals.totalCobros), 9, true);
  }

  // ── GASTOS ──
  if (data.gastos.length > 0) {
    section(`Gastos (${data.gastos.length})`);
    data.gastos.forEach((g) => row(`${g.concepto ?? ""}${g.notas ? ` · ${g.notas}` : ""}`, `- ${fmt(g.monto)}`));
    line(true);
    kv("Total gastos", `- ${fmt(data.totals.totalGastos)}`, 9, true);
  }

  // ── DEVOLUCIONES ──
  if (data.devoluciones.length > 0) {
    section(`Devoluciones (${data.totals.totalDevUnidades} uds)`);
    data.devoluciones.forEach((d) => {
      const accion = ACCION_LABELS[d.accion] || d.accion;
      row(`${d.cantidad}x ${d.nombre}\n  ${d.cliente} · ${accion}`, "");
    });
    if (data.totals.totalDevCredito > 0) {
      line(true);
      kv("Crédito generado", fmt(data.totals.totalDevCredito), 9, true);
    }
  }

  // ── VISITAS SIN COMPRA ──
  if (data.visitasSinCompra.length > 0) {
    section(`Sin compra (${data.visitasSinCompra.length})`);
    data.visitasSinCompra.forEach((v) => {
      const extra = [v.motivo, v.notas].filter(Boolean).join(" · ");
      row(`${v.cliente ?? "—"}${extra ? `\n  ${extra}` : ""}`, "");
    });
  }

  // ── ABONOS A CRÉDITO PREVIO ──
  if (data.abonosCreditoPrevio && data.abonosCreditoPrevio.items.length > 0) {
    const abp = data.abonosCreditoPrevio;
    section(`Abonos crédito (${abp.items.length})`);
    abp.items.forEach((a) => {
      const meta = `${a.venta_folio} · ${a.venta_fecha}${a.dias_atraso ? ` · ${a.dias_atraso}d` : ""}`;
      row(`${a.cliente}\n  ${meta}`, fmt(a.monto_aplicado));
    });
    line(true);
    kv("Total abonos", fmt(abp.totalMonto), 9, true);
  }

  // ── STOCK ──
  if (data.stock && data.stock.items.length > 0) {
    section(`Stock — ${data.stock.almacenNombre}`);
    data.stock.items.forEach((p) => row(`${p.nombre}${p.codigo ? ` [${p.codigo}]` : ""}`, String(p.cantidad)));
  }

  // ── FOOTER ──
  y += 6;
  line();
  center("Generado por Rutapp", 7, false, 140);
  center(new Date().toLocaleString("es-MX"), 7, false, 140);

  return new Uint8Array(doc.output("arraybuffer"));
}
