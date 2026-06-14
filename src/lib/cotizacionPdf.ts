import {
  drawHeader, drawInfoSection, drawTotals, drawFooter, drawNotes,
  loadLogoBase64, type EmpresaInfo, fmtMoney, fmtDate, TABLE_HEAD_STYLE, TABLE_BODY_STYLE, TABLE_ALT_STYLE,
} from './pdfBase';
import type { Cotizacion } from '@/hooks/useCotizaciones';

export async function buildCotizacionPdf(
  cotizacion: Cotizacion,
  empresa: EmpresaInfo,
  currencySymbol = '$',
): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = (autoTableMod as any).default || (autoTableMod as any);
  const doc = new jsPDF({ unit: 'mm', format: 'letter' });

  const logo = empresa.logo_url ? await loadLogoBase64(empresa.logo_url) : null;
  let y = drawHeader(doc, empresa, 'COTIZACIÓN', cotizacion.folio || '—', logo);

  const cli = cotizacion.clientes;
  const leftRows: [string, string][] = [
    ['Cliente:', cli?.nombre || 'Sin cliente'],
  ];
  if ((cli as any)?.rfc) leftRows.push(['RFC:', (cli as any).rfc]);
  if (cli?.telefono) leftRows.push(['Tel:', cli.telefono!]);
  if ((cli as any)?.direccion) leftRows.push(['Dir:', (cli as any).direccion]);

  const rightRows: [string, string][] = [
    ['Fecha:', fmtDate(cotizacion.fecha)],
    ['Vence:', cotizacion.vence_at ? fmtDate(cotizacion.vence_at) : '—'],
    ['Vigencia:', `${cotizacion.vigencia_dias} días`],
    ['Estado:', (cotizacion.estado || '').toUpperCase()],
  ];
  y = drawInfoSection(doc, y, leftRows, rightRows);

  const lineas = cotizacion.cotizacion_lineas ?? [];
  const body = lineas.map((l, i) => [
    String(i + 1),
    l.descripcion ?? ((l.producto_snapshot as any)?.nombre ?? '—'),
    Number(l.cantidad).toLocaleString('es-MX', { maximumFractionDigits: 3 }),
    fmtMoney(Number(l.precio_unitario), currencySymbol),
    Number(l.descuento_pct ?? 0) > 0 ? `${l.descuento_pct}%` : '—',
    fmtMoney(Number(l.total), currencySymbol),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['#', 'Descripción', 'Cant.', 'Precio', 'Desc.', 'Total']],
    body,
    headStyles: TABLE_HEAD_STYLE,
    bodyStyles: TABLE_BODY_STYLE,
    alternateRowStyles: TABLE_ALT_STYLE,
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      2: { cellWidth: 18, halign: 'right' },
      3: { cellWidth: 25, halign: 'right' },
      4: { cellWidth: 18, halign: 'right' },
      5: { cellWidth: 28, halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });

  y = (doc as any).lastAutoTable.finalY + 6;

  const totals: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal:', value: fmtMoney(cotizacion.subtotal, currencySymbol) },
  ];
  if (cotizacion.descuento > 0) totals.push({ label: 'Descuento:', value: `- ${fmtMoney(cotizacion.descuento, currencySymbol)}` });
  if (cotizacion.impuestos > 0) totals.push({ label: 'Impuestos:', value: fmtMoney(cotizacion.impuestos, currencySymbol) });
  totals.push({ label: 'TOTAL:', value: fmtMoney(cotizacion.total, currencySymbol), bold: true });
  y = drawTotals(doc, y, totals);

  if (cotizacion.notas) y = drawNotes(doc, y, cotizacion.notas);

  drawFooter(doc);

  return doc.output('blob');
}

export function cotizacionPublicUrl(token: string): string {
  return `${window.location.origin}/cotizacion/${token}`;
}

export function buildCotizacionWhatsappMessage(
  c: Cotizacion,
  empresaNombre: string,
  symbol = '$',
): string {
  const nombre = c.clientes?.nombre || 'Hola';
  const total = `${symbol}${c.total.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const url = cotizacionPublicUrl(c.token_publico || '');
  const vence = c.vence_at ? new Date(c.vence_at + 'T12:00:00').toLocaleDateString('es-MX') : '';
  return (
    `Hola ${nombre}, te comparto la cotización *${c.folio}* de ${empresaNombre}.\n` +
    `Total: *${total}*` +
    (vence ? ` · Vigencia hasta ${vence}` : '') +
    `\n\nVer detalle: ${url}`
  );
}
