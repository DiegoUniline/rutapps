import type { ReportGroup } from './concentradoReport';
import { createDoc, drawDocHeader, drawCleanTable, drawFooter, ML, MR, C } from './pdfStyleOdoo';

export interface ConcentradoExportOptions {
  empresa: string;
  logoUrl?: string | null;
  desde: string;
  hasta: string;
  fechaLabel: string;
  groups: ReportGroup[];
  quantity: 'requerido' | 'pendiente';
}
const date = (iso: string) => iso ? iso.split('-').reverse().join('/') : 'Sin límite';
const number = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 6 });
const fileName = (o: ConcentradoExportOptions) => `hoja-surtido_${o.desde || 'inicio'}_${o.hasta || 'fin'}`;

export async function createConcentradoWorkbook(options: ConcentradoExportOptions) {
  const XLSX = await import('xlsx');
  const rows: (string | number)[][] = [];
  const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
  const merged = (text: string) => {
    const r = rows.length;
    rows.push([text]);
    merges.push({ s: { r, c: 0 }, e: { r, c: 6 } });
  };
  merged(options.empresa);
  merged('CONCENTRADO · HOJA DE SURTIDO');
  merged(`${options.fechaLabel}: ${date(options.desde)} al ${date(options.hasta)}`);
  for (const group of options.groups) {
    rows.push([]);
    merged(group.label);
    rows.push(['No.', 'Código', 'Producto', 'Requerido', 'Ya surtido', 'Pendiente', 'ENT.']);
    group.products.forEach((p, i) => rows.push([i + 1, p.codigo, p.nombre, p.requerido, p.surtido, p.pendiente, '']));
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!merges'] = merges;
  sheet['!cols'] = [6, 18, 48, 14, 14, 14, 14].map(wch => ({ wch }));
  sheet['!margins'] = { left: 0.25, right: 0.25, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 };
  for (const key of Object.keys(sheet)) {
    if (!key.startsWith('!') && sheet[key].t === 'n') sheet[key].z = '#,##0.######';
  }
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Hoja de surtido');
  return workbook;
}

async function logoData(url?: string | null): Promise<string | null> {
  if (!url) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch { return null; } finally { clearTimeout(timeout); }
}

export async function createConcentradoPdf(options: ConcentradoExportOptions) {
  const [doc, logo] = await Promise.all([createDoc(), logoData(options.logoUrl)]);
  const empresa = { nombre: options.empresa, logo_url: options.logoUrl };
  const width = doc.internal.pageSize.getWidth() - ML - MR;

  for (const [index, group] of options.groups.entries()) {
    if (index > 0) doc.addPage();
    const header = () => {
      let y = drawDocHeader(doc, empresa, 'CONCENTRADO', '', logo, undefined, undefined, { companyMaxWidth: 88 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(...C.muted);
      doc.text(`${options.fechaLabel}: ${date(options.desde)} al ${date(options.hasta)}`, ML, y);
      y += 6;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.setTextColor(...C.text);
      const lines = doc.splitTextToSize(group.label, width) as string[];
      doc.text(lines, ML, y);
      return y + lines.length * 4.5 + 3;
    };
    const top = header();
    if (top > doc.internal.pageSize.getHeight() - 55) {
      throw new Error('El nombre del grupo es demasiado largo para imprimir.');
    }
    await drawCleanTable(doc, top,
      ['No.', 'Código', 'Producto', options.quantity === 'requerido' ? 'Requerido' : 'Pendiente', 'ENT.'],
      group.products.map((product, i) => [i + 1, product.codigo, product.nombre, number(product[options.quantity]), '']),
      {
        0: { cellWidth: 12, halign: 'center' },
        1: { cellWidth: 25 },
        2: { cellWidth: width - 89 },
        3: { cellWidth: 30, halign: 'right' },
        4: { cellWidth: 22, halign: 'center' },
      },
      undefined,
      {
        margin: { top, bottom: 20, left: ML, right: MR },
        rowPageBreak: 'avoid',
        willDrawPage: data => { if (data.pageNumber > 1) header(); },
      },
    );
  }
  drawFooter(doc, empresa);
  return doc;
}

export async function exportConcentradoReport(format: 'pdf' | 'excel', options: ConcentradoExportOptions) {
  if (format === 'pdf') {
    const doc = await createConcentradoPdf(options);
    doc.save(`${fileName(options)}.pdf`);
  } else {
    const workbook = await createConcentradoWorkbook(options);
    const XLSX = await import('xlsx');
    XLSX.writeFile(workbook, `${fileName(options)}.xlsx`);
  }
}
