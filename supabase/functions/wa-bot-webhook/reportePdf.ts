// PDF profesional estilo Rutapp (mismo formato que el reporte diario del sistema).
// Usado por el bot de WhatsApp.
import { jsPDF } from "npm:jspdf@2.5.1";
import autoTable from "npm:jspdf-autotable@3.8.2";

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
  fechaLabel: string;     // ej. "hoy", "ayer", "12/06/2026"
  fechaISO: string;       // yyyy-mm-dd
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

async function fetchLogoBase64(url: string): Promise<{ b64: string; type: "PNG" | "JPEG" } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    // base64 encode
    let bin = "";
    for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const type: "PNG" | "JPEG" = ct.includes("jpeg") || ct.includes("jpg") ? "JPEG" : "PNG";
    return { b64: `data:image/${type.toLowerCase()};base64,${b64}`, type };
  } catch {
    return null;
  }
}

export async function generarReporteBotPdf(data: ReportePdfData): Promise<Uint8Array> {
  const sym = MONEDA_SYMBOLS[(data.empresa.moneda || "MXN").toUpperCase()] || "$";
  const fmt = (n: number) =>
    `${sym} ${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  const logo = data.empresa.logo_url ? await fetchLogoBase64(data.empresa.logo_url) : null;

  // ── Header (estilo Odoo / Rutapp B/N) ──
  let headerLeftX = margin;
  if (logo) {
    try {
      doc.addImage(logo.b64, logo.type, margin, 32, 40, 40);
      headerLeftX = margin + 48;
    } catch { /* ignore */ }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(26);
  doc.text((data.empresa.razon_social || data.empresa.nombre || "").toUpperCase(), headerLeftX, 50);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(110);
  let hy = 62;
  const ids: string[] = [];
  if (data.empresa.rfc) ids.push(`RFC: ${data.empresa.rfc}`);
  if (data.empresa.email) ids.push(data.empresa.email);
  if (ids.length) { doc.text(ids.join("  ·  "), headerLeftX, hy); hy += 10; }
  const dirLine = [data.empresa.direccion, data.empresa.colonia, data.empresa.ciudad, data.empresa.estado, data.empresa.cp].filter(Boolean).join(", ");
  if (dirLine) { doc.text(dirLine, headerLeftX, hy); hy += 10; }
  if (data.empresa.telefono) { doc.text(`Tel: ${data.empresa.telefono}`, headerLeftX, hy); hy += 10; }

  // Derecha
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(26);
  doc.text("Reporte Diario", pageW - margin, 50, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(110);
  doc.text(data.fechaLabel, pageW - margin, 64, { align: "right" });
  doc.text(`Fecha: ${data.fechaISO}`, pageW - margin, 76, { align: "right" });
  doc.setFontSize(7);
  doc.setTextColor(150);
  doc.text(`Generado por RutApp Bot · ${new Date().toLocaleString("es-MX")}`, pageW - margin, 88, { align: "right" });

  // Línea negra fina
  doc.setDrawColor(26);
  doc.setLineWidth(1.2);
  doc.line(margin, 96, pageW - margin, 96);

  let y = 112;

  // ── KPIs ──
  const kpis: [string, string, string][] = [
    ["Ventas totales", fmt(data.totals.totalVentas), `${data.totals.countVentas} ventas`],
    ["Contado", fmt(data.totals.totalContado), ""],
    ["Crédito", fmt(data.totals.totalCredito), ""],
    ["Cobros", fmt(data.totals.totalCobros), `${data.totals.countCobros}`],
    ["Gastos", `- ${fmt(data.totals.totalGastos)}`, `${data.totals.countGastos}`],
    ["Canceladas", fmt(data.totals.totalCancelado), ""],
    ["Neto (Cob - Gast)", fmt(data.totals.totalCobros - data.totals.totalGastos), ""],
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
    doc.roundedRect(x, ky, kpiW, kpiH, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(130);
    doc.text(k[0].toUpperCase(), x + kpiW / 2, ky + 12, { align: "center" });
    doc.setFontSize(11);
    doc.setTextColor(26);
    doc.text(k[1], x + kpiW / 2, ky + 27, { align: "center" });
    if (k[2]) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      doc.setTextColor(160);
      doc.text(k[2], x + kpiW / 2, ky + 38, { align: "center" });
    }
  });
  const kpiRows = Math.ceil(kpis.length / kpiCols);
  y = y + kpiRows * (kpiH + 8) + 6;

  const sectionTitle = (title: string) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold");
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
      theme: "plain",
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: 80, fillColor: [247, 247, 247], lineWidth: { bottom: 1 }, lineColor: [220, 220, 220] },
      footStyles: { fontStyle: "bold", fillColor: [250, 250, 250], lineWidth: { top: 1 }, lineColor: [220, 220, 220] },
      bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 12;
  };

  // ── Ventas ──
  if (data.ventasActivas.length > 0) {
    sectionTitle(`Ventas (${data.ventasActivas.length})`);
    drawTable(
      ["Folio", "Cliente", "Pago", "Total"],
      data.ventasActivas.map(v => [
        v.folio ?? "—",
        v.cliente ?? "—",
        v.condicion_pago ?? "",
        { content: fmt(v.total), styles: { halign: "right" } },
      ]),
      ["", "", { content: "Total", styles: { halign: "right" } }, { content: fmt(data.totals.totalVentas), styles: { halign: "right" } }],
    );
  }

  // ── Canceladas ──
  if (data.ventasCanceladas.length > 0) {
    sectionTitle(`Canceladas (${data.ventasCanceladas.length})`);
    drawTable(
      ["Folio", "Cliente", "Total"],
      data.ventasCanceladas.map(v => [v.folio ?? "—", v.cliente ?? "—", { content: fmt(v.total), styles: { halign: "right" } }]),
      ["", { content: "Total cancelado", styles: { halign: "right" } }, { content: fmt(data.totals.totalCancelado), styles: { halign: "right" } }],
    );
  }

  // ── Productos vendidos ──
  if (data.productos.length > 0) {
    sectionTitle(`Productos vendidos (${data.productos.length})`);
    drawTable(
      ["Código", "Producto", "Cant.", "Total"],
      data.productos.map(p => [
        p.codigo || "—",
        p.nombre,
        { content: String(p.cantidad), styles: { halign: "right" } },
        { content: fmt(p.total), styles: { halign: "right" } },
      ]),
    );
  }

  // ── Cobros ──
  if (data.cobros.length > 0) {
    sectionTitle(`Cobros (${data.cobros.length})`);
    const breakdown = Object.entries(data.totals.cobrosPorMetodo)
      .map(([m, t]) => `${m}: ${fmt(t)}`).join("   ");
    if (breakdown) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(100);
      doc.text(breakdown, margin, y);
      y += 12;
    }
    drawTable(
      ["Cliente", "Método", "Referencia", "Monto"],
      data.cobros.map(c => [
        c.cliente ?? "—",
        c.metodo_pago ?? "",
        c.referencia || "—",
        { content: fmt(c.monto), styles: { halign: "right" } },
      ]),
      ["", "", { content: "Total cobros", styles: { halign: "right" } }, { content: fmt(data.totals.totalCobros), styles: { halign: "right" } }],
    );
  }

  // ── Gastos ──
  if (data.gastos.length > 0) {
    sectionTitle(`Gastos (${data.gastos.length})`);
    drawTable(
      ["Concepto", "Notas", "Monto"],
      data.gastos.map(g => [g.concepto ?? "", g.notas || "—", { content: `- ${fmt(g.monto)}`, styles: { halign: "right" } }]),
      ["", { content: "Total gastos", styles: { halign: "right" } }, { content: `- ${fmt(data.totals.totalGastos)}`, styles: { halign: "right" } }],
    );
  }

  // ── Resumen final ──
  sectionTitle("Resumen del período");
  const resumenRows: any[][] = [
    ["Ventas (contado)", { content: fmt(data.totals.totalContado), styles: { halign: "right" } }],
    ["Ventas (crédito)", { content: fmt(data.totals.totalCredito), styles: { halign: "right" } }],
    ["Cobros recibidos", { content: fmt(data.totals.totalCobros), styles: { halign: "right" } }],
    ["Gastos", { content: `- ${fmt(data.totals.totalGastos)}`, styles: { halign: "right" } }],
    ["Canceladas", { content: fmt(data.totals.totalCancelado), styles: { halign: "right" } }],
  ];
  const efectivoEsperado = (data.totals.cobrosPorMetodo["efectivo"] || 0) - data.totals.totalGastos;
  resumenRows.push([
    { content: "Efectivo esperado", styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
    { content: fmt(efectivoEsperado), styles: { halign: "right", fontStyle: "bold", fillColor: [240, 240, 240] } },
  ]);

  autoTable(doc, {
    startY: y,
    body: resumenRows,
    theme: "plain",
    margin: { left: pageW - margin - 280, right: margin },
    styles: { fontSize: 9, cellPadding: 4, textColor: 30 },
    bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    tableWidth: 280,
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(160);
    const footY = doc.internal.pageSize.getHeight() - 24;
    doc.text(
      `Generado por RutApp · ${new Date().toLocaleString("es-MX")}  ·  Página ${i} de ${pageCount}`,
      pageW / 2, footY, { align: "center" },
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
