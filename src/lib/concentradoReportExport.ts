import type { ReportGroup, ReportProduct } from './concentradoReport';

export interface ConcentradoExportOptions {
  empresa: string;
  logoUrl?: string | null;
  desde: string;
  hasta: string;
  fechaLabel: string;
  filterLabel: string;
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
  merged(options.filterLabel);
  merged('ENT.: espacio para anotar la cantidad entregada al preparar la carga.');
  for (const group of options.groups) {
    rows.push([]);
    merged(group.label);
    merged(`${group.orderCount} pedido(s) · ${group.products.length} producto(s)`);
    let folios = 'Folios pedidos: ';
    for (const folio of group.folios) {
      if (folios.length + folio.length > 120) { merged(folios); folios = ''; }
      folios += `${folios && !folios.endsWith(': ') ? ', ' : ''}${folio}`;
    }
    if (folios) merged(folios);
    merged('Recibe: ____________________________________    Fecha: __________________');
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
  const [{ jsPDF }, logo] = await Promise.all([import('jspdf'), logoData(options.logoUrl)]);
  const doc = new jsPDF({ unit: 'mm', format: 'letter', orientation: 'portrait' });
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 10;
  const gap = 6;
  const columnWidth = (width - margin * 2 - gap) / 2;
  const bottom = height - 17;
  let firstPage = true;
  const newPage = () => { if (!firstPage) doc.addPage(); firstPage = false; };
  const wrappedText = (text: string, x: number, y: number, maxWidth: number, fontSize = 8, lineHeight = 3.8) => {
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  };

  for (const group of options.groups) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const folioLines = doc.splitTextToSize(`Folios pedidos: ${group.folios.join(', ')}`, width - margin * 2) as string[];
    const hasFolioAppendix = folioLines.length > 7;
    const header = (continuation: boolean) => {
      let companyX = margin;
      if (logo) {
        try {
          const image = doc.getImageProperties(logo);
          const factor = Math.min(22 / image.width, 14 / image.height);
          doc.addImage(logo, image.fileType, margin, 9, image.width * factor, image.height * factor);
          companyX += 26;
        } catch { /* Un logo incompatible no bloquea el reporte. */ }
      }
      doc.setTextColor(26);
      doc.setFont('helvetica', 'bold');
      const companyEnd = wrappedText((options.empresa || 'Hoja de surtido').toUpperCase(), companyX, 13, width * 0.62 - companyX, 10, 4.6);
      doc.setFontSize(14);
      doc.text('CONCENTRADO', width - margin, 13, { align: 'right' });
      let y = Math.max(27, companyEnd + 5);
      y = wrappedText(`${group.label}${continuation ? ' (continuación)' : ''}`, margin, y, width - margin * 2, 12, 5);
      doc.setFont('helvetica', 'normal');
      y = wrappedText(`${options.fechaLabel}: ${date(options.desde)} al ${date(options.hasta)}`, margin, y + 1, width - margin * 2);
      y = wrappedText(options.filterLabel, margin, y, width - margin * 2, 7.5);
      y = wrappedText(`${group.orderCount} pedido(s) · ${group.products.length} producto(s) · Cantidad: ${options.quantity === 'requerido' ? 'requerido total' : 'pendiente de surtir'}`, margin, y, width - margin * 2);
      if (hasFolioAppendix) {
        y = wrappedText('Folios pedidos: ver listado completo al final de este grupo.', margin, y + 1, width - margin * 2);
      } else {
        doc.setFontSize(8);
        doc.text(folioLines, margin, y + 1);
        y += folioLines.length * 3.8 + 1;
      }
      y = wrappedText('Recibe: ____________________________________    Fecha: __________________', margin, y + 3, width - margin * 2);
      return y + 4;
    };
    let productIndex = 0;
    let groupPage = 0;
    do {
      newPage();
      const top = header(groupPage > 0);
      if (top > bottom - 25) throw new Error('El encabezado es demasiado largo para imprimir. Reduce los filtros seleccionados.');
      for (let col = 0; col < 2; col++) {
        if (col > 0 && productIndex >= group.products.length) break;
        const x = margin + col * (columnWidth + gap);
        const qtyX = x + columnWidth - 21;
        const entX = x + columnWidth - 7;
        doc.setFillColor(240, 240, 240);
        doc.rect(x, top, columnWidth, 6, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(26);
        doc.text('No.', x + 1, top + 4);
        doc.text('PRODUCTO', x + 9, top + 4);
        doc.text(options.quantity === 'requerido' ? 'REQ.' : 'PEND.', qtyX, top + 4, { align: 'center' });
        doc.text('ENT.', entX, top + 4, { align: 'center' });
        let y = top + 6;
        while (productIndex < group.products.length) {
          const product: ReportProduct = group.products[productIndex];
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          const productLabel = product.codigo ? `${product.codigo} · ${product.nombre}` : product.nombre;
          const lines = doc.splitTextToSize(productLabel, columnWidth - 40) as string[];
          const rowHeight = Math.max(5.4, lines.length * 3.5 + 1.8);
          if (rowHeight > bottom - top - 6) throw new Error('Un nombre de producto es demasiado largo para esta hoja.');
          if (y + rowHeight > bottom) break;
          doc.setTextColor(80);
          doc.setFontSize(7);
          doc.text(String(productIndex + 1), x + 1, y + 3.7);
          doc.setTextColor(26);
          doc.setFontSize(8);
          doc.text(lines, x + 9, y + 3.7);
          const amount = number(product[options.quantity]);
          const qtyFontSize = Math.min(8, 8 * 15 / Math.max(15, doc.getTextWidth(amount)));
          doc.setFontSize(qtyFontSize);
          doc.text(amount, qtyX + 6, y + 3.7, { align: 'right' });
          doc.setDrawColor(214);
          doc.setLineWidth(0.15);
          doc.line(x, y + rowHeight, x + columnWidth, y + rowHeight);
          doc.line(x + columnWidth - 14, y, x + columnWidth - 14, y + rowHeight);
          y += rowHeight;
          productIndex++;
        }
      }
      if (!group.products.length) {
        doc.setFontSize(9);
        doc.text('Estos pedidos no tienen líneas de productos.', margin, top + 14);
      }
      groupPage++;
    } while (productIndex < group.products.length);

    if (hasFolioAppendix) {
      for (let i = 0; i < folioLines.length; i += 50) {
        newPage();
        doc.setFont('helvetica', 'bold');
        const end = wrappedText(group.label, margin, 17, width - margin * 2, 12, 5);
        doc.setFont('helvetica', 'normal');
        wrappedText('LISTADO COMPLETO DE FOLIOS', margin, end + 5, width - margin * 2, 9);
        doc.setFontSize(8);
        doc.text(folioLines.slice(i, i + 50), margin, end + 13);
      }
    }
  }
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100);
    doc.text('ENT.: anotar cantidad entregada al preparar la carga.', margin, height - 9);
    doc.text(`${page} / ${pages}`, width - margin, height - 9, { align: 'right' });
  }
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
