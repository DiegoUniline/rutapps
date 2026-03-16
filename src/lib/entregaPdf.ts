import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtDate,
  drawHeader, drawInfoSection, drawSectionTitle, drawFooter, drawNotes, checkPageBreak,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

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

export function generarEntregaPdf(params: EntregaPdfParams): Blob {
  const { empresa, logoBase64, entrega, cliente, vendedor, repartidor, almacen, pedidoFolio, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const statusLabels: Record<string, string> = {
    borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
    cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
  };

  let y = drawHeader(doc, empresa, 'ENTREGA', entrega.folio, logoBase64);

  y = drawInfoSection(doc, y, [
    ['Cliente:', cliente || 'Sin cliente'],
    ...(pedidoFolio ? [['Pedido:', pedidoFolio] as [string, string]] : []),
    ...(vendedor ? [['Vendedor:', vendedor] as [string, string]] : []),
    ...(repartidor ? [['Repartidor:', repartidor] as [string, string]] : []),
  ], [
    ['Fecha:', fmtDate(entrega.fecha)],
    ['Estado:', statusLabels[entrega.status] ?? entrega.status],
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
    ...(entrega.validado_at ? [['Entregado:', new Date(entrega.validado_at).toLocaleString('es-MX')] as [string, string]] : []),
  ]);

  y = drawSectionTitle(doc, y, 'Detalle de Productos');

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Código', 'Producto', 'Unidad', 'Almacén', 'Pedida', 'Surtida', 'Estado']],
    body: lineas.map(l => [
      l.codigo, l.nombre, l.unidad || '—', l.almacen_origen || '—',
      String(l.cantidad_pedida), String(l.cantidad_entregada),
      l.hecho ? '✓ Surtido' : 'Pendiente',
    ]),
    headStyles: TABLE_HEAD_STYLE,
    bodyStyles: TABLE_BODY_STYLE,
    alternateRowStyles: TABLE_ALT_STYLE,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      2: { cellWidth: 16 },
      3: { cellWidth: 26 },
      4: { halign: 'right', cellWidth: 16 },
      5: { halign: 'right', cellWidth: 16 },
      6: { cellWidth: 20 },
    },
    didParseCell: (data) => {
      if (data.section === 'body' && data.column.index === 6) {
        const val = data.cell.raw as string;
        if (val.includes('✓')) {
          data.cell.styles.textColor = PDF.success;
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = PDF.danger;
        }
      }
    },
  });

  // Summary line
  y = (doc as any).lastAutoTable.finalY + 4;
  const totalPedida = lineas.reduce((s, l) => s + l.cantidad_pedida, 0);
  const totalEntregada = lineas.reduce((s, l) => s + l.cantidad_entregada, 0);
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...PDF.muted);
  doc.text(`Total pedida: ${totalPedida}  ·  Total surtida: ${totalEntregada}  ·  Líneas pendientes: ${lineas.filter(l => !l.hecho).length}`, ML, y);
  y += 8;

  if (entrega.notas) {
    y = checkPageBreak(doc, y);
    drawNotes(doc, y, entrega.notas);
  }

  drawFooter(doc);
  return doc.output('blob');
}
