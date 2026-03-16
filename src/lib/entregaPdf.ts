/**
 * Entrega PDF — Professional clean layout
 */
import {
  createDoc, ML, MR, C, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawNotes, drawSignatures, drawFooter,
  type EmpresaInfo,
} from './pdfStyleOdoo';

interface EntregaPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  entrega: {
    folio: string;
    fecha: string;
    status: string;
    notas?: string | null;
    fecha_asignacion?: string | null;
    fecha_carga?: string | null;
    validado_at?: string | null;
  };
  cliente?: string;
  vendedor?: string;
  repartidor?: string;
  almacen?: string;
  pedidoFolio?: string;
  lineas: {
    codigo: string;
    nombre: string;
    unidad?: string;
    cantidad_pedida: number;
    cantidad_entregada: number;
    almacen_origen?: string;
    hecho: boolean;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
  cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
};

export function generarEntregaPdf(params: EntregaPdfParams): Blob {
  const { empresa, logoBase64, entrega, cliente, vendedor, repartidor, almacen, pedidoFolio, lineas } = params;
  const doc = createDoc();

  let y = drawDocHeader(doc, empresa, 'ENTREGA', entrega.folio, logoBase64);

  y = drawInfoGrid(doc, y,
    'Destinatario',
    [
      ['Cliente:', cliente || 'Sin cliente'],
      ...(pedidoFolio ? [['Pedido:', pedidoFolio] as [string, string]] : []),
      ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
      ...(repartidor ? [['Repartidor:', repartidor] as [string, string]] : []),
    ],
    'Información',
    [
      ['Fecha:', fmtDate(entrega.fecha)],
      ['Estado:', STATUS_LABELS[entrega.status] ?? entrega.status],
      ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
      ...(entrega.validado_at ? [['Entregado:', new Date(entrega.validado_at).toLocaleString('es-MX')] as [string, string]] : []),
    ],
  );

  y = drawCleanTable(doc, y,
    ['Código', 'Producto', 'Unidad', 'Almacén', 'Pedida', 'Surtida', 'Estado'],
    lineas.map(l => [
      l.codigo,
      l.nombre,
      l.unidad || '—',
      l.almacen_origen || '—',
      { content: String(l.cantidad_pedida), styles: { halign: 'right' } },
      { content: String(l.cantidad_entregada), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: l.hecho ? '✓ Surtido' : 'Pendiente', styles: { fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 24 },
      2: { cellWidth: 18 },
      3: { cellWidth: 28 },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 18, halign: 'right' },
      6: { cellWidth: 24 },
    },
    (data: any) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = data.cell.raw?.content || data.cell.raw;
        if (typeof val === 'string' && val.includes('✓')) {
          data.cell.styles.textColor = C.success;
        } else {
          data.cell.styles.textColor = C.danger;
        }
      }
    },
  );

  // Summary
  const totalPedida = lineas.reduce((s, l) => s + l.cantidad_pedida, 0);
  const totalEntregada = lineas.reduce((s, l) => s + l.cantidad_entregada, 0);
  const pendientes = lineas.filter(l => !l.hecho).length;

  const pageW = doc.internal.pageSize.getWidth();
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...C.text);
  doc.text(`Pedida: ${totalPedida}  ·  Surtida: ${totalEntregada}  ·  Pendientes: ${pendientes}`, pageW - MR, y - 3, { align: 'right' });
  y += 14;

  y = drawSignatures(doc, y, 'Entrega', 'Recibe');

  if (entrega.notas) {
    y = drawNotes(doc, y, entrega.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
