import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileText, ShoppingCart, CreditCard, TrendingDown, XCircle, MapPin, RotateCcw, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/SearchableSelect';
import { cn , todayLocal } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReporteDiarioRuta() {
  const { empresa } = useAuth();
  const today = todayLocal();
  const [fechaInicio, setFechaInicio] = useState(today);
  const [fechaFin, setFechaFin] = useState(today);
  const [usuarioId, setUsuarioId] = useState<string>('');
  const [incluirStock, setIncluirStock] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);

  const { data: usuarios } = useQuery<any[]>({
    queryKey: ['usuarios-list-report', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('profiles').select('id, user_id, nombre, vendedor_id').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return data ?? [];
    },
  });

  const usuarioOpts = (usuarios || []).map((u: any) => ({ value: u.id, label: u.nombre }));
  const selectedProfile = (usuarios || []).find((u: any) => u.id === usuarioId);
  const selectedUserId = selectedProfile?.user_id ?? usuarioId;
  const selectedVendedorId = selectedProfile?.vendedor_id ?? usuarioId;

  const enabled = !!empresa?.id && !!usuarioId && !!fechaInicio && !!fechaFin;

  // --- Ventas ---
  const { data: ventas } = useQuery<any[]>({
    queryKey: ['rpt-diario-ventas', empresa?.id, selectedVendedorId, fechaInicio, fechaFin],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('ventas')
        .select('id, folio, total, condicion_pago, status, cliente_id, clientes(nombre), venta_lineas(producto_id, cantidad, precio_unitario, total, productos(nombre, codigo))')
        .eq('empresa_id', empresa!.id).eq('vendedor_id', selectedVendedorId)
        .gte('fecha', fechaInicio).lte('fecha', fechaFin)
        .order('created_at');
      return data ?? [];
    },
  });

  // --- Cobros ---
  const { data: cobros } = useQuery<any[]>({
    queryKey: ['rpt-diario-cobros', empresa?.id, usuarioId, fechaInicio, fechaFin],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('cobros')
        .select('id, monto, metodo_pago, referencia, clientes(nombre)')
        .eq('empresa_id', empresa!.id).eq('user_id', selectedUserId)
        .neq('status', 'cancelado')
        .gte('fecha', fechaInicio).lte('fecha', fechaFin)
        .order('created_at');
      return data ?? [];
    },
  });

  // --- Gastos ---
  const { data: gastos } = useQuery<any[]>({
    queryKey: ['rpt-diario-gastos', empresa?.id, selectedVendedorId, fechaInicio, fechaFin],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('gastos')
        .select('id, monto, concepto, notas')
        .eq('empresa_id', empresa!.id).eq('vendedor_id', selectedVendedorId)
        .gte('fecha', fechaInicio).lte('fecha', fechaFin)
        .order('created_at');
      return data ?? [];
    },
  });

  // --- Devoluciones ---
  const { data: devoluciones } = useQuery<any[]>({
    queryKey: ['rpt-diario-devs', empresa?.id, selectedVendedorId, fechaInicio, fechaFin],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('devoluciones')
        .select('id, tipo, clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre, codigo))')
        .eq('empresa_id', empresa!.id).eq('vendedor_id', selectedVendedorId)
        .gte('fecha', fechaInicio).lte('fecha', fechaFin);
      return data ?? [];
    },
  });

  // --- Visitas ---
  const { data: visitas } = useQuery<any[]>({
    queryKey: ['rpt-diario-visitas', empresa?.id, usuarioId, fechaInicio, fechaFin],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('visitas')
        .select('id, tipo, motivo, notas, clientes(nombre)')
        .eq('empresa_id', empresa!.id).eq('user_id', selectedUserId)
        .gte('fecha', fechaInicio).lte('fecha', fechaFin)
        .order('created_at');
      return data ?? [];
    },
  });

  // --- Stock del almacén asignado al vendedor ---
  const { data: rptVendedorAlmacen } = useQuery<any>({
    queryKey: ['rpt-vendedor-almacen', usuarioId],
    enabled: enabled && incluirStock,
    queryFn: async () => {
      const { data } = await (supabase as any).from('profiles').select('almacen_id, almacenes(nombre)').eq('id', usuarioId).maybeSingle();
      return data;
    },
  });

  const { data: rptStockAlmacen } = useQuery<any[]>({
    queryKey: ['rpt-stock-almacen', empresa?.id, rptVendedorAlmacen?.almacen_id],
    enabled: !!rptVendedorAlmacen?.almacen_id && incluirStock,
    queryFn: async () => {
      const { data, error } = await (supabase as any).from('stock_almacen')
        .select('producto_id, cantidad, productos(nombre, codigo)')
        .eq('almacen_id', rptVendedorAlmacen!.almacen_id!)
        .gt('cantidad', 0)
        .order('producto_id');
      if (error) throw error;
      return data ?? [];
    },
  });

  // --- Computed data ---
  const ventasActivas = (ventas || []).filter((v: any) => v.status !== 'cancelado');
  const ventasCanceladas = (ventas || []).filter((v: any) => v.status === 'cancelado');
  const ventasContado = ventasActivas.filter((v: any) => v.condicion_pago === 'contado');
  const ventasCredito = ventasActivas.filter((v: any) => v.condicion_pago === 'credito');

  const totalContado = ventasContado.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalCredito = ventasCredito.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalVentas = ventasActivas.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalCancelado = ventasCanceladas.reduce((s: number, v: any) => s + (Number(v.total) || 0), 0);
  const totalCobros = (cobros || []).reduce((s: number, c: any) => s + (Number(c.monto) || 0), 0);
  const totalGastos = (gastos || []).reduce((s: number, g: any) => s + (Number(g.monto) || 0), 0);

  const clientesVisitados = new Set([
    ...ventasActivas.map((v: any) => v.cliente_id).filter(Boolean),
    ...(visitas || []).map((v: any) => v.clientes?.nombre).filter(Boolean),
  ]);
  const visitasSinCompra = (visitas || []).filter((v: any) => v.tipo === 'sin_compra');

  // Products sold aggregate
  const prodMap: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};
  ventasActivas.forEach((v: any) => {
    (v.venta_lineas || []).forEach((l: any) => {
      const pid = l.producto_id;
      if (!pid) return;
      if (!prodMap[pid]) prodMap[pid] = { nombre: l.productos?.nombre || '—', codigo: l.productos?.codigo || '', cantidad: 0, total: 0 };
      prodMap[pid].cantidad += Number(l.cantidad) || 0;
      prodMap[pid].total += Number(l.total) || 0;
    });
  });
  const productosArr = Object.values(prodMap).sort((a, b) => b.total - a.total);

  // Cobros by method
  const cobrosPorMetodo: Record<string, number> = {};
  (cobros || []).forEach((c: any) => {
    const m = c.metodo_pago || 'efectivo';
    cobrosPorMetodo[m] = (cobrosPorMetodo[m] || 0) + Number(c.monto);
  });

  // Dev lines
  const ACCION_LABELS: Record<string, string> = { reposicion: 'Reposición', nota_credito: 'Nota crédito', descuento_venta: 'Desc. venta', devolucion_dinero: 'Dev. dinero' };
  const devLineas: { nombre: string; codigo: string; cantidad: number; motivo: string; accion: string; monto_credito: number; cliente: string }[] = [];
  (devoluciones || []).forEach((d: any) => {
    (d.devolucion_lineas || []).forEach((l: any) => {
      devLineas.push({
        nombre: l.productos?.nombre || '—',
        codigo: l.productos?.codigo || '',
        cantidad: Number(l.cantidad),
        motivo: l.motivo || '—',
        accion: l.accion || 'reposicion',
        monto_credito: Number(l.monto_credito) || 0,
        cliente: (d as any).clientes?.nombre || '—',
      });
    });
  });
  const totalDevUnidades = devLineas.reduce((s, d) => s + d.cantidad, 0);
  const totalDevCredito = devLineas.reduce((s, d) => s + d.monto_credito, 0);

  const rptAlmacenNombre = rptVendedorAlmacen?.almacenes?.nombre || 'Almacén asignado';
  const stockItems = (rptStockAlmacen || []).map((s: any) => ({
    nombre: s.productos?.nombre || '—',
    codigo: s.productos?.codigo || '',
    cantidad: Number(s.cantidad) || 0,
  })).sort((a: any, b: any) => a.nombre.localeCompare(b.nombre));

  const usuarioNombre = usuarios?.find((u: any) => u.id === usuarioId)?.nombre ?? '';
  const fechaLabel = fechaInicio === fechaFin ? fechaInicio : `${fechaInicio} al ${fechaFin}`;

  const handlePrint = () => {
    const win = window.open('', '_blank');
    if (!win) return;

    // --- Build sections ---
    const sec = (title: string, html: string) => html ? `<div class="section"><h2>${title}</h2>${html}</div>` : '';

    const tableRow = (cells: string[], tag = 'td') => `<tr>${cells.map(c => `<${tag}>${c}</${tag}>`).join('')}</tr>`;

    const makeTable = (headers: string[], rows: string[][], footer?: string[]) => {
      const aligns = headers.map(h => /total|monto|cant|precio|exist/i.test(h) ? 'right' : 'left');
      const hRow = headers.map((h, i) => `<th style="text-align:${aligns[i]}">${h}</th>`).join('');
      const bRows = rows.map(r => '<tr>' + r.map((c, i) => `<td style="text-align:${aligns[i]}">${c}</td>`).join('') + '</tr>').join('');
      const fRow = footer ? '<tfoot><tr>' + footer.map((c, i) => `<td style="text-align:${aligns[i]}">${c}</td>`).join('') + '</tr></tfoot>' : '';
      return `<table><thead><tr>${hRow}</tr></thead><tbody>${bRows}</tbody>${fRow}</table>`;
    };

    // Summary grid
    const kpi = (label: string, value: string, sub?: string) =>
      `<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;

    const summaryHtml = `<div class="kpi-grid">
      ${kpi('Ventas totales', `$ ${fmt(totalVentas)}`, `${ventasActivas.length} ventas`)}
      ${kpi('Contado', `$ ${fmt(totalContado)}`, `${ventasContado.length}`)}
      ${kpi('Crédito', `$ ${fmt(totalCredito)}`, `${ventasCredito.length}`)}
      ${kpi('Cobros', `$ ${fmt(totalCobros)}`, `${(cobros || []).length}`)}
      ${kpi('Gastos', `- $ ${fmt(totalGastos)}`, `${(gastos || []).length}`)}
      ${kpi('Devoluciones', `${totalDevUnidades} uds`, `${(devoluciones || []).length} registros`)}
      ${kpi('Clientes visitados', `${clientesVisitados.size}`)}
    </div>`;

    // Stock
    const stockHtml = incluirStock && stockItems.length > 0
      ? sec(`Stock — ${rptAlmacenNombre}`, makeTable(
          ['Código', 'Producto', 'Existencia'],
          stockItems.map((p: any) => [p.codigo, p.nombre, String(p.cantidad)])
        ))
      : '';

    // Ventas
    const ventasHtml = ventasActivas.length > 0
      ? sec(`Ventas (${ventasActivas.length})`, makeTable(
          ['Folio', 'Cliente', 'Pago', 'Total'],
          ventasActivas.map((v: any) => [v.folio ?? '—', v.clientes?.nombre ?? '—', v.condicion_pago, `$ ${fmt(Number(v.total))}`]),
          ['', '', 'Total', `$ ${fmt(totalVentas)}`]
        ))
      : '';

    // Canceladas
    const cancelHtml = ventasCanceladas.length > 0
      ? sec(`Canceladas (${ventasCanceladas.length})`, makeTable(
          ['Folio', 'Cliente', 'Total'],
          ventasCanceladas.map((v: any) => [v.folio ?? '—', v.clientes?.nombre ?? '—', `$ ${fmt(Number(v.total))}`]),
          ['', 'Total cancelado', `$ ${fmt(totalCancelado)}`]
        ))
      : '';

    // Productos vendidos
    const prodsHtml = productosArr.length > 0
      ? sec(`Productos vendidos (${productosArr.length})`, makeTable(
          ['Código', 'Producto', 'Cantidad', 'Total'],
          productosArr.map(p => [p.codigo, p.nombre, String(p.cantidad), `$ ${fmt(p.total)}`])
        ))
      : '';

    // Cobros
    const cobrosMetodoHtml = Object.entries(cobrosPorMetodo).map(([m, t]) => `<span class="chip">${m}: $ ${fmt(t)}</span>`).join(' ');
    const cobrosHtml = (cobros || []).length > 0
      ? sec(`Cobros (${(cobros || []).length})`, `<div class="chips">${cobrosMetodoHtml}</div>` + makeTable(
          ['Cliente', 'Método', 'Referencia', 'Monto'],
          (cobros || []).map((c: any) => [c.clientes?.nombre ?? '—', c.metodo_pago, c.referencia || '—', `$ ${fmt(Number(c.monto))}`]),
          ['', '', 'Total cobros', `$ ${fmt(totalCobros)}`]
        ))
      : '';

    // Gastos
    const gastosHtml = (gastos || []).length > 0
      ? sec(`Gastos (${(gastos || []).length})`, makeTable(
          ['Concepto', 'Notas', 'Monto'],
          (gastos || []).map((g: any) => [g.concepto, g.notas || '—', `- $ ${fmt(Number(g.monto))}`]),
          ['', 'Total gastos', `- $ ${fmt(totalGastos)}`]
        ))
      : '';

    // Devoluciones
    const devsHtml = devLineas.length > 0
      ? sec(`Devoluciones (${totalDevUnidades} uds — ${(devoluciones || []).length} registros)`, makeTable(
          ['Producto', 'Cliente', 'Motivo', 'Acción', 'Cant.'],
          devLineas.map(d => [`${d.nombre} ${d.codigo}`, d.cliente, d.motivo.replace(/_/g, ' '), ACCION_LABELS[d.accion] || d.accion, String(d.cantidad)]),
          totalDevCredito > 0 ? ['', '', '', 'Total crédito', `$ ${fmt(totalDevCredito)}`] : undefined
        ))
      : '';

    // Visitas sin compra
    const visitasHtml = visitasSinCompra.length > 0
      ? sec(`Visitas sin compra (${visitasSinCompra.length})`, makeTable(
          ['Cliente', 'Motivo', 'Notas'],
          visitasSinCompra.map((v: any) => [v.clientes?.nombre ?? '—', v.motivo || '—', v.notas || '—'])
        ))
      : '';

    // Resumen final
    const resumenRow = (label: string, value: string) => `<tr><td class="res-label">${label}</td><td class="res-value">${value}</td></tr>`;
    const resumenHtml = `<div class="section"><h2>Resumen del período</h2><table class="resumen">
      ${resumenRow('Ventas (contado)', `$ ${fmt(totalContado)}`)}
      ${resumenRow('Ventas (crédito)', `$ ${fmt(totalCredito)}`)}
      ${resumenRow('Cobros recibidos', `$ ${fmt(totalCobros)}`)}
      ${resumenRow('Gastos', `- $ ${fmt(totalGastos)}`)}
      ${resumenRow('Canceladas', `$ ${fmt(totalCancelado)}`)}
      ${resumenRow('Clientes visitados', `${clientesVisitados.size}`)}
      ${resumenRow('Visitas sin compra', `${visitasSinCompra.length}`)}
      ${resumenRow('Devoluciones', `${totalDevUnidades} uds`)}
      ${totalDevCredito > 0 ? resumenRow('Crédito por devol.', `- $ ${fmt(totalDevCredito)}`) : ''}
      <tr class="res-total"><td>Efectivo esperado</td><td>$ ${fmt(totalContado + (cobrosPorMetodo['efectivo'] || 0) - totalGastos)}</td></tr>
    </table></div>`;

    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte - ${usuarioNombre} - ${fechaLabel}</title>
    <style>
      @page { size: letter; margin: 15mm 12mm; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif; font-size: 10px; color: #1a1a1a; line-height: 1.5; }

      /* Header */
      .doc-header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #e0e0e0; margin-bottom: 20px; }
      .company-name { font-size: 14px; font-weight: 700; color: #1a1a1a; }
      .company-detail { font-size: 9px; color: #777; line-height: 1.6; }
      .doc-title { font-size: 20px; font-weight: 700; color: #1a1a1a; text-align: right; }
      .doc-meta { font-size: 10px; color: #777; text-align: right; margin-top: 4px; }

      /* KPI grid */
      .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
      .kpi { border: 1px solid #e0e0e0; border-radius: 3px; padding: 10px 12px; text-align: center; }
      .kpi-label { font-size: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #888; font-weight: 600; margin-bottom: 4px; }
      .kpi-value { font-size: 16px; font-weight: 700; color: #1a1a1a; }
      .kpi-sub { font-size: 8px; color: #aaa; margin-top: 2px; }

      /* Sections */
      .section { margin-bottom: 22px; }
      .section h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #333; border-bottom: 2px solid #e0e0e0; padding-bottom: 6px; margin-bottom: 10px; }

      /* Tables */
      table { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
      thead th { font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; color: #555; background: #f7f7f7; border-bottom: 2px solid #e0e0e0; padding: 7px 10px; }
      tbody td { padding: 6px 10px; border-bottom: 1px solid #eee; font-size: 10px; vertical-align: top; }
      tbody tr:last-child td { border-bottom: none; }
      tfoot td { border-top: 2px solid #e0e0e0; font-weight: 700; padding: 8px 10px; font-size: 10px; background: #fafafa; }

      /* Chips */
      .chips { margin-bottom: 10px; }
      .chip { display: inline-block; font-size: 9px; background: #f0f0f0; border-radius: 3px; padding: 3px 8px; margin-right: 6px; color: #555; font-weight: 600; }

      /* Resumen */
      table.resumen { width: 320px; }
      table.resumen td { padding: 4px 0; border: none; font-size: 11px; }
      table.resumen .res-label { color: #777; font-weight: 500; }
      table.resumen .res-value { text-align: right; font-weight: 600; }
      table.resumen .res-total td { border-top: 2px solid #1a1a1a; font-weight: 700; font-size: 12px; padding-top: 8px; margin-top: 4px; }

      /* Footer */
      .doc-footer { margin-top: 32px; padding-top: 10px; border-top: 1px solid #e0e0e0; font-size: 8px; color: #aaa; text-align: center; }

      @media print { body { padding: 0; } }
    </style></head><body>
      <div class="doc-header">
        <div>
          <div class="company-name">${empresa?.razon_social || empresa?.nombre || ''}</div>
          ${empresa?.rfc ? `<div class="company-detail">${empresa.rfc}</div>` : ''}
          ${empresa?.direccion ? `<div class="company-detail">${[empresa.direccion, empresa.colonia, empresa.ciudad, empresa.estado, empresa.cp].filter(Boolean).join(', ')}</div>` : ''}
          ${empresa?.telefono ? `<div class="company-detail">Tel: ${empresa.telefono}</div>` : ''}
        </div>
        <div>
          <div class="doc-title">Reporte de Ruta</div>
          <div class="doc-meta">${usuarioNombre}</div>
          <div class="doc-meta">${fechaLabel}</div>
        </div>
      </div>
      ${summaryHtml}
      ${stockHtml}
      ${ventasHtml}
      ${cancelHtml}
      ${prodsHtml}
      ${cobrosHtml}
      ${gastosHtml}
      ${devsHtml}
      ${visitasHtml}
      ${resumenHtml}
      <div class="doc-footer">Este documento es una representación impresa. Generado por Rutapp · ${new Date().toLocaleString('es-MX')}</div>
    </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 300);
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Fecha inicio</label>
          <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
        </div>
        <div className="w-40">
          <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Fecha fin</label>
          <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
        </div>
        <div className="w-56">
          <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Usuario</label>
          <SearchableSelect
            options={usuarioOpts}
            value={usuarioId}
            onChange={val => setUsuarioId(val)}
            placeholder="Selecciona usuario..."
          />
        </div>
        <div className="flex items-center gap-2 pb-1">
          <Switch id="incluir-stock" checked={incluirStock} onCheckedChange={setIncluirStock} />
          <Label htmlFor="incluir-stock" className="text-xs cursor-pointer">Incluir stock en almacén</Label>
        </div>
        {enabled && (
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir reporte
          </Button>
        )}
      </div>

      {!enabled && (
        <div className="text-center py-12">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Selecciona un usuario y rango de fechas para generar el reporte</p>
        </div>
      )}

      {enabled && (
        <div ref={printRef} className="bg-card border border-border rounded-lg p-5 space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-base font-bold text-foreground">Reporte de ruta</h1>
            <p className="text-xs text-muted-foreground">{usuarioNombre} — {fechaLabel} — {empresa?.nombre}</p>
          </div>

          {/* Summary cards */}
          <div className="summary-grid grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Ventas totales</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalVentas)}</div>
              <div className="text-[9px] text-muted-foreground">{ventasActivas.length} ventas</div>
            </div>
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Contado</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalContado)}</div>
              <div className="text-[9px] text-muted-foreground">{ventasContado.length}</div>
            </div>
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Crédito</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalCredito)}</div>
              <div className="text-[9px] text-muted-foreground">{ventasCredito.length}</div>
            </div>
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Cobros</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalCobros)}</div>
              <div className="text-[9px] text-muted-foreground">{(cobros || []).length}</div>
            </div>
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Gastos</div>
              <div className="text-lg font-bold text-destructive">-${fmt(totalGastos)}</div>
              <div className="text-[9px] text-muted-foreground">{(gastos || []).length}</div>
            </div>
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Devoluciones</div>
              <div className="text-lg font-bold text-foreground">{totalDevUnidades} uds</div>
              <div className="text-[9px] text-muted-foreground">{(devoluciones || []).length} devol.</div>
            </div>
            <div className="bg-card rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Clientes visitados</div>
              <div className="text-lg font-bold text-foreground">{clientesVisitados.size}</div>
            </div>
          </div>

          {/* Stock en almacén */}
          {incluirStock && stockItems.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
                <Package className="h-3.5 w-3.5" /> Stock — {rptAlmacenNombre}
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Código</th>
                    <th className="text-left py-1.5">Producto</th>
                    <th className="text-right py-1.5">Existencia</th>
                  </tr>
                </thead>
                <tbody>
                  {stockItems.map((p: any, i: number) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1 font-mono text-muted-foreground">{p.codigo}</td>
                      <td className="py-1">{p.nombre}</td>
                      <td className="py-1 text-right font-semibold">{p.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {incluirStock && stockItems.length === 0 && (
            <div className="text-[11px] text-muted-foreground italic py-2">
              No se encontró stock en el almacén asignado a este usuario.
            </div>
          )}

          {/* Ventas activas */}
          <div>
            <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
              <ShoppingCart className="h-3.5 w-3.5" /> Ventas ({ventasActivas.length})
            </h2>
            {ventasActivas.length > 0 ? (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Folio</th>
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-left py-1.5">Pago</th>
                    <th className="text-right py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasActivas.map((v: any) => (
                    <tr key={v.id} className="border-b border-border/50">
                      <td className="py-1 font-mono">{v.folio ?? '—'}</td>
                      <td className="py-1">{v.clientes?.nombre ?? '—'}</td>
                      <td className="py-1">
                        <span className={cn("text-[9px] px-1.5 py-0.5 rounded-full font-semibold",
                          v.condicion_pago === 'contado' ? "bg-green-100 text-green-700" : "bg-blue-100 text-blue-700"
                        )}>{v.condicion_pago}</span>
                      </td>
                      <td className="py-1 text-right font-semibold">${fmt(Number(v.total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-bold">
                    <td colSpan={3} className="py-1.5 text-right text-muted-foreground text-[10px]">Total:</td>
                    <td className="py-1.5 text-right">${fmt(totalVentas)}</td>
                  </tr>
                </tfoot>
              </table>
            ) : <p className="text-[11px] text-muted-foreground">Sin ventas</p>}
          </div>

          {/* Canceladas */}
          {ventasCanceladas.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-destructive uppercase flex items-center gap-1.5 mb-2 border-b border-destructive/30 pb-1">
                <XCircle className="h-3.5 w-3.5" /> Canceladas ({ventasCanceladas.length})
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Folio</th>
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-right py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {ventasCanceladas.map((v: any) => (
                    <tr key={v.id} className="border-b border-border/50">
                      <td className="py-1 font-mono">{v.folio ?? '—'}</td>
                      <td className="py-1">{v.clientes?.nombre ?? '—'}</td>
                      <td className="py-1 text-right font-semibold text-destructive line-through">${fmt(Number(v.total))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-bold">
                    <td colSpan={2} className="py-1.5 text-right text-muted-foreground text-[10px]">Total cancelado:</td>
                    <td className="py-1.5 text-right text-destructive">${fmt(totalCancelado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Productos vendidos */}
          {productosArr.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
                Productos vendidos ({productosArr.length})
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Código</th>
                    <th className="text-left py-1.5">Producto</th>
                    <th className="text-right py-1.5">Cant.</th>
                    <th className="text-right py-1.5">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {productosArr.map((p, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1 font-mono text-muted-foreground">{p.codigo}</td>
                      <td className="py-1">{p.nombre}</td>
                      <td className="py-1 text-right">{p.cantidad}</td>
                      <td className="py-1 text-right font-semibold">${fmt(p.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Cobros */}
          {(cobros || []).length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
                <CreditCard className="h-3.5 w-3.5" /> Cobros ({(cobros || []).length})
              </h2>
              <div className="flex flex-wrap gap-2 mb-2">
                {Object.entries(cobrosPorMetodo).map(([m, t]) => (
                  <span key={m} className="text-[10px] bg-card rounded px-2 py-1">
                    <span className="text-muted-foreground capitalize">{m}:</span> <span className="font-bold">${fmt(t)}</span>
                  </span>
                ))}
              </div>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-left py-1.5">Método</th>
                    <th className="text-left py-1.5">Referencia</th>
                    <th className="text-right py-1.5">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(cobros || []).map((c: any) => (
                    <tr key={c.id} className="border-b border-border/50">
                      <td className="py-1">{c.clientes?.nombre ?? '—'}</td>
                      <td className="py-1 capitalize">{c.metodo_pago}</td>
                      <td className="py-1 text-muted-foreground font-mono">{c.referencia || '—'}</td>
                      <td className="py-1 text-right font-semibold">${fmt(Number(c.monto))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-bold">
                    <td colSpan={3} className="py-1.5 text-right text-muted-foreground text-[10px]">Total cobros:</td>
                    <td className="py-1.5 text-right">${fmt(totalCobros)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Gastos */}
          {(gastos || []).length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
                <TrendingDown className="h-3.5 w-3.5" /> Gastos ({(gastos || []).length})
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Concepto</th>
                    <th className="text-left py-1.5">Notas</th>
                    <th className="text-right py-1.5">Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {(gastos || []).map((g: any) => (
                    <tr key={g.id} className="border-b border-border/50">
                      <td className="py-1">{g.concepto}</td>
                      <td className="py-1 text-muted-foreground">{g.notas || '—'}</td>
                      <td className="py-1 text-right font-semibold text-destructive">-${fmt(Number(g.monto))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border font-bold">
                    <td colSpan={2} className="py-1.5 text-right text-muted-foreground text-[10px]">Total gastos:</td>
                    <td className="py-1.5 text-right text-destructive">-${fmt(totalGastos)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Devoluciones */}
          {devLineas.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
                <RotateCcw className="h-3.5 w-3.5" /> Devoluciones ({totalDevUnidades} uds en {(devoluciones || []).length} registros)
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Producto</th>
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-left py-1.5">Motivo</th>
                    <th className="text-left py-1.5">Acción</th>
                    <th className="text-right py-1.5">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {devLineas.map((d, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1">{d.nombre} <span className="text-muted-foreground font-mono">{d.codigo}</span></td>
                      <td className="py-1">{d.cliente}</td>
                      <td className="py-1 text-muted-foreground capitalize">{d.motivo.replace(/_/g, ' ')}</td>
                      <td className="py-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-accent text-foreground">
                          {ACCION_LABELS[d.accion] || d.accion}
                        </span>
                      </td>
                      <td className="py-1 text-right font-semibold">{d.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
                {totalDevCredito > 0 && (
                  <tfoot>
                    <tr className="border-t border-border font-bold">
                      <td colSpan={4} className="py-1.5 text-right text-muted-foreground text-[10px]">Total crédito/descuento:</td>
                      <td className="py-1.5 text-right text-destructive">${fmt(totalDevCredito)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}

          {/* Visitas sin compra */}
          {visitasSinCompra.length > 0 && (
            <div>
              <h2 className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-1.5 mb-2 border-b border-border pb-1">
                <MapPin className="h-3.5 w-3.5" /> Visitas sin compra ({visitasSinCompra.length})
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-left py-1.5">Motivo</th>
                    <th className="text-left py-1.5">Notas</th>
                  </tr>
                </thead>
                <tbody>
                  {visitasSinCompra.map((v: any, i: number) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1">{v.clientes?.nombre ?? '—'}</td>
                      <td className="py-1 text-muted-foreground">{v.motivo || '—'}</td>
                      <td className="py-1 text-muted-foreground">{v.notas || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Resumen final */}
          <div className="border-t border-border pt-3 mt-4">
            <h2 className="text-xs font-bold text-muted-foreground uppercase mb-2">Resumen del período</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[12px] max-w-md">
              <span className="text-muted-foreground">Ventas (contado):</span><span className="text-right font-semibold">${fmt(totalContado)}</span>
              <span className="text-muted-foreground">Ventas (crédito):</span><span className="text-right font-semibold">${fmt(totalCredito)}</span>
              <span className="text-muted-foreground">Cobros recibidos:</span><span className="text-right font-semibold">${fmt(totalCobros)}</span>
              <span className="text-muted-foreground">Gastos:</span><span className="text-right font-semibold text-destructive">-${fmt(totalGastos)}</span>
              <span className="text-muted-foreground">Canceladas:</span><span className="text-right font-semibold text-destructive">${fmt(totalCancelado)}</span>
              <span className="text-muted-foreground">Clientes visitados:</span><span className="text-right font-semibold">{clientesVisitados.size}</span>
              <span className="text-muted-foreground">Visitas sin compra:</span><span className="text-right font-semibold">{visitasSinCompra.length}</span>
              <span className="text-muted-foreground">Devoluciones:</span><span className="text-right font-semibold">{totalDevUnidades} uds</span>
              {totalDevCredito > 0 && (
                <><span className="text-muted-foreground">Crédito por devol.:</span><span className="text-right font-semibold text-destructive">-${fmt(totalDevCredito)}</span></>
              )}
              <div className="col-span-2 border-t border-border mt-1 pt-1 flex justify-between font-bold">
                <span>Efectivo esperado:</span>
                <span>${fmt(totalContado + (cobrosPorMetodo['efectivo'] || 0) - totalGastos)}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
