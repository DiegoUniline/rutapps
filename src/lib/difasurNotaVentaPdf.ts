/**
 * DIFASUR — Custom Nota de Venta PDF.
 *
 * Layout tailored per customer request:
 *  ┌─────────┬──────────────────────────────┬──────────────┐
 *  │  logo   │  Empresa (razón social, RFC,│  Folio       │
 *  │         │  domicilio, tel, email)     │  Fecha       │
 *  ├─────────┴──────────────────────────────┴──────────────┤
 *  │ Cliente | No. Cliente                                 │
 *  │ Razón Social | Ruta                                   │
 *  │ Nombre Negocio                                        │
 *  │ Domicilio | R.F.C.                                    │
 *  │ Municipio | Vendedor                                  │
 *  ├──────────────────────────────────────────────────────┤
 *  │ Cant | Código | Descripción | Lote | Cad. | P.Púb.   │
 *  │      P.Unit | IVA | Importe                          │
 *  ├──────────────────────────────────────────────────────┤
 *  │                              Subtotal / IVA / Total  │
 *  ├──────────────────────────────────────────────────────┤
 *  │ Surtió       Empacó        Recibió                   │
 *  └──────────────────────────────────────────────────────┘
 */
import type jsPDF from 'jspdf';
import { supabase } from '@/lib/supabase';
import { loadLogoBase64 } from '@/lib/pdfBase';
import { getCurrencyConfig } from '@/lib/currency';
import difasurLogoAsset from '@/assets/difasur-logo.png.asset.json';


const ML = 10;
const MR = 10;
const BLACK: [number, number, number] = [26, 26, 26];
const BORDER: [number, number, number] = [180, 180, 180];
const MUTED: [number, number, number] = [110, 110, 110];

const fmt = (n: number) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtDate = (d?: string | null) => {
  if (!d) return '';
  try {
    const dt = new Date(d.length <= 10 ? d + 'T12:00:00' : d);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
};

interface DifasurLine {
  cantidad: number;
  codigo: string;
  descripcion: string;
  lote: string;
  caducidad: string;
  precio_publico: number;
  precio_unitario: number;
  iva_monto: number;
  importe: number;
}

interface DifasurParams {
  empresa: {
    nombre: string;
    razon_social?: string | null;
    rfc?: string | null;
    direccion?: string | null;
    colonia?: string | null;
    ciudad?: string | null;
    estado?: string | null;
    cp?: string | null;
    telefono?: string | null;
    email?: string | null;
    moneda?: string | null;
  };
  logoBase64?: string | null;
  venta: {
    folio: string;
    fecha: string;
    subtotal: number;
    iva_total: number;
    total: number;
  };
  cliente: {
    nombre: string;
    codigo?: string | null;
    razon_social?: string | null;
    nombre_negocio?: string | null;
    domicilio?: string | null;
    rfc?: string | null;
    municipio?: string | null;
    ruta?: string | null;
  };
  vendedor?: string | null;
  lineas: DifasurLine[];
}

async function createDoc(): Promise<jsPDF> {
  const { default: jsPDF } = await import('jspdf');
  return new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'letter' });
}

function drawCell(
  doc: jsPDF,
  x: number, y: number, w: number, h: number,
  content: { label?: string; value?: string; bold?: boolean; align?: 'left' | 'right' | 'center'; fontSize?: number } = {},
) {
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.rect(x, y, w, h);
  const pad = 1.8;
  let tx = x + pad;
  const ty = y + h / 2 + 1.3;

  if (content.label) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(content.fontSize ?? 7.5);
    doc.setTextColor(...BLACK);
    const lw = doc.getTextWidth(content.label);
    doc.text(content.label, tx, ty);
    tx += lw + 1.2;
  }
  if (content.value !== undefined) {
    doc.setFont('helvetica', content.bold ? 'bold' : 'normal');
    doc.setFontSize(content.fontSize ?? 7.5);
    doc.setTextColor(...BLACK);
    const align = content.align ?? 'left';
    const anchorX = align === 'right' ? x + w - pad : align === 'center' ? x + w / 2 : tx;
    const maxW = align === 'right' ? w - pad * 2 : x + w - pad - anchorX;
    const val = doc.splitTextToSize(String(content.value), Math.max(10, maxW))[0] ?? String(content.value);
    doc.text(val, anchorX, ty, { align });
  }
}

export async function generarDifasurNotaVentaPdf(params: DifasurParams): Promise<Blob> {
  const { empresa, logoBase64, venta, cliente, vendedor, lineas } = params;
  const doc = await createDoc();
  const pageW = doc.internal.pageSize.getWidth();
  const usableW = pageW - ML - MR;

  // ── HEADER ──────────────────────────────────────────────
  const headerH = 32;
  const logoW = 38;
  const rightW = 46;
  const centerW = usableW - logoW - rightW;

  // Logo box
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.rect(ML, 10, logoW, headerH);
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', ML + 6, 10 + 6, logoW - 12, headerH - 12);
    } catch { /* ignore */ }
  }

  // Center empresa info
  doc.rect(ML + logoW, 10, centerW, headerH);
  const cx = ML + logoW + centerW / 2;
  let cy = 10 + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...BLACK);
  doc.text((empresa.razon_social || empresa.nombre || '').toUpperCase(), cx, cy, { align: 'center' });
  cy += 4.2;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  if (empresa.rfc) { doc.text(`R.F.C.: ${empresa.rfc}`, cx, cy, { align: 'center' }); cy += 3.8; }
  const addr = [empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado, empresa.cp ? `C.P. ${empresa.cp}` : ''].filter(Boolean).join(', ');
  if (addr) {
    const split = doc.splitTextToSize(addr, centerW - 6);
    doc.text(split, cx, cy, { align: 'center' });
    cy += split.length * 3.6;
  }
  if (empresa.telefono) { doc.text(`Tel.: ${empresa.telefono}`, cx, cy, { align: 'center' }); cy += 3.6; }
  const contacto: string[] = [];
  if (empresa.email) contacto.push(`E-Mail: ${empresa.email}`);
  if (empresa.telefono) contacto.push(`Whatsapp: ${empresa.telefono}`);
  if (contacto.length) doc.text(contacto.join(' | '), cx, cy, { align: 'center' });

  // Right — Folio + Fecha
  const rightX = ML + logoW + centerW;
  const rowH = headerH / 2;
  doc.rect(rightX, 10, rightW, rowH);
  doc.rect(rightX, 10 + rowH, rightW, rowH);
  const rcx = rightX + rightW / 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Folio:', rightX + 3, 10 + rowH / 2 + 1.3);
  doc.setFont('helvetica', 'normal');
  doc.text(venta.folio || '', rightX + rightW - 3, 10 + rowH / 2 + 1.3, { align: 'right' });
  doc.setFont('helvetica', 'bold');
  doc.text('Fecha:', rightX + 3, 10 + rowH + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(fmtDate(venta.fecha), rcx + 3, 10 + rowH + 10, { align: 'center' });

  let y = 10 + headerH;

  // ── CLIENT INFO GRID ────────────────────────────────────
  const rowHeight = 6;
  const leftColW = usableW * 0.62;
  const rightColW = usableW - leftColW;

  // Row 1: Cliente | No. Cliente
  drawCell(doc, ML, y, leftColW, rowHeight, { label: 'Cliente:', value: cliente.nombre || '' });
  drawCell(doc, ML + leftColW, y, rightColW, rowHeight, { label: 'No. Cliente:', value: cliente.codigo || '', align: 'right' });
  y += rowHeight;

  // Row 2: Razón Social | Ruta
  drawCell(doc, ML, y, leftColW, rowHeight, { label: 'Razón Social:', value: cliente.razon_social || cliente.nombre || '' });
  drawCell(doc, ML + leftColW, y, rightColW, rowHeight, { label: 'Ruta:', value: cliente.ruta || '', align: 'right' });
  y += rowHeight;

  // Row 3: Nombre Negocio (full)
  drawCell(doc, ML, y, usableW, rowHeight, { label: 'Nombre Negocio:', value: cliente.nombre_negocio || '' });
  y += rowHeight;

  // Row 4: Domicilio | R.F.C.
  drawCell(doc, ML, y, leftColW, rowHeight, { label: 'Domicilio:', value: cliente.domicilio || '' });
  drawCell(doc, ML + leftColW, y, rightColW, rowHeight, { label: 'R.F.C.:', value: cliente.rfc || '', align: 'right' });
  y += rowHeight;

  // Row 5: Municipio | Vendedor
  drawCell(doc, ML, y, leftColW, rowHeight, { label: 'Municipio:', value: cliente.municipio || '' });
  drawCell(doc, ML + leftColW, y, rightColW, rowHeight, { label: 'Vendedor:', value: vendedor || '', align: 'right' });
  y += rowHeight + 3;

  // ── PRODUCT TABLE ───────────────────────────────────────
  const autoTableMod = await import('jspdf-autotable');
  const autoTable = (autoTableMod as any).default || (autoTableMod as any);

  const body = lineas.map((l) => [
    { content: String(l.cantidad), styles: { halign: 'center' } },
    { content: l.codigo, styles: { halign: 'left' } },
    { content: l.descripcion, styles: { halign: 'left' } },
    { content: l.lote || '', styles: { halign: 'center' } },
    { content: l.caducidad || '', styles: { halign: 'center' } },
    { content: `$${fmt(l.precio_publico)}`, styles: { halign: 'right' } },
    { content: `$${fmt(l.precio_unitario)}`, styles: { halign: 'right' } },
    { content: `$${fmt(l.iva_monto)}`, styles: { halign: 'right' } },
    { content: `$${fmt(l.importe)}`, styles: { halign: 'right' } },
  ]);

  autoTable(doc, {
    startY: y,
    margin: { left: ML, right: MR },
    head: [[
      { content: 'Cant', styles: { halign: 'center' } },
      { content: 'Código', styles: { halign: 'center' } },
      { content: 'Descripción', styles: { halign: 'center' } },
      { content: 'Lote', styles: { halign: 'center' } },
      { content: 'Cad.', styles: { halign: 'center' } },
      { content: 'P. Púb.', styles: { halign: 'center' } },
      { content: 'P. Unit.', styles: { halign: 'center' } },
      { content: 'IVA', styles: { halign: 'center' } },
      { content: 'Importe', styles: { halign: 'center' } },
    ]],
    body,
    theme: 'grid',
    styles: {
      fontSize: 7,
      cellPadding: 1.2,
      textColor: BLACK,
      lineColor: BORDER,
      lineWidth: 0.15,
      valign: 'middle',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [245, 245, 245],
      textColor: BLACK,
      fontStyle: 'bold',
      fontSize: 7.5,
      lineColor: BORDER,
      lineWidth: 0.15,
    },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 21 },
      2: { cellWidth: 'auto' },
      3: { cellWidth: 16 },
      4: { cellWidth: 18 },
      5: { cellWidth: 14 },
      6: { cellWidth: 15 },
      7: { cellWidth: 12 },
      8: { cellWidth: 18 },
    },
  });

  y = (doc as any).lastAutoTable.finalY + 3;

  // ── TOTALS ──────────────────────────────────────────────
  const totalsW = usableW;
  const totRows: { label: string; value: string; bold?: boolean }[] = [
    { label: 'Subtotal:', value: `$${fmt(venta.subtotal)}` },
    { label: 'I.V.A.:', value: `$${fmt(venta.iva_total)}` },
    { label: 'Total:', value: `$${fmt(venta.total)}`, bold: true },
  ];
  const totalRowH = 7;
  for (const r of totRows) {
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(ML, y, totalsW, totalRowH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(r.bold ? 11 : 9.5);
    doc.setTextColor(...BLACK);
    doc.text(r.label, ML + totalsW * 0.55, y + totalRowH / 2 + 1.4, { align: 'right' });
    doc.setFont('helvetica', r.bold ? 'bold' : 'normal');
    doc.setFontSize(r.bold ? 12 : 10);
    doc.text(r.value, ML + totalsW - 3, y + totalRowH / 2 + 1.4, { align: 'right' });
    y += totalRowH;
  }

  y += 6;

  // ── SIGNATURES ──────────────────────────────────────────
  const signW = usableW / 3;
  const signH = 18;
  const labels = ['Surtió', 'Empacó', 'Recibió'];
  for (let i = 0; i < 3; i++) {
    const sx = ML + i * signW;
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.2);
    doc.rect(sx, y, signW, signH);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...BLACK);
    doc.text(labels[i], sx + 3, y + 5);
    doc.setDrawColor(...MUTED);
    doc.setLineWidth(0.3);
    const lineY = y + signH - 5;
    doc.line(sx + 6, lineY, sx + signW - 6, lineY);
  }

  return doc.output('blob');
}

// ── Fetch + build data specific to DIFASUR ────────────────
export async function generateDifasurVentaPdf(
  ventaId: string,
  empresaId: string,
): Promise<{ blob: Blob; fileName: string; caption: string }> {
  const { data: venta, error } = await supabase
    .from('ventas')
    .select(`
      *,
      clientes(nombre, codigo, telefono, direccion, rfc, colonia, cp, facturama_razon_social, contacto, zonas:zonas!zona_id(nombre)),
      vendedores:profiles!vendedor_id(nombre),
      venta_lineas(id, producto_id, descripcion, cantidad, precio_unitario, iva_monto, total, lote_id, lotes:lotes!lote_id(codigo, fecha_caducidad), productos(codigo, nombre, nombre_venta, nombre_ticket, precio_sugerido_publico))
    `)
    .eq('id', ventaId)
    .single();

  if (error || !venta) throw new Error('No se pudo cargar la venta');

  const { data: empresa } = await supabase.from('empresas').select('*').eq('id', empresaId).single();

  // Lotes asignados por línea de venta (multi-lote)
  const { data: lineaLotes } = await supabase
    .from('venta_linea_lotes')
    .select('venta_linea_id, cantidad, lotes:lotes!lote_id(codigo, fecha_caducidad)')
    .eq('venta_id', ventaId);
  const lotesPorLinea: Record<string, { codigo: string; caducidad?: string | null; cantidad: number }[]> = {};
  for (const ll of (lineaLotes ?? []) as any[]) {
    if (!ll.venta_linea_id || !ll.lotes) continue;
    const arr = lotesPorLinea[ll.venta_linea_id] ?? (lotesPorLinea[ll.venta_linea_id] = []);
    const ex = arr.find((x) => x.codigo === ll.lotes.codigo);
    if (ex) ex.cantidad += Number(ll.cantidad) || 0;
    else arr.push({ codigo: ll.lotes.codigo, caducidad: ll.lotes.fecha_caducidad, cantidad: Number(ll.cantidad) || 0 });
  }

  // Fetch delivered lot info per producto (union across all entregas of this pedido)
  const { data: entregas } = await supabase
    .from('entregas')
    .select('id')
    .eq('pedido_id', ventaId);
  const entregaIds = (entregas ?? []).map((e: any) => e.id);

  let lotesPorProducto: Record<string, { codigo: string; caducidad?: string | null; cantidad: number }[]> = {};
  if (entregaIds.length) {
    const { data: entLineas } = await supabase
      .from('entrega_lineas')
      .select('producto_id, lote_id, cantidad_entregada, lotes:lotes!lote_id(codigo, fecha_caducidad)')
      .in('entrega_id', entregaIds)
      .not('lote_id', 'is', null);
    for (const el of (entLineas ?? []) as any[]) {
      if (!el.producto_id || !el.lotes) continue;
      const arr = lotesPorProducto[el.producto_id] ?? (lotesPorProducto[el.producto_id] = []);
      const ex = arr.find((x) => x.codigo === el.lotes.codigo);
      if (ex) ex.cantidad += Number(el.cantidad_entregada) || 0;
      else arr.push({ codigo: el.lotes.codigo, caducidad: el.lotes.fecha_caducidad, cantidad: Number(el.cantidad_entregada) || 0 });
    }
  }

  // DIFASUR: siempre usar el logo oficial fijo, ignorando el logo de la empresa.
  const logo = await loadLogoBase64(difasurLogoAsset.url).catch(() => null);

  const clienteRow: any = (venta as any).clientes ?? {};
  const zonaNombre = clienteRow?.zonas?.nombre ?? '';

  const lineas: DifasurLine[] = ((venta as any).venta_lineas ?? [])
    .filter((l: any) => l.producto_id)
    .flatMap((l: any): DifasurLine[] => {
      const prod = l.productos ?? {};
      const cantidad = Number(l.cantidad) || 0;
      const precioUnit = Number(l.precio_unitario) || 0;
      const importe = Number(l.total) || cantidad * precioUnit;
      const ivaMonto = Number(l.iva_monto) || 0;
      const base = {
        codigo: prod.codigo ?? '',
        descripcion: prod.nombre_ticket || prod.nombre_venta || prod.nombre || l.descripcion || '',
        precio_publico: Number(prod.precio_sugerido_publico) || 0,
        precio_unitario: precioUnit,
      };

      // Lotes con cantidad: prioridad venta_linea_lotes → entrega_lineas → lote directo
      let lotesInfo = (lotesPorLinea[l.id] ?? []).filter((x) => x.cantidad > 0);
      if (!lotesInfo.length) lotesInfo = (lotesPorProducto[l.producto_id] ?? []).filter((x) => x.cantidad > 0);
      if (!lotesInfo.length && l.lotes?.codigo) {
        lotesInfo = [{ codigo: l.lotes.codigo, caducidad: l.lotes.fecha_caducidad, cantidad }];
      }

      if (lotesInfo.length <= 1) {
        const u = lotesInfo[0];
        return [{
          ...base,
          cantidad,
          lote: u?.codigo ?? '',
          caducidad: u?.caducidad ? fmtDate(u.caducidad) : '',
          iva_monto: ivaMonto,
          importe,
        }];
      }

      // Una línea por lote, prorrateando importe e IVA por cantidad loteada
      const totalLoteado = lotesInfo.reduce((s, x) => s + x.cantidad, 0) || 1;
      let accImporte = 0;
      let accIva = 0;
      return lotesInfo.map((x, i): DifasurLine => {
        const last = i === lotesInfo.length - 1;
        const imp = last ? importe - accImporte : Math.round((importe * x.cantidad / totalLoteado) * 100) / 100;
        const iva = last ? ivaMonto - accIva : Math.round((ivaMonto * x.cantidad / totalLoteado) * 100) / 100;
        accImporte += imp; accIva += iva;
        return {
          ...base,
          cantidad: x.cantidad,
          lote: x.codigo,
          caducidad: x.caducidad ? fmtDate(x.caducidad) : '',
          iva_monto: iva,
          importe: imp,
        };
      });
    });


  const blob = await generarDifasurNotaVentaPdf({
    empresa: {
      nombre: empresa?.nombre ?? '',
      razon_social: empresa?.razon_social,
      rfc: empresa?.rfc,
      direccion: empresa?.direccion,
      colonia: empresa?.colonia,
      ciudad: empresa?.ciudad,
      estado: empresa?.estado,
      cp: empresa?.cp,
      telefono: empresa?.telefono,
      email: empresa?.email,
      moneda: empresa?.moneda,
    },
    logoBase64: logo,
    venta: {
      folio: (venta as any).folio ?? '',
      fecha: (venta as any).fecha ?? '',
      subtotal: Number((venta as any).subtotal) || 0,
      iva_total: Number((venta as any).iva_total) || 0,
      total: Number((venta as any).total) || 0,
    },
    cliente: {
      nombre: clienteRow.nombre ?? '',
      codigo: clienteRow.codigo ?? '',
      razon_social: clienteRow.facturama_razon_social ?? clienteRow.nombre ?? '',
      nombre_negocio: clienteRow.contacto ?? '',
      domicilio: clienteRow.direccion ?? '',
      rfc: clienteRow.rfc ?? '',
      municipio: [clienteRow.colonia].filter(Boolean).join(', '),
      ruta: zonaNombre,
    },
    vendedor: (venta as any).vendedores?.nombre ?? '',
    lineas,
  });

  const folio = (venta as any).folio || ventaId.slice(0, 8);
  const clienteNombre = clienteRow.nombre ?? '';
  const sym = getCurrencyConfig(empresa?.moneda).symbol;
  const total = ((venta as any).total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 });
  return {
    blob,
    fileName: `${folio}.pdf`,
    caption: `📄 *Nota de venta ${folio}*\nCliente: ${clienteNombre}\n💰 Total: ${sym}${total}`,
  };
}
