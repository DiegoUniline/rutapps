/**
 * Solicitud de traspaso PDF — imprimible antes de mover inventario.
 */
import {
  createDoc, MR, C, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawNotes, drawSignatures, drawFooter,
  type EmpresaInfo,
} from './pdfStyleOdoo';

interface SolicitudTraspasoPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  solicitud: {
    folio: string;
    fecha: string;
    status: string;
    observaciones?: string | null;
  };
  origen: string;
  destino: string;
  solicitante?: string;
  responsable?: string;
  lineas: Array<{
    codigo: string;
    nombre: string;
    cantidad_solicitada: number;
    cantidad_aprobada: number;
    agregada_por_admin?: boolean;
  }>;
}

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador',
  solicitada: 'Pendiente de aprobación',
  aprobada: 'Aprobada / pendiente de surtir',
  parcialmente_surtida: 'Parcialmente surtida',
  surtida: 'Surtida',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
  cerrada: 'Cerrada',
};

const fmtQty = (value: number) => new Intl.NumberFormat('es-MX', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
}).format(Number(value) || 0);

export async function generarSolicitudTraspasoPdf(params: SolicitudTraspasoPdfParams): Promise<Blob> {
  const { empresa, logoBase64, solicitud, origen, destino, solicitante, responsable, lineas } = params;
  const doc = await createDoc();

  let y = drawDocHeader(doc, empresa, 'SOLICITUD DE TRASPASO', solicitud.folio, logoBase64);

  y = drawInfoGrid(doc, y,
    'Movimiento',
    [
      ['Origen:', origen],
      ['Destino:', destino],
      ...(solicitante ? [['Solicitante:', solicitante] as [string, string]] : []),
    ],
    'Información',
    [
      ['Fecha:', fmtDate(solicitud.fecha)],
      ['Estado:', STATUS_LABELS[solicitud.status] ?? solicitud.status],
      ...(responsable ? [['Responsable:', responsable] as [string, string]] : []),
    ],
  );

  y = await drawCleanTable(doc, y,
    ['#', 'Código', 'Producto', 'Origen línea', 'Solicitado', 'Aprobado'],
    lineas.map((linea, index) => [
      { content: String(index + 1), styles: { halign: 'center' } },
      linea.codigo,
      linea.nombre,
      linea.agregada_por_admin ? 'Administración' : 'Solicitud',
      { content: fmtQty(linea.cantidad_solicitada), styles: { halign: 'right' } },
      { content: fmtQty(linea.cantidad_aprobada), styles: { halign: 'right', fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 25 },
      3: { cellWidth: 27 },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 22, halign: 'right' },
    },
  );

  const totalSolicitado = lineas.reduce((sum, linea) => sum + (Number(linea.cantidad_solicitada) || 0), 0);
  const totalAprobado = lineas.reduce((sum, linea) => sum + (Number(linea.cantidad_aprobada) || 0), 0);
  const pageWidth = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(
    `Productos: ${lineas.length} · Solicitado: ${fmtQty(totalSolicitado)} · Aprobado: ${fmtQty(totalAprobado)}`,
    pageWidth - MR,
    y - 3,
    { align: 'right' },
  );
  y += 14;

  y = drawSignatures(doc, y, { title: 'Autoriza' }, { title: 'Surte' });
  if (solicitud.observaciones) y = drawNotes(doc, y, solicitud.observaciones);

  drawFooter(doc, empresa);
  return doc.output('blob');
}

