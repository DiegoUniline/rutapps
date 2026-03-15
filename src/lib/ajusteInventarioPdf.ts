/**
 * Professional PDF generator for Inventory Adjustments (Ajustes de Inventario)
 * Shows before/after quantities with differences
 */
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  PDF_COLORS, MARGIN_L, MARGIN_R, fmtDate, fmtDateTime,
  drawHeader, drawInfoBox, drawSummaryBoxes, drawSectionTitle, drawFooter, drawNotes,
  type EmpresaInfo,
} from './pdfBase';

interface AjusteInventarioPdfParams {
  empresa: EmpresaInfo;
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
  const { empresa, ajuste, lineas } = params;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });

  const color = PDF_COLORS.warning;

  // Header
  let y = drawHeader(doc, empresa, 'AJUSTE DE INVENTARIO', fmtDate(ajuste.fecha), color);

  // Info
  y = drawInfoBox(doc, y, `Ajuste de inventario — ${fmtDate(ajuste.fecha)}`, [
    [
      `Fecha: ${fmtDate(ajuste.fecha)}`,
      ajuste.almacen ? `Almacén: ${ajuste.almacen}` : null,
      ajuste.responsable ? `Responsable: ${ajuste.responsable}` : null,
    ],
    [
      `Motivo: ${ajuste.motivo || 'Ajuste manual'}`,
      ajuste.created_at ? `Registrado: ${fmtDateTime(ajuste.created_at)}` : null,
    ],
  ]);

  // Summary
  const aumentos = lineas.filter(l => l.diferencia > 0);
  const reducciones = lineas.filter(l => l.diferencia < 0);
  const sinCambio = lineas.filter(l => l.diferencia === 0);

  y = drawSummaryBoxes(doc, y, [
    { label: 'PRODUCTOS', value: String(lineas.length) },
    { label: 'AUMENTOS', value: String(aumentos.length), color: PDF_COLORS.success, bgColor: [240, 253, 244], borderColor: [187, 247, 208] },
    { label: 'REDUCCIONES', value: String(reducciones.length), color: PDF_COLORS.danger, bgColor: [254, 242, 242], borderColor: [254, 202, 202] },
    { label: 'SIN CAMBIO', value: String(sinCambio.length) },
  ]);

  // Detail table
  y = drawSectionTitle(doc, y, 'DETALLE DE AJUSTES', color);

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_L, right: MARGIN_R },
    head: [['Código', 'Producto', 'Anterior', 'Nueva', 'Diferencia']],
    body: lineas.map(l => [
      l.codigo,
      l.nombre,
      String(l.cantidad_anterior),
      String(l.cantidad_nueva),
      l.diferencia > 0 ? `+${l.diferencia}` : String(l.diferencia),
    ]),
    headStyles: { fillColor: color, textColor: [255, 255, 255], fontSize: 7, fontStyle: 'bold', cellPadding: 2 },
    bodyStyles: { fontSize: 7, cellPadding: 2, textColor: PDF_COLORS.dark },
    alternateRowStyles: { fillColor: [255, 251, 235] },
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
          data.cell.styles.textColor = PDF_COLORS.success;
          data.cell.styles.fontStyle = 'bold';
        } else if (raw.startsWith('-')) {
          data.cell.styles.textColor = PDF_COLORS.danger;
          data.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });

  // Motivo note
  if (ajuste.motivo) {
    y = (doc as any).lastAutoTable.finalY + 8;
    drawNotes(doc, y, `Motivo: ${ajuste.motivo}`);
  }

  drawFooter(doc);
  return doc.output('blob');
}
