// PDF Reportes Generales — estilo idéntico al reporte diario (mismo header, tabla, footer).
import { jsPDF } from "npm:jspdf@2.5.1";
import autoTableModule from "npm:jspdf-autotable@3.8.2";
import type { ReportesGeneralesData } from "./reportes-generales-data.ts";

const autoTable = ((autoTableModule as any).default || autoTableModule) as (doc: any, opts: any) => void;

const SYM: Record<string, string> = { MXN: "$", USD: "US$", EUR: "€", GTQ: "Q", COP: "$", ARS: "$", PEN: "S/", CLP: "$", BRL: "R$" };

type ReportKey = "ventas-cliente" | "ventas-producto" | "utilidad";

const TITULOS: Record<ReportKey, string> = {
  "ventas-cliente": "Reporte: Ventas por Cliente",
  "ventas-producto": "Reporte: Ventas por Producto",
  "utilidad": "Reporte: Utilidad",
};

export function generarReporteGeneralPdf(report: ReportKey, data: ReportesGeneralesData): Uint8Array {
  const sym = SYM[(data.empresa?.moneda || "MXN").toUpperCase()] || "$";
  const fmt = (n: number) => `${sym} ${Number(n || 0).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const fmtN = (n: number) => Number(n || 0).toLocaleString("es-MX");

  const doc = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 36;

  // Header
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(20);
  doc.text(data.empresa?.razon_social || data.empresa?.nombre || "", margin, 50);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(110);
  let hy = 64;
  if (data.empresa?.rfc) { doc.text(data.empresa.rfc, margin, hy); hy += 10; }
  const dirLine = [data.empresa?.direccion, data.empresa?.colonia, data.empresa?.ciudad, data.empresa?.estado, data.empresa?.cp].filter(Boolean).join(", ");
  if (dirLine) { doc.text(dirLine, margin, hy); hy += 10; }
  if (data.empresa?.telefono) { doc.text(`Tel: ${data.empresa.telefono}`, margin, hy); hy += 10; }

  doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(20);
  doc.text(TITULOS[report], pageW - margin, 50, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text(`Del ${data.desde} al ${data.hasta}`, pageW - margin, 64, { align: "right" });

  doc.setDrawColor(220); doc.setLineWidth(1); doc.line(margin, 92, pageW - margin, 92);
  let y = 108;

  const sectionTitle = (title: string) => {
    if (y > 720) { doc.addPage(); y = 50; }
    doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(60);
    doc.text(title.toUpperCase(), margin, y);
    doc.setDrawColor(220); doc.line(margin, y + 4, pageW - margin, y + 4); y += 12;
  };
  const drawTable = (head: string[], body: any[][], foot?: any[]) => {
    autoTable(doc, {
      startY: y, head: [head], body, foot: foot ? [foot] : undefined,
      theme: "plain", margin: { left: margin, right: margin },
      styles: { fontSize: 8, cellPadding: 4, textColor: 30 },
      headStyles: { fontStyle: "bold", fontSize: 7, textColor: 80, fillColor: [247, 247, 247], lineWidth: { bottom: 1 }, lineColor: [220, 220, 220] },
      footStyles: { fontStyle: "bold", fillColor: [250, 250, 250], lineWidth: { top: 1 }, lineColor: [220, 220, 220] },
      bodyStyles: { lineWidth: { bottom: 0.5 }, lineColor: [240, 240, 240] },
    });
    y = ((doc as any).lastAutoTable?.finalY ?? y + 20) + 12;
  };

  if (report === "ventas-cliente") {
    const items = data.ventasPorCliente;
    const totVent = items.reduce((s, c) => s + c.total, 0);
    const totUtil = items.reduce((s, c) => s + (c.utilidad || 0), 0);
    const totPend = items.reduce((s, c) => s + c.pendiente, 0);
    sectionTitle(`Clientes (${items.length})`);
    drawTable(
      ["#", "Cliente", "Ventas", "Total", "Utilidad", "Margen", "Pendiente"],
      items.map((c, i) => [
        i + 1, c.nombre, { content: String(c.ventas), styles: { halign: "right" } },
        { content: fmt(c.total), styles: { halign: "right" } },
        { content: fmt(c.utilidad || 0), styles: { halign: "right" } },
        { content: `${c.total > 0 ? (((c.utilidad || 0) / c.total) * 100).toFixed(1) : "0.0"}%`, styles: { halign: "right" } },
        { content: fmt(c.pendiente), styles: { halign: "right" } },
      ]),
      ["", "Total", { content: String(items.reduce((s, c) => s + c.ventas, 0)), styles: { halign: "right" } },
        { content: fmt(totVent), styles: { halign: "right" } },
        { content: fmt(totUtil), styles: { halign: "right" } },
        { content: `${totVent > 0 ? ((totUtil / totVent) * 100).toFixed(1) : "0.0"}%`, styles: { halign: "right" } },
        { content: fmt(totPend), styles: { halign: "right" } }],
    );
  } else if (report === "ventas-producto") {
    const items = data.ventasPorProducto;
    const totUds = items.reduce((s, p) => s + p.cantidad, 0);
    const totGen = items.reduce((s, p) => s + p.total, 0);
    const totUtil = items.reduce((s, p) => s + (p.utilidad || 0), 0);
    sectionTitle(`Productos (${items.length})`);
    drawTable(
      ["#", "Código", "Producto", "Uds", "Total", "Utilidad", "Margen"],
      items.map((p, i) => [
        i + 1, p.codigo, p.nombre,
        { content: fmtN(p.cantidad), styles: { halign: "right" } },
        { content: fmt(p.total), styles: { halign: "right" } },
        { content: fmt(p.utilidad || 0), styles: { halign: "right" } },
        { content: `${p.total > 0 ? (((p.utilidad || 0) / p.total) * 100).toFixed(1) : "0.0"}%`, styles: { halign: "right" } },
      ]),
      ["", "", "Total",
        { content: fmtN(totUds), styles: { halign: "right" } },
        { content: fmt(totGen), styles: { halign: "right" } },
        { content: fmt(totUtil), styles: { halign: "right" } },
        { content: `${totGen > 0 ? ((totUtil / totGen) * 100).toFixed(1) : "0.0"}%`, styles: { halign: "right" } }],
    );
  } else if (report === "utilidad") {
    const { totalVentas, costoTotal, utilidadBruta, totalGastos, utilidadNeta, gastosDesglose } = data;
    const mb = totalVentas > 0 ? Math.round((utilidadBruta / totalVentas) * 100) : 0;
    const mn = totalVentas > 0 ? Math.round((utilidadNeta / totalVentas) * 100) : 0;

    sectionTitle("Estado de resultados");
    drawTable(
      ["Concepto", "Monto"],
      [
        ["Ventas totales", { content: fmt(totalVentas), styles: { halign: "right" } }],
        ["(-) Costo de ventas", { content: `- ${fmt(costoTotal)}`, styles: { halign: "right" } }],
        [{ content: "= Utilidad bruta", styles: { fontStyle: "bold" } }, { content: `${fmt(utilidadBruta)}  (${mb}%)`, styles: { halign: "right", fontStyle: "bold" } }],
        ["(-) Gastos operativos", { content: `- ${fmt(totalGastos)}`, styles: { halign: "right" } }],
        [{ content: "= Utilidad neta", styles: { fontStyle: "bold", fillColor: [240, 240, 240] } }, { content: `${fmt(utilidadNeta)}  (${mn}%)`, styles: { halign: "right", fontStyle: "bold", fillColor: [240, 240, 240] } }],
      ],
    );

    if (gastosDesglose.length > 0) {
      sectionTitle("Desglose de gastos");
      drawTable(
        ["Concepto", "Monto"],
        gastosDesglose.map((g) => [g.concepto, { content: fmt(g.monto), styles: { halign: "right" } }]),
        ["Total gastos", { content: fmt(totalGastos), styles: { halign: "right" } }],
      );
    }
  }

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(160);
    const footY = doc.internal.pageSize.getHeight() - 24;
    doc.text(`Generado por Rutapp · ${new Date().toLocaleString("es-MX")}  ·  Página ${i} de ${pageCount}`, pageW / 2, footY, { align: "center" });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
