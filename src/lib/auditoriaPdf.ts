import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtDate, fmtDateTime,
  drawHeader, drawInfoSection, drawSectionTitle, drawFooter, drawNotes, checkPageBreak,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

interface AuditoriaPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
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
  const { empresa, logoBase64, auditoria, almacen, responsable, aprobador, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawHeader(doc, empresa, 'AUDITORÍA', auditoria.nombre, logoBase64);

  const faltantes = lineas.filter(l => l.diferencia < 0).length;
  const excedentes = lineas.filter(l => l.diferencia > 0).length;
  const contados = lineas.filter(l => l.cantidad_real !== null).length;

  y = drawInfoSection(doc, y, [
    ['Auditoría:', auditoria.nombre],
    ['Fecha:', fmtDate(auditoria.fecha)],
    ['Estado:', STATUS_LABELS[auditoria.status] ?? auditoria.status],
    ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
  ], [
    ['Productos:', String(lineas.length)],
    ['Contados:', String(contados)],
    ['Faltantes:', String(faltantes)],
    ['Excedentes:', String(excedentes)],
    ...(responsable ? [['Responsable:', responsable] as [string, string]] : []),
    ...(aprobador ? [['Aprobó:', aprobador] as [string, string]] : []),
  ]);

  y = drawSectionTitle(doc, y, 'Detalle de Conteo');

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Código', 'Producto', 'Esperada', 'Real', 'Diferencia', 'Ajustado', 'Notas']],
    body: lineas.map(l => [
      l.codigo, l.nombre,
      String(l.cantidad_esperada),
      l.cantidad_real !== null ? String(l.cantidad_real) : '—',
      l.diferencia !== 0 ? (l.diferencia > 0 ? `+${l.diferencia}` : String(l.diferencia)) : '0',
      l.ajustado ? '✓' : '—',
      l.notas || '',
    ]),
    headStyles: TABLE_HEAD_STYLE,
    bodyStyles: TABLE_BODY_STYLE,
    alternateRowStyles: TABLE_ALT_STYLE,
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
          data.cell.styles.textColor = PDF.danger;
          data.cell.styles.fontStyle = 'bold';
        } else if (raw.startsWith('+')) {
          data.cell.styles.textColor = PDF.success;
          data.cell.styles.fontStyle = 'bold';
        }
      }
      if (data.section === 'body' && data.column.index === 5 && data.cell.raw === '✓') {
        data.cell.styles.textColor = PDF.success;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  // Faltantes summary
  if (faltantes > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, `Faltantes (${faltantes})`);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Código', 'Producto', 'Esperada', 'Real', 'Faltante']],
      body: lineas.filter(l => l.diferencia < 0).map(l => [
        l.codigo, l.nombre,
        String(l.cantidad_esperada),
        l.cantidad_real !== null ? String(l.cantidad_real) : '—',
        String(Math.abs(l.diferencia)),
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: TABLE_BODY_STYLE,
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 18, textColor: PDF.danger },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  // Excedentes summary
  if (excedentes > 0) {
    y = checkPageBreak(doc, y);
    y = drawSectionTitle(doc, y, `Excedentes (${excedentes})`);

    autoTable(doc, {
      startY: y,
      margin: { left: ML, right: MR },
      head: [['Código', 'Producto', 'Esperada', 'Real', 'Excedente']],
      body: lineas.filter(l => l.diferencia > 0).map(l => [
        l.codigo, l.nombre,
        String(l.cantidad_esperada),
        l.cantidad_real !== null ? String(l.cantidad_real) : '—',
        `+${l.diferencia}`,
      ]),
      headStyles: TABLE_HEAD_STYLE,
      bodyStyles: TABLE_BODY_STYLE,
      alternateRowStyles: TABLE_ALT_STYLE,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 22 },
        2: { halign: 'right', cellWidth: 18 },
        3: { halign: 'right', cellWidth: 18 },
        4: { halign: 'right', fontStyle: 'bold', cellWidth: 18, textColor: PDF.success },
      },
    });

    y = (doc as any).lastAutoTable.finalY + 6;
  }

  if (auditoria.notas) drawNotes(doc, y, auditoria.notas);
  if (auditoria.notas_supervisor) {
    y = (doc as any).lastAutoTable?.finalY ?? y;
    y += auditoria.notas ? 14 : 0;
    y = checkPageBreak(doc, y);
    drawNotes(doc, y, auditoria.notas_supervisor, 'Notas del supervisor');
  }

  drawFooter(doc);
  return doc.output('blob');
}
