/**
 * Orden de compra INDIVIDUAL (PDF B/N + Excel).
 *
 * Antes solo existía el export masivo de la lista de compras, que juntaba todas
 * las órdenes en un mismo documento. Estas funciones generan el documento de
 * UNA sola compra por su id.
 *
 * jsPDF se importa de forma diferida: no pesa en la carga inicial.
 */
import { supabase } from '@/lib/supabase';
import {
  PDF, ML, MR, drawHeader, drawInfoSection, drawTotals, drawSectionTitle,
  drawFooter, drawNotes, loadLogoBase64, fmtMoney, fmtDate,
  TABLE_HEAD_STYLE, TABLE_BODY_STYLE,
  type EmpresaInfo,
} from '@/lib/pdfBase';
import { getNombreCompra } from '@/lib/productoNombres';
import { exportToExcel, type ExportColumn } from '@/lib/exportUtils';
import { getCurrencyConfig } from '@/lib/currency';

interface OrdenCompraData {
  compra: any;
  lineas: any[];
  empresa: EmpresaInfo;
  simbolo: string;
}

async function loadOrdenCompra(compraId: string, empresaId: string): Promise<OrdenCompraData | null> {
  const [cRes, lRes, eRes] = await Promise.all([
    supabase
      .from('compras')
      .select('id, folio, fecha, status, condicion_pago, dias_credito, fecha_vencimiento, numero_factura, notas, subtotal, iva_total, descuento_extra, descuento_extra_tipo, descuento_extra_motivo, descuento_total, ajuste_total, total, saldo_pendiente, proveedor_id, proveedores(nombre, rfc, telefono, email)')
      .eq('id', compraId)
      .eq('empresa_id', empresaId)
      .maybeSingle(),
    supabase
      .from('compra_lineas')
      .select('id, cantidad, precio_unitario, subtotal, total, producto_id, productos(codigo, nombre, nombre_compra)')
      .eq('compra_id', compraId)
      .order('created_at'),
    supabase
      .from('empresas')
      .select('nombre, razon_social, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, moneda')
      .eq('id', empresaId)
      .maybeSingle(),
  ]);

  if (!cRes.data) return null;
  const empresaRow: any = eRes.data ?? { nombre: '' };
  return {
    compra: cRes.data,
    lineas: lRes.data ?? [],
    empresa: empresaRow as EmpresaInfo,
    simbolo: getCurrencyConfig(empresaRow?.moneda).symbol,
  };
}

const folioOf = (compra: any) => compra.folio || String(compra.id).slice(0, 8);

function infoRows(d: OrdenCompraData): { left: [string, string][]; right: [string, string][] } {
  const { compra } = d;
  const prov: any = compra.proveedores ?? {};
  const left: [string, string][] = [['Proveedor:', prov.nombre ?? '—']];
  if (prov.rfc) left.push(['RFC:', prov.rfc]);
  if (prov.telefono) left.push(['Teléfono:', prov.telefono]);
  if (prov.email) left.push(['Email:', prov.email]);

  const right: [string, string][] = [
    ['Fecha:', fmtDate(compra.fecha)],
    ['Condición:', compra.condicion_pago === 'credito' ? `Crédito${compra.dias_credito ? ` ${compra.dias_credito} días` : ''}` : 'Contado'],
  ];
  if (compra.fecha_vencimiento) right.push(['Vencimiento:', fmtDate(compra.fecha_vencimiento)]);
  if (compra.numero_factura) right.push(['No. factura:', String(compra.numero_factura)]);
  right.push(['Estatus:', String(compra.status ?? '').toUpperCase()]);
  return { left, right };
}

/** Genera y descarga el PDF B/N de una orden de compra. */
export async function downloadOrdenCompraPdf(compraId: string, empresaId: string): Promise<boolean> {
  const d = await loadOrdenCompra(compraId, empresaId);
  if (!d) return false;

  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
  const logo = d.empresa.logo_url ? await loadLogoBase64(d.empresa.logo_url) : null;

  let y = drawHeader(doc, d.empresa, 'ORDEN DE COMPRA', folioOf(d.compra), logo);
  const rows = infoRows(d);
  y = drawInfoSection(doc, y, rows.left, rows.right);
  y = drawSectionTitle(doc, y + 2, 'Productos');

  const body = d.lineas.map((l: any) => [
    (l.productos as any)?.codigo ?? '',
    getNombreCompra(l.productos as any),
    Number(l.cantidad ?? 0).toLocaleString('es-MX'),
    fmtMoney(Number(l.precio_unitario ?? 0), d.simbolo),
    fmtMoney(Number(l.total ?? l.subtotal ?? 0), d.simbolo),
  ]);

  autoTable(doc, {
    startY: y,
    head: [['Código', 'Producto', 'Cant.', 'P. Unit.', 'Importe']],
    body,
    theme: 'plain',
    styles: { font: 'helvetica', ...TABLE_BODY_STYLE },
    headStyles: { ...TABLE_HEAD_STYLE, lineWidth: { top: 0, right: 0, bottom: 0.4, left: 0 } as any },
    bodyStyles: { lineColor: PDF.border, lineWidth: { top: 0, right: 0, bottom: 0.15, left: 0 } as any },
    columnStyles: {
      0: { cellWidth: 24 },
      2: { halign: 'right', cellWidth: 18 },
      3: { halign: 'right', cellWidth: 26 },
      4: { halign: 'right', cellWidth: 28 },
    },
    margin: { left: ML, right: MR },
  });

  y = (doc as any).lastAutoTable.finalY + 8;

  const totales: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal', value: fmtMoney(Number(d.compra.subtotal ?? 0), d.simbolo) },
    { label: 'IVA', value: fmtMoney(Number(d.compra.iva_total ?? 0), d.simbolo) },
  ];
  if (Number(d.compra.descuento_total ?? 0) > 0) {
    totales.push({ label: 'Descuento final', value: `- ${fmtMoney(Number(d.compra.descuento_total), d.simbolo)}` });
  }
  if (Number(d.compra.ajuste_total ?? 0) !== 0) {
    const ajuste = Number(d.compra.ajuste_total);
    totales.push({ label: 'Ajuste', value: `${ajuste > 0 ? '+' : '-'} ${fmtMoney(Math.abs(ajuste), d.simbolo)}` });
  }
  totales.push({ label: 'Total final', value: fmtMoney(Number(d.compra.total ?? 0), d.simbolo), bold: true });
  if (Number(d.compra.saldo_pendiente ?? 0) > 0) {
    totales.push({ label: 'Saldo pendiente', value: fmtMoney(Number(d.compra.saldo_pendiente), d.simbolo) });
  }
  y = drawTotals(doc, y, totales);

  if (d.compra.notas) y = drawNotes(doc, y + 4, String(d.compra.notas));

  drawFooter(doc, d.empresa.nombre);
  doc.save(`OC-${folioOf(d.compra)}.pdf`);
  return true;
}

/** Genera y descarga el Excel de una orden de compra. */
export async function downloadOrdenCompraExcel(compraId: string, empresaId: string): Promise<boolean> {
  const d = await loadOrdenCompra(compraId, empresaId);
  if (!d) return false;

  const columns: ExportColumn[] = [
    { key: 'codigo', header: 'Código', width: 16 },
    { key: 'producto', header: 'Producto', width: 40 },
    { key: 'cantidad', header: 'Cantidad', format: 'number', width: 12 },
    { key: 'precio_unitario', header: 'P. Unitario', format: 'currency', width: 16 },
    { key: 'importe', header: 'Importe', format: 'currency', width: 16 },
  ];

  const data = d.lineas.map((l: any) => ({
    codigo: (l.productos as any)?.codigo ?? '',
    producto: getNombreCompra(l.productos as any),
    cantidad: Number(l.cantidad ?? 0),
    precio_unitario: Number(l.precio_unitario ?? 0),
    importe: Number(l.total ?? l.subtotal ?? 0),
  }));

  const prov: any = d.compra.proveedores ?? {};
  const subtitleParts = [
    `Proveedor: ${prov.nombre ?? '—'}`,
    `Fecha: ${fmtDate(d.compra.fecha)}`,
    d.compra.numero_factura ? `Factura: ${d.compra.numero_factura}` : null,
    d.compra.fecha_vencimiento ? `Vence: ${fmtDate(d.compra.fecha_vencimiento)}` : null,
    Number(d.compra.descuento_total ?? 0) > 0 ? `Descuento: ${fmtMoney(Number(d.compra.descuento_total), d.simbolo)}` : null,
    Number(d.compra.ajuste_total ?? 0) !== 0 ? `Ajuste: ${fmtMoney(Number(d.compra.ajuste_total), d.simbolo)}` : null,
  ].filter(Boolean) as string[];

  await exportToExcel({
    fileName: `OC-${folioOf(d.compra)}`,
    title: `Orden de compra ${folioOf(d.compra)}`,
    subtitle: subtitleParts.join('  ·  '),
    empresa: d.empresa.nombre,
    columns,
    data,
    totals: { importe: Number(d.compra.total ?? 0) },
    currencyCode: (d.empresa as any).moneda ?? null,
  });
  return true;
}
