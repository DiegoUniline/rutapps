/**
 * Reporte en PDF generado por código (D-051) con el estándar B/N corporativo
 * (`pdfStyleOdoo`): encabezado de empresa, título y periodo, filtros
 * aplicados, indicadores (KPIs) y una o varias tablas con su renglón de total.
 *
 * Reemplaza la impresión de la pantalla (`window.print()`): cada reporte arma
 * aquí el mismo contenido y filtros que muestra en pantalla.
 */
import type { UserOptions } from 'jspdf-autotable';
import {
  createDoc, drawDocHeader, drawSectionTitle, drawCleanTable, drawFooter, checkPageBreak,
  loadLogoBase64, ML, MR, C, type EmpresaInfo,
} from '@/lib/pdfStyleOdoo';

export interface ColumnaReportePdf {
  header: string;
  align?: 'left' | 'center' | 'right';
}

export interface SeccionReportePdf {
  titulo?: string;
  /** Línea de resumen bajo el título (p. ej. «Cargado: 10 · Vendido: 8»). */
  resumen?: string;
  columnas: ColumnaReportePdf[];
  filas: string[][];
  /** Renglón final en negritas (totales). */
  pie?: string[];
  /** Texto cuando no hay filas. */
  vacio?: string;
  /** Empieza en hoja nueva (detalle por vendedor). */
  nuevaPagina?: boolean;
}

export interface ReportePdfDoc {
  titulo: string;
  /** Texto bajo el título (periodo, fecha de corte, folio…). */
  periodo?: string;
  filtros?: { label: string; value: string }[];
  kpis?: { label: string; value: string }[];
  secciones: SeccionReportePdf[];
  /** Nombre del archivo, sin extensión. */
  archivo: string;
}

export interface EmpresaReportePdf extends EmpresaInfo {
  logo_url?: string | null;
}

/** Periodo «dd/mm/aaaa – dd/mm/aaaa» (o una sola fecha) desde fechas ISO. */
export function periodoReporte(desde: string, hasta?: string | null): string {
  const f = (d: string) => {
    const [y, m, dd] = d.slice(0, 10).split('-');
    return y && m && dd ? `${dd}/${m}/${y}` : d;
  };
  if (!hasta || hasta === desde) return f(desde);
  return `${f(desde)} – ${f(hasta)}`;
}

function dibujarKpis(doc: import('jspdf').jsPDF, y: number, kpis: { label: string; value: string }[]): number {
  const pageW = doc.internal.pageSize.getWidth();
  const ancho = pageW - ML - MR;
  const porFila = Math.min(4, kpis.length);
  const gap = 3;
  const w = (ancho - gap * (porFila - 1)) / porFila;
  const h = 13;
  kpis.forEach((k, i) => {
    const fila = Math.floor(i / porFila);
    const col = i % porFila;
    const x = ML + col * (w + gap);
    const yy = y + fila * (h + gap);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, yy, w, h, 1, 1, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...C.muted);
    doc.text(k.label.toUpperCase(), x + w / 2, yy + 4.5, { align: 'center', maxWidth: w - 2 });
    doc.setFontSize(11);
    doc.setTextColor(...C.text);
    doc.text(k.value, x + w / 2, yy + 10.2, { align: 'center', maxWidth: w - 2 });
  });
  const filas = Math.ceil(kpis.length / porFila);
  return y + filas * (h + gap) + 3;
}

/** Arma el PDF del reporte. `logoBase64` opcional (si no, se descarga de `empresa.logo_url`). */
export async function generarReportePdf(reporte: ReportePdfDoc, empresa: EmpresaReportePdf, logoBase64?: string | null): Promise<Blob> {
  const doc = await createDoc();
  doc.setProperties({ title: reporte.titulo, creator: 'Rutapp' });
  const logo = logoBase64 !== undefined ? logoBase64 : empresa.logo_url ? await loadLogoBase64(empresa.logo_url) : null;
  let y = drawDocHeader(doc, empresa, reporte.titulo, reporte.periodo ?? '', logo, undefined, undefined, { companyMaxWidth: 110 });

  const filtros = (reporte.filtros ?? []).filter(f => f.value);
  if (filtros.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...C.muted);
    const lineas = doc.splitTextToSize(`Filtros: ${filtros.map(f => `${f.label}: ${f.value}`).join(' · ')}`, doc.internal.pageSize.getWidth() - ML - MR) as string[];
    doc.text(lineas, ML, y - 2);
    y += lineas.length * 4 + 1;
  }

  if (reporte.kpis?.length) y = dibujarKpis(doc, y, reporte.kpis);

  const margenTabla: Pick<UserOptions, 'margin'> = { margin: { left: ML, right: MR, top: 16, bottom: 18 } };
  for (const s of reporte.secciones) {
    if (s.nuevaPagina && y > 40) { doc.addPage(); y = 16; }
    y = checkPageBreak(doc, y, 40);
    if (s.titulo) y = drawSectionTitle(doc, y, s.titulo);
    if (s.resumen) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.muted);
      doc.text(s.resumen, ML, y);
      y += 5;
    }
    if (s.filas.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.muted);
      doc.text(s.vacio ?? 'Sin registros', ML, y + 2);
      y += 9;
      continue;
    }
    const estilos = Object.fromEntries(s.columnas.map((c, i) => [i, { halign: c.align ?? 'left' }]));
    const cuerpo = s.pie ? [...s.filas, s.pie] : s.filas;
    const ultima = cuerpo.length - 1;
    y = await drawCleanTable(doc, y, s.columnas.map(c => c.header), cuerpo, estilos, s.pie
      ? (data: { section: string; row: { index: number }; cell: { styles: { fontStyle: string; fillColor: [number, number, number] } } }) => {
          if (data.section === 'body' && data.row.index === ultima) {
            data.cell.styles.fontStyle = 'bold';
            data.cell.styles.fillColor = C.headBg;
          }
        }
      : undefined, margenTabla);
  }

  drawFooter(doc, empresa);
  return doc.output('blob');
}

/** PDF del reporte con su nombre de archivo, listo para abrir o descargar. */
export async function pdfDeReporte(reporte: ReportePdfDoc, empresa: EmpresaReportePdf): Promise<{ blob: Blob; fileName: string }> {
  return { blob: await generarReportePdf(reporte, empresa), fileName: `${reporte.archivo.replace(/[^\w.-]+/g, '_')}.pdf` };
}
