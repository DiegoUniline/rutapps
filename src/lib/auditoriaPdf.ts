/**
 * Professional PDF generator for Inventory Audits (Auditorías)
 * Shows expected vs real quantities with faltantes/excedentes summary
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_COLORS, MARGIN_L, MARGIN_R, fmtDate, fmtDateTime,
  drawHeader, drawInfoBox, drawSummaryBoxes, drawSectionTitle, drawFooter, drawNotes,
  type EmpresaInfo,
} from './pdfBase';

interface AuditoriaPdfParams {
  empresa: EmpresaInfo;
  auditoria: {
    nombre: string;
    fecha: string;
    status: string;
    notas?: string | null;
    notas_supervisor?: string | null;
    fecha_aprobacion?: string | null;
  };
  almacen?: string;
  responsable?: string;
  aprobador?: string;
  lineas: {
    codigo: string;
    nombre: string;
    cantidad_esperada: number;
    cantidad_real: number | null;
    diferencia: number;
    ajustado: boolean;
    notas?: string | null;
  }[];
}

const STATUS_LABELS: Record<string, string> = {
  pendiente: 'Pendiente', en_conteo: 'En conteo', completada: 'Completada',
  aprobada: 'Aprobada', cancelada: 'Cancelada',
};

export function generarAuditoriaPdf(params: AuditoriaPdfParams): Blob {
  const { empresa, auditoria, almacen, responsable, aprobador, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const color = PDF_COLORS.indigo;

  // Header
  let y = drawHeader(doc, empresa, 'AUDITORÍA', auditoria.nombre, color);

  // Info box
  y = drawInfoBox(doc, y, `Auditoría: ${auditoria.nombre}`, [
    [
      `Fecha: ${fmtDate(auditoria.fecha)}`,
      `Estado: ${STATUS_LABELS[auditoria.status] ?? auditoria.status}`,
      almacen ? `Almacén: ${almacen}` : null,
    ],
    [
      responsable ? `Responsable: ${responsable}` : null,
      aprobador ? `Aprobado por: ${aprobador}` : null,
      auditoria.fecha_aprobacion ? `Fecha aprobación: ${fmtDateTime(auditoria.fecha_aprobacion)}` : null,
    ],
  ]);

  // Summary
  const contados = lineas.filter(l => l.cantidad_real !== null);
  const faltantes = lineas.filter(l => l.diferencia < 0);
  const excedentes = lineas.filter(l => l.diferencia > 0);
  const ajustados = lineas.filter(l => l.ajustado);

  y = drawSummaryBoxes(doc, y, [
    { label: 'PRODUCTOS', value: String(lineas.length) },
    { label: 'CONTADOS', value: String(contados.length), color: PDF_COLORS.primary, bgColor: [239, 246, 255], borderColor: [191, 219, 254] },
    { label: 'FALTANTES', value: String(faltantes.length), color: PDF_COLORS.danger, bgColor: [254, 242, 242], borderColor: [254, 202, 202] },
    { label: 'EXCEDENTES', value: String(excedentes.length), color: PDF_COLORS.success, bgColor: [240, 253, 244], borderColor: [187, 247, 208] },
  ]);

  // Detail table
  y = drawSectionTitle(doc, y, 'DETALLE DE CONTEO', color);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_L, right: MARGIN_R },
    head: [['Código', 'Producto', 'Esperada', 'Real', 'Diferencia', 'Ajustado', 'Notas']],
    body: lineas.map(l => [
      l.codigo,
      l.nombre,
      String(l.cantidad_esperada),
      l.cantidad_real !== null ? String(l.cantidad_real) : '—',
      l.diferencia !== 0 ? (l.diferencia > 0 ? `+${l.diferencia}` : String(l.diferencia)) : '0',
      l.ajustado ? '✓' : '—',
      l.notas || '',
    ]),
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
    alternateRowStyles: { fillColor: [245, 243, 255] },
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 22 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 18 },
      4: { halign: 'right', cellWidth: 20 },
      5: { halign: 'center', cellWidth: 16 },
      6: { cellWidth: 30 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        const raw = data.cell.raw as string;
        if (raw.startsWith('-')) {
          data.cell.styles.textColor = PDF_COLORS.danger;
          data.cell.styles.fontStyle = 'bold';
        } else if (raw.startsWith('+')) {
          data.cell.styles.textColor = PDF_COLORS.success;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.column.index === 5 && data.cell.raw === '✓') {
        data.cell.styles.textColor = PDF_COLORS.success;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Faltantes summary
  if (faltantes.length > 0) {
    y = y > 220 ? (doc.addPage(), 14) : y;
    y = drawSectionTitle(doc, y, `FALTANTES (${faltantes.length})`, PDF_COLORS.danger);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN_L, right: MARGIN_R },
      head: [['Código', 'Producto', 'Esperada', 'Real', 'Faltante']],
      body: faltantes.map(l => [
        l.codigo, l.nombre,
        String(l.cantidad_esperada),
        l.cantidad_real !== null ? String(l.cantidad_real) : '—',
        String(Math.abs(l.diferencia)),
      ]),
      headStyles: { fillColor: PDF_COLORS.danger, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
      alternateRowStyles: { fillColor: [254, 242, 242] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 18, textColor: PDF_COLORS.danger },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Excedentes summary
  if (excedentes.length > 0) {
    y = y > 220 ? (doc.addPage(), 14) : y;
    y = drawSectionTitle(doc, y, `EXCEDENTES (${excedentes.length})`, PDF_COLORS.success);

    autoTable(doc, {
      startY: y,
      margin: { left: MARGIN_L, right: MARGIN_R },
      head: [['Código', 'Producto', 'Esperada', 'Real', 'Excedente']],
      body: excedentes.map(l => [
        l.codigo, l.nombre,
        String(l.cantidad_esperada),
        l.cantidad_real !== null ? String(l.cantidad_real) : '—',
        `+${l.diferencia}`,
      ]),
      headStyles: { fillColor: PDF_COLORS.success, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
      bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
      alternateRowStyles: { fillColor: [240, 253, 244] },
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 18, textColor: PDF_COLORS.success },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Notes
  if (auditoria.notas) drawNotes(doc, y, auditoria.notas);
  if (auditoria.notas_supervisor) {
    y = (doc as any).lastAutoTable?.finalY ?? y;
    y += auditoria.notas ? 14 : 0;
    if (y > 240) { doc.addPage(); y = 14; }
    doc.setTextColor(...PDF_COLORS.muted);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('NOTAS DEL SUPERVISOR:', MARGIN_L, y);
    doc.setFont('helvetica', 'normal');
    const split = doc.splitTextToSize(auditoria.notas_supervisor, doc.internal.pageSize.getWidth() - MARGIN_L - MARGIN_R);
    doc.text(split, MARGIN_L, y + 5);
  }

  drawFooter(doc);
  return doc.output('blob');
}
