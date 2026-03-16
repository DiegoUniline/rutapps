import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtDate,
  drawHeader, drawInfoSection, drawSectionTitle, drawFooter, drawNotes, checkPageBreak,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

interface TraspasoPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
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
  const { empresa, logoBase64, traspaso, origen, destino, responsable, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawHeader(doc, empresa, 'TRASPASO', traspaso.folio, logoBase64);

  y = drawInfoSection(doc, y, [
    ['Tipo:', TIPO_LABELS[traspaso.tipo] ?? traspaso.tipo],
    ['Origen:', origen],
    ['Destino:', destino],
  ], [
    ['Fecha:', fmtDate(traspaso.fecha)],
    ['Estado:', STATUS_LABELS[traspaso.status] ?? traspaso.status],
    ...(responsable ? [['Responsable:', responsable] as [string, string]] : []),
  ]);

  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  y = drawSectionTitle(doc, y, `Productos trasladados (${lineas.length} productos, ${totalUnidades} unidades)`);

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['#', 'Código', 'Producto', 'Unidad', 'Cantidad']],
    body: lineas.map((l, i) => [
      String(i + 1), l.codigo, l.nombre, l.unidad || '—', String(l.cantidad),
    ]),
    foot: [['', '', '', 'TOTAL', String(totalUnidades)]],
    headStyles: TABLE_HEAD_STYLE,
    bodyStyles: TABLE_BODY_STYLE,
    footStyles: { ...TABLE_HEAD_STYLE, fontStyle: 'bold' },
    alternateRowStyles: TABLE_ALT_STYLE,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { fontStyle: 'bold', cellWidth: 24 },
      3: { cellWidth: 20 },
      4: { halign: 'right', cellWidth: 20, fontStyle: 'bold' },
    },
  });

  // Signature lines
  y = (doc as any).lastAutoTable.finalY + 20;
  y = checkPageBreak(doc, y, 30);

  const pageW = doc.internal.pageSize.getWidth();
  const sigW = (pageW - ML - MR - 20) / 2;
  doc.setDrawColor(...PDF.border);
  doc.setLineWidth(0.3);
  doc.line(ML, y, ML + sigW, y);
  doc.line(pageW - MR - sigW, y, pageW - MR, y);

  doc.setFontSize(7);
  doc.setTextColor(...PDF.muted);
  doc.setFont('helvetica', 'normal');
  doc.text('Entrega', ML + sigW / 2, y + 5, { align: 'center' });
  doc.text('Recibe', pageW - MR - sigW / 2, y + 5, { align: 'center' });

  if (traspaso.notas) {
    y += 14;
    drawNotes(doc, y, traspaso.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
