/**
 * Auditoría PDF — Professional clean layout
 */
import {
  createDoc, ML, C, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawNotes, drawFooter, checkPageBreak,
  type EmpresaInfo,
} from './pdfStyleOdoo';

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
  const doc = createDoc();

  const faltantes = lineas.filter(l => l.diferencia < 0).length;
  const excedentes = lineas.filter(l => l.diferencia > 0).length;
  const contados = lineas.filter(l => l.cantidad_real !== null).length;

  let y = drawDocHeader(doc, empresa, 'AUDITORÍA', auditoria.nombre, logoBase64);

  y = drawInfoGrid(doc, y,
    'Auditoría',
    [
      ['Nombre:', auditoria.nombre],
      ['Fecha:', fmtDate(auditoria.fecha)],
      ['Estado:', STATUS_LABELS[auditoria.status] ?? auditoria.status],
      ...(almacen ? [['Almacén:', almacen] as [string, string]] : []),
    ],
    'Resumen',
    [
      ['Productos:', String(lineas.length)],
      ['Contados:', String(contados)],
      ['Faltantes:', String(faltantes)],
      ['Excedentes:', String(excedentes)],
      ...(responsable ? [['Responsable:', responsable] as [string, string]] : []),
      ...(aprobador ? [['Aprobó:', aprobador] as [string, string]] : []),
    ],
  );

  // Main table
  y = drawCleanTable(doc, y,
    ['Código', 'Producto', 'Esperada', 'Real', 'Diferencia', 'Ajust.', 'Notas'],
    lineas.map(l => [
      l.codigo,
      l.nombre,
      { content: String(l.cantidad_esperada), styles: { halign: 'right' } },
      { content: l.cantidad_real !== null ? String(l.cantidad_real) : '—', styles: { halign: 'right' } },
      { content: l.diferencia !== 0 ? (l.diferencia > 0 ? `+${l.diferencia}` : String(l.diferencia)) : '0', styles: { halign: 'right', fontStyle: 'bold' } },
      { content: l.ajustado ? '✓' : '—', styles: { halign: 'center' } },
      l.notas || '',
    ]),
    {
      0: { cellWidth: 24 },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
      5: { cellWidth: 16, halign: 'center' },
      6: { cellWidth: 32 },
    },
    (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        const raw = data.cell.raw?.content || data.cell.raw;
        if (typeof raw === 'string') {
          if (raw.startsWith('-')) data.cell.styles.textColor = C.danger;
          else if (raw.startsWith('+')) data.cell.styles.textColor = C.success;
        }
      }
      if (data.section === 'body' && data.column.index === 5) {
        const raw = data.cell.raw?.content || data.cell.raw;
        if (raw === '✓') {
          data.cell.styles.textColor = C.success;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  );

  // Faltantes detail
  if (faltantes > 0) {
    y = checkPageBreak(doc, y);
    y = drawCleanTable(doc, y,
      ['Código', 'Producto', 'Esperada', 'Real', 'Faltante'],
      lineas.filter(l => l.diferencia < 0).map(l => [
        l.codigo,
        l.nombre,
        { content: String(l.cantidad_esperada), styles: { halign: 'right' } },
        { content: l.cantidad_real !== null ? String(l.cantidad_real) : '—', styles: { halign: 'right' } },
        { content: String(Math.abs(l.diferencia)), styles: { halign: 'right', fontStyle: 'bold', textColor: C.danger } },
      ]),
      {
        0: { cellWidth: 24 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
      },
    );
  }

  // Excedentes detail
  if (excedentes > 0) {
    y = checkPageBreak(doc, y);
    y = drawCleanTable(doc, y,
      ['Código', 'Producto', 'Esperada', 'Real', 'Excedente'],
      lineas.filter(l => l.diferencia > 0).map(l => [
        l.codigo,
        l.nombre,
        { content: String(l.cantidad_esperada), styles: { halign: 'right' } },
        { content: l.cantidad_real !== null ? String(l.cantidad_real) : '—', styles: { halign: 'right' } },
        { content: `+${l.diferencia}`, styles: { halign: 'right', fontStyle: 'bold', textColor: C.success } },
      ]),
      {
        0: { cellWidth: 24 },
        2: { cellWidth: 20, halign: 'right' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 20, halign: 'right' },
      },
    );
  }

  if (auditoria.notas) {
    y = drawNotes(doc, y, auditoria.notas);
  }
  if (auditoria.notas_supervisor) {
    y = checkPageBreak(doc, y, 20);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...C.text);
    doc.text('NOTAS DEL SUPERVISOR', ML, y);
    y += 5;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...C.text);
    const split = doc.splitTextToSize(auditoria.notas_supervisor, doc.internal.pageSize.getWidth() - 32);
    doc.text(split, ML, y);
    y += split.length * 3.8 + 5;
  }

  drawFooter(doc);
  return doc.output('blob');
}
