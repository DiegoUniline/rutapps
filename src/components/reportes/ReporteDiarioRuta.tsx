import { useState, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Printer, FileText, Users, ShoppingCart, CreditCard, TrendingDown, XCircle, MapPin, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SearchableSelect from '@/components/SearchableSelect';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ReporteDiarioRuta() {
  const { empresa } = useAuth();
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [usuarioId, setUsuarioId] = useState<string>('');
  const printRef = useRef<HTMLDivElement>(null);

  // Load all active users (profiles) of the company
  const { data: usuarios } = useQuery<any[]>({
    queryKey: ['usuarios-list-report', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase as any).from('profiles').select('id, user_id, nombre').eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return data ?? [];
    },
  });

  // Use profile.id as value since vendedor_id in ventas/gastos/devoluciones = profile.id
  const usuarioOpts = (usuarios || []).map((u: any) => ({ value: u.id, label: u.nombre }));
  // Get the user_id for tables that use user_id (cobros, visitas)
  const selectedProfile = (usuarios || []).find((u: any) => u.id === usuarioId);
  const selectedUserId = selectedProfile?.user_id ?? usuarioId;

  const enabled = !!empresa?.id && !!usuarioId && !!fecha;

  const { data: ventas } = useQuery<any[]>({
    queryKey: ['rpt-diario-ventas', empresa?.id, usuarioId, fecha],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('ventas').select('id, folio, total, condicion_pago, status, cliente_id, clientes(nombre), venta_lineas(producto_id, cantidad, precio_unitario, total, productos(nombre, codigo))').eq('empresa_id', empresa!.id).eq('vendedor_id', usuarioId).eq('fecha', fecha).order('created_at');
      return data ?? [];
    },
  });

  const { data: cobros } = useQuery<any[]>({
    queryKey: ['rpt-diario-cobros', empresa?.id, usuarioId, fecha],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('cobros').select('id, monto, metodo_pago, referencia, clientes(nombre)').eq('empresa_id', empresa!.id).eq('user_id', selectedUserId).gte('fecha', fecha).lte('fecha', fecha).order('created_at');
      return data ?? [];
    },
  });

  const { data: gastos } = useQuery<any[]>({
    queryKey: ['rpt-diario-gastos', empresa?.id, usuarioId, fecha],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('gastos').select('id, monto, concepto, notas').eq('empresa_id', empresa!.id).eq('vendedor_id', usuarioId).eq('fecha', fecha).order('created_at');
      return data ?? [];
    },
  });

  const { data: devoluciones } = useQuery<any[]>({
    queryKey: ['rpt-diario-devs', empresa?.id, usuarioId, fecha],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('devoluciones').select('id, tipo, clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, productos(nombre, codigo))').eq('empresa_id', empresa!.id).eq('vendedor_id', usuarioId).eq('fecha', fecha);
      return data ?? [];
    },
  });

  // Visitas (clientes visitados, sin compra, etc.)
  const { data: visitas } = useQuery<any[]>({
    queryKey: ['rpt-diario-visitas', empresa?.id, usuarioId, fecha],
    enabled,
    queryFn: async () => {
      const { data } = await (supabase as any).from('visitas').select('id, tipo, motivo, notas, clientes(nombre)').eq('empresa_id', empresa!.id).eq('user_id', selectedUserId).eq('fecha', fecha).order('created_at');
      return data ?? [];
    },
  });

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

  // Unique clients visited (from ventas + visitas)
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
  const devLineas: { nombre: string; codigo: string; cantidad: number; motivo: string; cliente: string }[] = [];
  (devoluciones || []).forEach((d: any) => {
    (d.devolucion_lineas || []).forEach((l: any) => {
      devLineas.push({
        nombre: l.productos?.nombre || '—',
        codigo: l.productos?.codigo || '',
        cantidad: Number(l.cantidad),
        motivo: l.motivo || '—',
        cliente: (d as any).clientes?.nombre || '—',
      });
    });
  });

  const usuarioNombre = usuarios?.find((u: any) => u.user_id === usuarioId)?.nombre ?? '';

  const handlePrint = () => {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>Reporte Diario - ${usuarioNombre} - ${fecha}</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: Arial, sans-serif; font-size: 11px; color: #222; padding: 20px; }
      h1 { font-size: 16px; margin-bottom: 4px; }
      h2 { font-size: 13px; margin: 14px 0 6px; border-bottom: 1.5px solid #333; padding-bottom: 3px; }
      .meta { font-size: 11px; color: #555; margin-bottom: 12px; }
      .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 12px; }
      .summary-box { border: 1px solid #ccc; border-radius: 4px; padding: 6px 8px; text-align: center; }
      .summary-box .label { font-size: 9px; text-transform: uppercase; color: #888; }
      .summary-box .value { font-size: 15px; font-weight: bold; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
      th { text-align: left; font-size: 9px; text-transform: uppercase; color: #666; border-bottom: 1.5px solid #999; padding: 4px 6px; }
      td { padding: 3px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
      .text-right { text-align: right; }
      .text-center { text-align: center; }
      .font-bold { font-weight: bold; }
      .text-red { color: #dc2626; }
      .text-green { color: #16a34a; }
      .badge { display: inline-block; padding: 1px 6px; border-radius: 10px; font-size: 9px; font-weight: 600; }
      .badge-contado { background: #dcfce7; color: #166534; }
      .badge-credito { background: #dbeafe; color: #1e40af; }
      .badge-cancel { background: #fee2e2; color: #991b1b; text-decoration: line-through; }
      tfoot td { border-top: 1.5px solid #999; font-weight: bold; }
      @media print { body { padding: 10px; } }
    </style></head><body>`);
    win.document.write(content.innerHTML);
    win.document.write('</body></html>');
    win.document.close();
    win.print();
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <label className="text-[11px] font-medium text-muted-foreground uppercase block mb-1">Fecha</label>
          <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
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
        {enabled && (
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-3.5 w-3.5 mr-1" /> Imprimir reporte
          </Button>
        )}
      </div>

      {!enabled && (
        <div className="text-center py-12">
          <FileText className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Selecciona un usuario y fecha para generar el reporte diario</p>
        </div>
      )}

      {enabled && (
        <div ref={printRef} className="bg-card border border-border rounded-lg p-5 space-y-4">
          {/* Header */}
          <div>
            <h1 className="text-base font-bold text-foreground">Reporte diario de ruta</h1>
            <p className="text-xs text-muted-foreground">{usuarioNombre} — {fecha} — {empresa?.nombre}</p>
          </div>

          {/* Summary cards */}
          <div className="summary-grid grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Ventas totales</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalVentas)}</div>
              <div className="text-[9px] text-muted-foreground">{ventasActivas.length} ventas</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Contado</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalContado)}</div>
              <div className="text-[9px] text-muted-foreground">{ventasContado.length}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Crédito</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalCredito)}</div>
              <div className="text-[9px] text-muted-foreground">{ventasCredito.length}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Cobros</div>
              <div className="text-lg font-bold text-foreground">${fmt(totalCobros)}</div>
              <div className="text-[9px] text-muted-foreground">{(cobros || []).length}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Gastos</div>
              <div className="text-lg font-bold text-destructive">-${fmt(totalGastos)}</div>
              <div className="text-[9px] text-muted-foreground">{(gastos || []).length}</div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 text-center">
              <div className="text-[9px] text-muted-foreground uppercase">Clientes visitados</div>
              <div className="text-lg font-bold text-foreground">{clientesVisitados.size}</div>
            </div>
          </div>

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
                  <span key={m} className="text-[10px] bg-muted/50 rounded px-2 py-1">
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
                <RotateCcw className="h-3.5 w-3.5" /> Devoluciones ({devLineas.length} productos)
              </h2>
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                    <th className="text-left py-1.5">Producto</th>
                    <th className="text-left py-1.5">Cliente</th>
                    <th className="text-left py-1.5">Motivo</th>
                    <th className="text-right py-1.5">Cant.</th>
                  </tr>
                </thead>
                <tbody>
                  {devLineas.map((d, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1">{d.nombre} <span className="text-muted-foreground font-mono">{d.codigo}</span></td>
                      <td className="py-1">{d.cliente}</td>
                      <td className="py-1 text-muted-foreground">{d.motivo}</td>
                      <td className="py-1 text-right font-semibold">{d.cantidad}</td>
                    </tr>
                  ))}
                </tbody>
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
            <h2 className="text-xs font-bold text-muted-foreground uppercase mb-2">Resumen del día</h2>
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-[12px] max-w-md">
              <span className="text-muted-foreground">Ventas (contado):</span><span className="text-right font-semibold">${fmt(totalContado)}</span>
              <span className="text-muted-foreground">Ventas (crédito):</span><span className="text-right font-semibold">${fmt(totalCredito)}</span>
              <span className="text-muted-foreground">Cobros recibidos:</span><span className="text-right font-semibold">${fmt(totalCobros)}</span>
              <span className="text-muted-foreground">Gastos:</span><span className="text-right font-semibold text-destructive">-${fmt(totalGastos)}</span>
              <span className="text-muted-foreground">Canceladas:</span><span className="text-right font-semibold text-destructive">${fmt(totalCancelado)}</span>
              <span className="text-muted-foreground">Clientes visitados:</span><span className="text-right font-semibold">{clientesVisitados.size}</span>
              <span className="text-muted-foreground">Visitas sin compra:</span><span className="text-right font-semibold">{visitasSinCompra.length}</span>
              <span className="text-muted-foreground">Devoluciones:</span><span className="text-right font-semibold">{devLineas.length} productos</span>
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
