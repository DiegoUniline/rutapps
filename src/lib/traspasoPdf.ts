/**
 * Traspaso PDF — Professional clean layout
 */
import {
  createDoc, ML, MR, C, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawNotes, drawSignatures, drawFooter,
  type EmpresaInfo,
} from './pdfStyleOdoo';

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
  const doc = createDoc();

  let y = drawDocHeader(doc, empresa, 'TRASPASO', traspaso.folio, logoBase64);

  y = drawInfoGrid(doc, y,
    'Movimiento',
    [
      ['Tipo:', TIPO_LABELS[traspaso.tipo] ?? traspaso.tipo],
      ['Origen:', origen],
      ['Destino:', destino],
    ],
    'Información',
    [
      ['Fecha:', fmtDate(traspaso.fecha)],
      ['Estado:', STATUS_LABELS[traspaso.status] ?? traspaso.status],
      ...(responsable ? [['Responsable:', responsable] as [string, string]] : []),
    ],
  );

  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);

  y = drawCleanTable(doc, y,
    ['#', 'Código', 'Producto', 'Unidad', 'Cantidad'],
    lineas.map((l, i) => [
      { content: String(i + 1), styles: { halign: 'center' } },
      l.codigo,
      l.nombre,
      l.unidad || '—',
      { content: String(l.cantidad), styles: { halign: 'right', fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 12, halign: 'center' },
      1: { cellWidth: 26 },
      3: { cellWidth: 22 },
      4: { cellWidth: 24, halign: 'right' },
    },
  );

  // Total summary
  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(`Total: ${lineas.length} productos · ${totalUnidades} unidades`, pageW - MR, y - 3, { align: 'right' });
  y += 14;

  // Signatures
  y = drawSignatures(doc, y, { title: 'Entrega' }, { title: 'Recibe' });

  if (traspaso.notas) {
    y = drawNotes(doc, y, traspaso.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
