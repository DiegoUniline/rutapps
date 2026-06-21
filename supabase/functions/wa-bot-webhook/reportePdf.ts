// Reporte Diario en formato TICKET (80mm) — bot WhatsApp on-demand.
import { jsPDF } from "npm:jspdf@2.5.1";

export interface EmpresaInfo {
  nombre?: string | null;
  razon_social?: string | null;
  rfc?: string | null;
  direccion?: string | null;
  colonia?: string | null;
  ciudad?: string | null;
  estado?: string | null;
  cp?: string | null;
  telefono?: string | null;
  email?: string | null;
  logo_url?: string | null;
  moneda?: string | null;
}

export interface ReportePdfData {
  empresa: EmpresaInfo;
  fechaLabel: string;
  fechaISO: string;
  totals: {
    totalVentas: number;
    totalContado: number;
    totalCredito: number;
    totalCancelado: number;
    totalCobros: number;
    totalGastos: number;
    cobrosPorMetodo: Record<string, number>;
    countVentas: number;
    countCobros: number;
    countGastos: number;
  };
  ventasActivas: { folio?: string | null; cliente?: string; condicion_pago?: string; total: number }[];
  ventasCanceladas: { folio?: string | null; cliente?: string; total: number }[];
  productos: { codigo: string; nombre: string; cantidad: number; total: number }[];
  cobros: { cliente?: string; metodo_pago?: string; referencia?: string | null; monto: number }[];
  gastos: { concepto?: string; notas?: string | null; monto: number }[];
}

const MONEDA_SYMBOLS: Record<string, string> = {
  MXN: "$", USD: "US$", EUR: "€", GTQ: "Q", COP: "$", ARS: "$", PEN: "S/", CLP: "$", BRL: "R$",
};

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
  const center = (s: string, size: number, bold = false, color = 20) => {
    setFont(size, bold);
    doc.setTextColor(color);
    ensure(size + 2);
    y += size;
    doc.text(s, TICKET_W / 2, y, { align: "center" });
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
    } else doc.line(M, y, TICKET_W - M, y);
    y += 2;
  };
  const wrap = (s: string, maxW: number, size: number): string[] => {
    setFont(size);
    return doc.splitTextToSize(s, maxW) as string[];
  };
  const kv = (label: string, value: string, size = 9, bold = false) => {
    setFont(size, bold);
    doc.setTextColor(20);
    ensure(size + 4);
    y += size;
    doc.text(label, M, y);
    doc.text(value, TICKET_W - M, y, { align: "right" });
    y += 2;
  };
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

  // ── Encabezado ──
  center(data.empresa.razon_social || data.empresa.nombre || "Empresa", 11, true);
  if (data.empresa.rfc) center(`RFC: ${data.empresa.rfc}`, 7, false, 110);
  const dirLine = [data.empresa.direccion, data.empresa.colonia, data.empresa.ciudad].filter(Boolean).join(", ");
  if (dirLine) {
    setFont(7);
    doc.setTextColor(110);
    wrap(dirLine, INNER, 7).forEach((l) => { ensure(8); y += 8; doc.text(l, TICKET_W / 2, y, { align: "center" }); });
  }
  if (data.empresa.telefono) center(`Tel: ${data.empresa.telefono}`, 7, false, 110);

  y += 4;
  line();
  center("REPORTE DIARIO", 12, true);
  center(data.fechaLabel, 9, false, 70);
  line();

  // ── Resumen ──
  section("Resumen");
  kv("Ventas", fmt(data.totals.totalVentas), 10, true);
  kv("  Contado", fmt(data.totals.totalContado), 9);
  kv("  Crédito", fmt(data.totals.totalCredito), 9);
  if (data.totals.totalCancelado > 0) kv("  Canceladas", fmt(data.totals.totalCancelado), 9);
  y += 2;
  kv("Cobros", fmt(data.totals.totalCobros), 10, true);
  Object.entries(data.totals.cobrosPorMetodo).forEach(([m, v]) => { if (v > 0) kv(`  ${m}`, fmt(v), 9); });
  y += 2;
  if (data.totals.totalGastos > 0) kv("Gastos", `- ${fmt(data.totals.totalGastos)}`, 10, true);
  line();
  const efectivo = (data.totals.cobrosPorMetodo["efectivo"] || 0) - data.totals.totalGastos;
  kv("EFECTIVO ESPERADO", fmt(efectivo), 11, true);
  line();

  if (data.ventasActivas.length > 0) {
    section(`Ventas (${data.ventasActivas.length})`);
    data.ventasActivas.forEach((v) => row(`${v.folio ?? "—"} · ${v.cliente ?? "—"}${v.condicion_pago ? ` (${v.condicion_pago})` : ""}`, fmt(v.total)));
    line(true);
    kv("Total", fmt(data.totals.totalVentas), 9, true);
  }
  if (data.ventasCanceladas.length > 0) {
    section(`Canceladas (${data.ventasCanceladas.length})`);
    data.ventasCanceladas.forEach((v) => row(`${v.folio ?? "—"} · ${v.cliente ?? "—"}`, fmt(v.total)));
    line(true);
    kv("Total", fmt(data.totals.totalCancelado), 9, true);
  }
  if (data.productos.length > 0) {
    section(`Productos (${data.productos.length})`);
    data.productos.forEach((p) => row(`${p.cantidad}x ${p.nombre}${p.codigo ? ` [${p.codigo}]` : ""}`, fmt(p.total)));
  }
  if (data.cobros.length > 0) {
    section(`Cobros (${data.cobros.length})`);
    data.cobros.forEach((c) => {
      const meta = [c.metodo_pago, c.referencia].filter(Boolean).join(" · ");
      row(`${c.cliente ?? "—"}${meta ? `\n  ${meta}` : ""}`, fmt(c.monto));
    });
    line(true);
    kv("Total cobros", fmt(data.totals.totalCobros), 9, true);
  }
  if (data.gastos.length > 0) {
    section(`Gastos (${data.gastos.length})`);
    data.gastos.forEach((g) => row(`${g.concepto ?? ""}${g.notas ? ` · ${g.notas}` : ""}`, `- ${fmt(g.monto)}`));
    line(true);
    kv("Total gastos", `- ${fmt(data.totals.totalGastos)}`, 9, true);
  }

  y += 6;
  line();
  center("Generado por Rutapp", 7, false, 140);
  center(new Date().toLocaleString("es-MX"), 7, false, 140);

  return new Uint8Array(doc.output("arraybuffer"));
}
