/**
 * Ajuste de Inventario PDF — Clean Odoo-style layout
 */
import {
  createDoc, C, fmtDate,
  drawDocHeader, drawInfoGrid, drawCleanTable,
  drawNotes, drawFooter,
  type EmpresaInfo,
} from './pdfStyleOdoo';

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
  const doc = createDoc();

  const aumentos = lineas.filter(l => l.diferencia > 0).length;
  const reducciones = lineas.filter(l => l.diferencia < 0).length;

  let y = drawDocHeader(doc, empresa, 'AJUSTE DE INVENTARIO', fmtDate(ajuste.fecha), logoBase64);

  y = drawInfoGrid(doc, y,
    'Detalle del ajuste',
    [
      ['Fecha:', fmtDate(ajuste.fecha)],
      ['Motivo:', ajuste.motivo || 'Ajuste manual'],
      ...(ajuste.almacen ? [['Almacén:', ajuste.almacen] as [string, string]] : []),
    ],
    'Resumen',
    [
      ['Productos:', String(lineas.length)],
      ['Aumentos:', String(aumentos)],
      ['Reducciones:', String(reducciones)],
      ...(ajuste.responsable ? [['Responsable:', ajuste.responsable] as [string, string]] : []),
    ],
  );

  y = drawCleanTable(doc, y,
    ['Código', 'Producto', 'Anterior', 'Nueva', 'Diferencia'],
    lineas.map(l => [
      { content: l.codigo, styles: { textColor: C.muted, fontSize: 7 } },
      l.nombre,
      { content: String(l.cantidad_anterior), styles: { halign: 'right' } },
      { content: String(l.cantidad_nueva), styles: { halign: 'right', fontStyle: 'bold' } },
      { content: l.diferencia > 0 ? `+${l.diferencia}` : String(l.diferencia), styles: { halign: 'right', fontStyle: 'bold' } },
    ]),
    {
      0: { cellWidth: 24 },
      2: { cellWidth: 20, halign: 'right' },
      3: { cellWidth: 20, halign: 'right' },
      4: { cellWidth: 22, halign: 'right' },
    },
    (data: any) => {
      if (data.section === 'body' && data.column.index === 4) {
        const raw = data.cell.raw?.content || data.cell.raw;
        if (typeof raw === 'string') {
          if (raw.startsWith('+')) data.cell.styles.textColor = C.success;
          else if (raw.startsWith('-')) data.cell.styles.textColor = C.danger;
        }
      }
    },
  );

  if (ajuste.motivo) {
    y = drawNotes(doc, y, `Motivo: ${ajuste.motivo}`);
  }

  drawFooter(doc);
  return doc.output('blob');
}
