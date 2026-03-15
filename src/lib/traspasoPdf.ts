/**
 * Professional PDF generator for Warehouse Transfers (Traspasos)
 * Odoo-style layout with origin/destination info and product lines
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_COLORS, MARGIN_L, MARGIN_R, fmtDate, fmtDateTime,
  drawHeader, drawInfoBox, drawSummaryBoxes, drawSectionTitle, drawFooter, drawNotes,
  type EmpresaInfo,
} from './pdfBase';

interface TraspasoPdfParams {
  empresa: EmpresaInfo;
  traspaso: {
    folio: string;
    fecha: string;
    status: string;
    tipo: string;
    notas?: string | null;
    created_at?: string;
  };
  origen: string;
  destino: string;
  responsable?: string;
  lineas: {
    codigo: string;
    nombre: string;
    cantidad: number;
    unidad?: string;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', confirmado: 'Confirmado', en_transito: 'En tránsito',
  recibido: 'Recibido', cancelado: 'Cancelado',
};

const TIPO_LABELS: Record<string, string> = {
  almacen_almacen: 'Almacén → Almacén',
  almacen_ruta: 'Almacén → Ruta',
  ruta_almacen: 'Ruta → Almacén',
};

export function generarTraspasoPdf(params: TraspasoPdfParams): Blob {
  const { empresa, traspaso, origen, destino, responsable, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();

  const color = PDF_COLORS.teal;

  // Header
  let y = drawHeader(doc, empresa, 'TRASPASO', traspaso.folio, color);

  // Info
  y = drawInfoBox(doc, y, `Traspaso ${traspaso.folio}`, [
    [
      `Fecha: ${fmtDate(traspaso.fecha)}`,
      `Estado: ${STATUS_LABELS[traspaso.status] ?? traspaso.status}`,
      `Tipo: ${TIPO_LABELS[traspaso.tipo] ?? traspaso.tipo}`,
    ],
    [
      `Origen: ${origen}`,
      `Destino: ${destino}`,
      responsable ? `Responsable: ${responsable}` : null,
    ],
  ]);

  // Summary
  const totalProductos = lineas.length;
  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  y = drawSummaryBoxes(doc, y, [
    { label: 'PRODUCTOS', value: String(totalProductos) },
    { label: 'TOTAL UNIDADES', value: String(totalUnidades), color, bgColor: [240, 253, 250], borderColor: [153, 246, 228] },
  ]);

  // Origin → Destination visual
  const midX = pageW / 2;
  doc.setFillColor(240, 253, 250);
  doc.setDrawColor(153, 246, 228);
  doc.roundedRect(MARGIN_L, y, pageW - MARGIN_L - MARGIN_R, 14, 1.5, 1.5, 'FD');

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PDF_COLORS.dark);
  doc.text(origen, MARGIN_L + 8, y + 9);
  doc.setTextColor(...color);
  doc.text('→', midX, y + 9, { align: 'center' });
  doc.setTextColor(...PDF_COLORS.dark);
  doc.text(destino, pageW - MARGIN_R - 8, y + 9, { align: 'right' });

  doc.setFontSize(5.5);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.text('ORIGEN', MARGIN_L + 8, y + 4);
  doc.text('DESTINO', pageW - MARGIN_R - 8, y + 4, { align: 'right' });

  y += 20;

  // Products table
  y = drawSectionTitle(doc, y, 'PRODUCTOS TRASLADADOS', color);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_L, right: MARGIN_R },
    head: [['#', 'Código', 'Producto', 'Unidad', 'Cantidad']],
    body: lineas.map((l, i) => [
      String(i + 1),
      l.codigo,
      l.nombre,
      l.unidad || '—',
      String(l.cantidad),
    ]),
    foot: [['', '', '', 'TOTAL', String(totalUnidades)]],
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
    footStyles: { fillColor: [240, 253, 250], textColor: color, fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [240, 253, 250] },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 24 },
      3: { cellWidth: 20 },
      4: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
    },
  });

  // Signature lines
  y = (doc as any).lastAutoTable.finalY + 20;
  if (y > 240) { doc.addPage(); y = 40; }

  const sigW = (pageW - MARGIN_L - MARGIN_R - 20) / 2;
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_L, y, MARGIN_L + sigW, y);
  doc.line(pageW - MARGIN_R - sigW, y, pageW - MARGIN_R, y);

  doc.setFontSize(7);
  doc.setTextColor(...PDF_COLORS.muted);
  doc.setFont('helvetica', 'normal');
  doc.text('Entrega', MARGIN_L + sigW / 2, y + 5, { align: 'center' });
  doc.text('Recibe', pageW - MARGIN_R - sigW / 2, y + 5, { align: 'center' });

  // Notes
  if (traspaso.notas) {
    y += 14;
    drawNotes(doc, y, traspaso.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
