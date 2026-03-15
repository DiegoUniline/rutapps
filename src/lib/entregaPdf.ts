import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  try { return new Date(d + 'T12:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }); }
  catch { return d; }
};

interface EntregaPdfParams {
  empresa: {
    nombre: string;
    razon_social?: string | null;
    rfc?: string | null;
    direccion?: string | null;
    telefono?: string | null;
  };
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
  const { empresa, entrega, cliente, vendedor, repartidor, almacen, pedidoFolio, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginL = 14;
  const marginR = 14;
  const contentW = pageW - marginL - marginR;
  let y = 14;

  const primaryColor: [number, number, number] = [79, 70, 229]; // indigo
  const darkColor: [number, number, number] = [15, 23, 42];
  const mutedColor: [number, number, number] = [100, 116, 139];
  const successColor: [number, number, number] = [22, 163, 74];

  const statusLabels: Record<string, string> = {
    borrador: 'Borrador', surtido: 'Surtido', asignado: 'Asignado',
    cargado: 'Cargado', en_ruta: 'En ruta', hecho: 'Entregado', cancelado: 'Cancelado',
  };

  // ── HEADER BAR ──
  doc.setFillColor(...primaryColor);
  doc.rect(0, 0, pageW, 28, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(empresa.nombre.toUpperCase(), marginL, 12);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  const companyDetails = [
    empresa.razon_social,
    empresa.rfc ? `RFC: ${empresa.rfc}` : null,
    empresa.direccion,
    empresa.telefono ? `Tel: ${empresa.telefono}` : null,
  ].filter(Boolean).join('  ·  ');
  if (companyDetails) doc.text(companyDetails, marginL, 18);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('ENTREGA', pageW - marginR, 12, { align: 'right' });
  doc.setFontSize(9);
  doc.text(entrega.folio, pageW - marginR, 18, { align: 'right' });

  y = 35;

  // ── INFO BOX ──
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginL, y, contentW, 28, 2, 2, 'FD');

  doc.setTextColor(...darkColor);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(cliente || 'Sin cliente', marginL + 4, y + 6);

  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...mutedColor);

  const row1 = [
    `Fecha: ${fmtDate(entrega.fecha)}`,
    `Estado: ${statusLabels[entrega.status] ?? entrega.status}`,
    pedidoFolio ? `Pedido: ${pedidoFolio}` : null,
  ].filter(Boolean).join('  ·  ');
  doc.text(row1, marginL + 4, y + 12);

  const row2 = [
    vendedor ? `Vendedor: ${vendedor}` : null,
    repartidor ? `Repartidor: ${repartidor}` : null,
    almacen ? `Almacén: ${almacen}` : null,
  ].filter(Boolean).join('  ·  ');
  if (row2) doc.text(row2, marginL + 4, y + 18);

  const row3 = [
    entrega.fecha_asignacion ? `Asignado: ${new Date(entrega.fecha_asignacion).toLocaleString('es-MX')}` : null,
    entrega.fecha_carga ? `Cargado: ${new Date(entrega.fecha_carga).toLocaleString('es-MX')}` : null,
    entrega.validado_at ? `Entregado: ${new Date(entrega.validado_at).toLocaleString('es-MX')}` : null,
  ].filter(Boolean).join('  ·  ');
  if (row3) doc.text(row3, marginL + 4, y + 24);

  y += 34;

  // ── STATUS SUMMARY BOXES ──
  const totalPedida = lineas.reduce((s, l) => s + l.cantidad_pedida, 0);
  const totalEntregada = lineas.reduce((s, l) => s + l.cantidad_entregada, 0);
  const totalPendiente = lineas.filter(l => !l.hecho).length;
  const boxW = (contentW - 8) / 3;

  // Box 1 - Total pedida
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.roundedRect(marginL, y, boxW, 18, 1.5, 1.5, 'FD');
  doc.setTextColor(...mutedColor);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('CANT. PEDIDA', marginL + boxW / 2, y + 5.5, { align: 'center' });
  doc.setTextColor(...darkColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(String(totalPedida), marginL + boxW / 2, y + 13, { align: 'center' });

  // Box 2 - Total surtida
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(187, 247, 208);
  doc.roundedRect(marginL + boxW + 4, y, boxW, 18, 1.5, 1.5, 'FD');
  doc.setTextColor(...mutedColor);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('CANT. SURTIDA', marginL + boxW + 4 + boxW / 2, y + 5.5, { align: 'center' });
  doc.setTextColor(...successColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(String(totalEntregada), marginL + boxW + 4 + boxW / 2, y + 13, { align: 'center' });

  // Box 3 - Pendientes
  const pendColor: [number, number, number] = totalPendiente > 0 ? [220, 38, 38] : successColor;
  doc.setFillColor(totalPendiente > 0 ? 254 : 240, totalPendiente > 0 ? 242 : 253, totalPendiente > 0 ? 242 : 244);
  doc.setDrawColor(totalPendiente > 0 ? 254 : 187, totalPendiente > 0 ? 202 : 247, totalPendiente > 0 ? 202 : 208);
  doc.roundedRect(marginL + (boxW + 4) * 2, y, boxW, 18, 1.5, 1.5, 'FD');
  doc.setTextColor(...mutedColor);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.text('LÍNEAS PEND.', marginL + (boxW + 4) * 2 + boxW / 2, y + 5.5, { align: 'center' });
  doc.setTextColor(...pendColor);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(String(totalPendiente), marginL + (boxW + 4) * 2 + boxW / 2, y + 13, { align: 'center' });

  y += 24;

  // ── LINES TABLE ──
  doc.setTextColor(...primaryColor);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('DETALLE DE PRODUCTOS', marginL, y + 1);
  y += 4;

  autoTable(doc, {
    startY: y,
    margin: { left: marginL, right: marginR },
    head: [['Código', 'Producto', 'Unidad', 'Almacén', 'Pedida', 'Surtida', 'Estado']],
    body: lineas.map(l => [
      l.codigo,
      l.nombre,
      l.unidad || '—',
      l.almacen_origen || '—',
      String(l.cantidad_pedida),
      String(l.cantidad_entregada),
      l.hecho ? '✓ Surtido' : 'Pendiente',
    ]),
    headStyles: {
      fillColor: primaryColor,
      textColor: [255, 255, 255],
      fontSize: 7,
      fontStyle: 'bold',
      cellPadding: 2,
    },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: darkColor },
    alternateRowStyles: { fillColor: [245, 243, 255] },
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
          data.cell.styles.textColor = successColor;
          data.cell.styles.fontStyle = 'bold';
        } else {
          data.cell.styles.textColor = [220, 38, 38];
        }
      }
    },
  });

  // ── NOTAS ──
  if (entrega.notas) {
    y = (doc as any).lastAutoTable.finalY + 8;
    if (y > 240) { doc.addPage(); y = 14; }
    doc.setTextColor(...mutedColor);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTAS:', marginL, y);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(entrega.notas, contentW);
    doc.text(splitNotes, marginL, y + 5);
  }

  // ── FOOTER ──
  const pageH = doc.internal.pageSize.getHeight();
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setDrawColor(226, 232, 240);
    doc.line(marginL, pageH - 14, pageW - marginR, pageH - 14);
    doc.setTextColor(...mutedColor);
    doc.setFontSize(6.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Elaborado por Uniline — Innovación en la nube', marginL, pageH - 9);
    doc.text(`Página ${i} de ${totalPages}`, pageW - marginR, pageH - 9, { align: 'right' });
  }

  return doc.output('blob');
}
