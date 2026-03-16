import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF, ML, MR, fmtDate, fmtDateTime,
  drawHeader, drawInfoSection, drawSectionTitle, drawFooter, drawNotes,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
  type EmpresaInfo,
} from './pdfBase';

interface AjusteInventarioPdfParams {
  empresa: EmpresaInfo;
  logoBase64?: string | null;
  ajuste: {
    fecha: string;
    motivo: string;
    almacen?: string;
    responsable?: string;
    created_at?: string;
  };
  lineas: {
    codigo: string;
    nombre: string;
    cantidad_anterior: number;
    cantidad_nueva: number;
    diferencia: number;
  }[];
}

export function generarAjusteInventarioPdf(params: AjusteInventarioPdfParams): Blob {
  const { empresa, logoBase64, ajuste, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  let y = drawHeader(doc, empresa, 'AJUSTE DE INVENTARIO', fmtDate(ajuste.fecha), logoBase64);

  const aumentos = lineas.filter(l => l.diferencia > 0).length;
  const reducciones = lineas.filter(l => l.diferencia < 0).length;

  y = drawInfoSection(doc, y, [
    ['Fecha:', fmtDate(ajuste.fecha)],
    ['Motivo:', ajuste.motivo || 'Ajuste manual'],
    ...(ajuste.almacen ? [['Almacén:', ajuste.almacen] as [string, string]] : []),
  ], [
    ['Productos:', String(lineas.length)],
    ['Aumentos:', String(aumentos)],
    ['Reducciones:', String(reducciones)],
    ...(ajuste.responsable ? [['Responsable:', ajuste.responsable] as [string, string]] : []),
  ]);

  y = drawSectionTitle(doc, y, 'Detalle de Ajustes');

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [['Código', 'Producto', 'Anterior', 'Nueva', 'Diferencia']],
    body: lineas.map(l => [
      l.codigo, l.nombre,
      String(l.cantidad_anterior), String(l.cantidad_nueva),
      l.diferencia > 0 ? `+${l.diferencia}` : String(l.diferencia),
    ]),
    headStyles: TABLE_HEAD_STYLE,
    bodyStyles: TABLE_BODY_STYLE,
    alternateRowStyles: TABLE_ALT_STYLE,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 24 },
      2: { halign: 'right', cellWidth: 20 },
      3: { halign: 'right', cellWidth: 20 },
      4: { halign: 'right', cellWidth: 22 },
    },
    didParseCell: (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        const raw = data.cell.raw as string;
        if (raw.startsWith('+')) {
          data.cell.styles.textColor = PDF.success;
          data.cell.styles.fontStyle = 'bold';
        } else if (raw.startsWith('-')) {
          data.cell.styles.textColor = PDF.danger;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  if (ajuste.motivo) {
    y = (doc as any).lastAutoTable.finalY + 8;
    drawNotes(doc, y, `Motivo: ${ajuste.motivo}`);
  }

  drawFooter(doc);
  return doc.output('blob');
}
