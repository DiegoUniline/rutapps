// PDF de venta individual estilo Rutapp (mismo formato que el reporte).
// Reusa los helpers básicos para mantener consistencia visual.
import { jsPDF } from "npm:jspdf@2.5.1";
import autoTableModule from "npm:jspdf-autotable@3.8.2";
import type { EmpresaInfo } from "./reportePdf.ts";

const autoTable = ((autoTableModule as any).default || autoTableModule) as (doc: any, opts: any) => void;

export interface VentaPdfData {
  empresa: EmpresaInfo;
  venta: {
    folio: string | null;
    fecha: string | null;
    cliente: string;
    cliente_telefono?: string | null;
    vendedor: string;
    condicion_pago: string | null;
    status: string | null;
    subtotal: number;
    descuento_total: number;
    total: number;
    saldo_pendiente: number;
  };
  lineas: { codigo: string; nombre: string; cantidad: number; precio_unitario: number; descuento_pct: number; total: number }[];
  cobros: { fecha?: string | null; metodo?: string | null; referencia?: string | null; monto: number }[];
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
    let bin = ""; for (let i = 0; i < buf.length; i++) bin += String.fromCharCode(buf[i]);
    const b64 = btoa(bin);
    const type: "PNG" | "JPEG" = ct.includes("jpeg") || ct.includes("jpg") ? "JPEG" : "PNG";
    return { b64: `data:image/${type.toLowerCase()};base64,${b64}`, type };
  } catch { return null; }
}

export async function generarVentaBotPdf(data: VentaPdfData): Promise<Uint8Array> {
  const sym = MONEDA_SYMBOLS[(data.empresa.moneda || "MXN").toUpperCase()] || "$";
  const fmt = (n: number) =>
    `${sym} ${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  const logo = data.empresa.logo_url ? await fetchLogoBase64(data.empresa.logo_url) : null;

  // Header
  let headerLeftX = margin;
  if (logo) {
    try { doc.addImage(logo.b64, logo.type, margin, 32, 40, 40); headerLeftX = margin + 48; } catch { /* */ }
  }
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(26);
  doc.text((data.empresa.razon_social || data.empresa.nombre || "").toUpperCase(), headerLeftX, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
  let hy = 62;
  const ids: string[] = [];
  if (data.empresa.rfc) ids.push(`RFC: ${data.empresa.rfc}`);
  if (data.empresa.email) ids.push(data.empresa.email);
  if (ids.length) { doc.text(ids.join("  ·  "), headerLeftX, hy); hy += 10; }
  const dirLine = [data.empresa.direccion, data.empresa.colonia, data.empresa.ciudad, data.empresa.estado, data.empresa.cp].filter(Boolean).join(", ");
  if (dirLine) { doc.text(dirLine, headerLeftX, hy); hy += 10; }
  if (data.empresa.telefono) { doc.text(`Tel: ${data.empresa.telefono}`, headerLeftX, hy); hy += 10; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(26);
  doc.text("Nota de Venta", pageW - margin, 50, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Folio: ${data.venta.folio || "—"}`, pageW - margin, 64, { align: "right" });
  if (data.venta.fecha) {
    const f = new Date(data.venta.fecha);
    if (!isNaN(f.getTime())) doc.text(`Fecha: ${f.toLocaleString("es-MX")}`, pageW - margin, 76, { align: "right" });
  }
  if (data.venta.status) doc.text(`Estado: ${data.venta.status}`, pageW - margin, 88, { align: "right" });

  doc.setDrawColor(26); doc.setLineWidth(1.2);
  doc.line(margin, 96, pageW - margin, 96);
  let y = 114;

  // Cliente / Vendedor
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(80);
  doc.text("CLIENTE", margin, y);
  doc.text("VENDEDOR", margin + 280, y);
  doc.text("CONDICIÓN", pageW - margin - 80, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(26);
  y += 14;
  doc.text(data.venta.cliente || "—", margin, y);
  doc.text(data.venta.vendedor || "—", margin + 280, y);
  doc.text(data.venta.condicion_pago || "—", pageW - margin - 80, y);
  if (data.venta.cliente_telefono) {
    y += 12;
    doc.setFontSize(8); doc.setTextColor(110);
    doc.text(`Tel: ${data.venta.cliente_telefono}`, margin, y);
  }
  y += 20;

  // Líneas
  autoTable(doc, {
    startY: y,
    head: [["Código", "Producto", "Cant.", "Precio", "Desc.", "Total"]],
    body: data.lineas.map(l => [
      l.codigo || "—", l.nombre,
      { content: String(l.cantidad), styles: { halign: "right" } },
      { content: fmt(l.precio_unitario), styles: { halign: "right" } },
      { content: l.descuento_pct ? `${l.descuento_pct}%` : "—", styles: { halign: "right" } },
      { content: fmt(l.total), styles: { halign: "right" } },
    ]),
    theme: "plain",
    margin: { left: margin, right: margin },
    styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
    headStyles: { fontStyle: "bold", fontSize: 7, textColor: 80, fillColor: [247, 247, 247], lineWidth: { bottom: 1 }, lineColor: [220, 220, 220] },
    bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 12;

  // Totales (derecha)
  const totRows: any[][] = [
    ["Subtotal", { content: fmt(data.venta.subtotal), styles: { halign: "right" } }],
    ["Descuento", { content: `- ${fmt(data.venta.descuento_total)}`, styles: { halign: "right" } }],
    [
      { content: "TOTAL", styles: { fontStyle: "bold", fillColor: [240, 240, 240] } },
      { content: fmt(data.venta.total), styles: { halign: "right", fontStyle: "bold", fillColor: [240, 240, 240] } },
    ],
    ["Saldo pendiente", { content: fmt(data.venta.saldo_pendiente), styles: { halign: "right" } }],
  ];
  autoTable(doc, {
    startY: y, body: totRows, theme: "plain",
    margin: { left: pageW - margin - 240, right: margin },
    styles: { fontSize: 9, cellPadding: 4, textColor: 30 },
    bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    tableWidth: 240,
  });
  y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 16;

  // Cobros aplicados
  if (data.cobros.length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(60);
    doc.text(`COBROS APLICADOS (${data.cobros.length})`, margin, y);
    doc.setDrawColor(220); doc.line(margin, y + 4, pageW - margin, y + 4);
    y += 10;
    autoTable(doc, {
      startY: y,
      head: [["Fecha", "Método", "Referencia", "Monto"]],
      body: data.cobros.map(c => [
        c.fecha ? new Date(c.fecha).toLocaleDateString("es-MX") : "—",
        c.metodo || "—",
        c.referencia || "—",
        { content: fmt(c.monto), styles: { halign: "right" } },
      ]),
      theme: "plain",
      margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: 80, fillColor: [247, 247, 247], lineWidth: { bottom: 1 }, lineColor: [220, 220, 220] },
      bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    });
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(160);
    const footY = doc.internal.pageSize.getHeight() - 24;
    doc.text(`Generado por RutApp · ${new Date().toLocaleString("es-MX")}  ·  Página ${i} de ${pageCount}`, pageW / 2, footY, { align: "center" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
