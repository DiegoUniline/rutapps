import { useMemo, useState } from 'react';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, AlertTriangle, ShoppingCart, Calendar as CalendarIcon, CheckCircle2, Loader2, FileDown, FileSpreadsheet } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useProveedores } from '@/hooks/useData';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { fmtMoney } from '@/lib/currency';
import { todayLocal } from '@/lib/utils';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import PedidosTabs from '@/components/PedidosTabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

interface VentaLite {
  id: string;
  folio: string | null;
  fecha_entrega: string | null;
  fecha: string;
  status: string;
  empresa_id: string;
}
interface LineaRow {
  producto_id: string;
  cantidad: number;
  venta_id: string;
}
interface EntregaLineaRow {
  producto_id: string;
  cantidad_entregada: number;
  entregas: { pedido_id: string | null; status: string } | null;
}
interface ProductoRow {
  id: string;
  codigo: string | null;
  nombre: string;
  cantidad: number | null;
  costo: number | null;
  proveedor_preferido_id: string | null;
  unidad_id: string | null;
}

function addDays(iso: string, n: number) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function ConcentradoSurtidoPage() {
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const { data: proveedores } = useProveedores();

  const today = todayLocal();
  const [desde, setDesde] = useState(today);
  const [hasta, setHasta] = useState(addDays(today, 1));
  const [generando, setGenerando] = useState(false);

  const STATUS_OPTIONS: { value: string; label: string }[] = [
    { value: 'borrador', label: 'Borrador' },
    { value: 'confirmado', label: 'Confirmado / Por surtir' },
    { value: 'entregado', label: 'Surtido / Entregado' },
    { value: 'facturado', label: 'Facturado' },
    { value: 'cancelado', label: 'Cancelado' },
  ];
  const [statusFilter, setStatusFilter] = useState<string[]>(['confirmado']);
  const toggleStatus = (v: string) => {
    setStatusFilter(prev => prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]);
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['concentrado-surtido', empresa?.id, desde, hasta, statusFilter.join(',')],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // 1) Pedidos en rango por fecha_entrega
      const statuses = statusFilter.length > 0
        ? statusFilter
        : ['confirmado', 'entregado', 'facturado'];
      const ventas = await fetchAllPages<VentaLite>((from, to) =>
        supabase.from('ventas')
          .select('id, folio, fecha_entrega, fecha, status, empresa_id')
          .eq('empresa_id', empresa!.id)
          .gte('fecha_entrega', desde)
          .lte('fecha_entrega', hasta)
          .in('status', statuses as any)
          .range(from, to)
      );
      const ventaIds = ventas.map(v => v.id);
      if (ventaIds.length === 0) {
        return { rows: [] as Row[], ventas: [] as VentaLite[] };
      }

      // 2) Líneas de esas ventas
      const lineas = await fetchAllPages<LineaRow>((from, to) =>
        supabase.from('venta_lineas')
          .select('producto_id, cantidad, venta_id')
          .in('venta_id', ventaIds)
          .range(from, to)
      );

      // 3) Entregas ya hechas para esos pedidos (descontar)
      const entregaLineas = await fetchAllPages<EntregaLineaRow>((from, to) =>
        supabase.from('entrega_lineas')
          .select('producto_id, cantidad_entregada, entregas!inner(pedido_id, status)')
          .in('entregas.pedido_id', ventaIds)
          .eq('entregas.status', 'hecho' as any)
          .range(from, to)
      );

      // 4) Productos involucrados
      const productoIds = Array.from(new Set(lineas.map(l => l.producto_id)));
      const productos = productoIds.length === 0 ? [] : await fetchAllPages<ProductoRow>((from, to) =>
        supabase.from('productos')
          .select('id, codigo, nombre, cantidad, costo, proveedor_preferido_id, unidad_id')
          .in('id', productoIds)
          .range(from, to)
      );
      const prodMap = new Map(productos.map(p => [p.id, p]));

      // Agregaciones
      const requerido = new Map<string, number>();
      for (const l of lineas) requerido.set(l.producto_id, (requerido.get(l.producto_id) ?? 0) + Number(l.cantidad || 0));

      const entregado = new Map<string, number>();
      for (const el of entregaLineas) entregado.set(el.producto_id, (entregado.get(el.producto_id) ?? 0) + Number(el.cantidad_entregada || 0));

      const rows: Row[] = productoIds.map(pid => {
        const p = prodMap.get(pid);
        const req = requerido.get(pid) ?? 0;
        const ent = entregado.get(pid) ?? 0;
        const pend = Math.max(0, req - ent);
        const stock = Number(p?.cantidad ?? 0);
        const faltante = Math.max(0, pend - stock);
        return {
          producto_id: pid,
          codigo: p?.codigo ?? '—',
          nombre: p?.nombre ?? '—',
          requerido: req,
          entregado: ent,
          pendiente: pend,
          stock,
          faltante,
          costo: Number(p?.costo ?? 0),
          proveedor_preferido_id: p?.proveedor_preferido_id ?? null,
        };
      }).filter(r => r.pendiente > 0)
        .sort((a, b) => (b.faltante - a.faltante) || a.nombre.localeCompare(b.nombre));

      return { rows, ventas };
    },
  });

  const rows = data?.rows ?? [];
  const faltantes = useMemo(() => rows.filter(r => r.faltante > 0), [rows]);

  const totales = useMemo(() => ({
    pedidos: data?.ventas.length ?? 0,
    productos: rows.length,
    conFaltante: faltantes.length,
    costoFaltante: faltantes.reduce((s, r) => s + r.faltante * r.costo, 0),
  }), [rows, faltantes, data?.ventas.length]);

  // ── Export ───────────────────────────────────────────────────
  const exportColumns: ExportColumn[] = [
    { key: 'codigo', header: 'Código', width: 16 },
    { key: 'nombre', header: 'Producto', width: 38 },
    { key: 'requerido', header: 'Requerido', format: 'number', align: 'right', width: 12 },
    { key: 'entregado', header: 'Entregado', format: 'number', align: 'right', width: 12 },
    { key: 'pendiente', header: 'A surtir', format: 'number', align: 'right', width: 12 },
    { key: 'stock', header: 'Stock', format: 'number', align: 'right', width: 12 },
    { key: 'faltante', header: 'Faltante', format: 'number', align: 'right', width: 12 },
    { key: 'costo_faltante', header: 'Costo faltante', format: 'currency', align: 'right', width: 16 },
    { key: 'proveedor', header: 'Proveedor', width: 22 },
  ];

  const buildExportRows = () => rows.map(r => {
    const prov = proveedores?.find(p => p.id === r.proveedor_preferido_id);
    return {
      codigo: r.codigo,
      nombre: r.nombre,
      requerido: r.requerido,
      entregado: r.entregado,
      pendiente: r.pendiente,
      stock: r.stock,
      faltante: r.faltante,
      costo_faltante: r.faltante * r.costo,
      proveedor: prov?.nombre ?? (r.proveedor_preferido_id ? '—' : 'Sin proveedor'),
    };
  });

  const buildExportOpts = () => ({
    fileName: `concentrado-a-surtir_${desde}_${hasta}`,
    title: 'Concentrado a surtir',
    subtitle: `${rows.length} producto(s) · ${faltantes.length} con faltante`,
    columns: exportColumns,
    data: buildExportRows(),
    empresa: empresa?.nombre ?? '',
    empresaInfo: empresa ? { nombre: empresa.nombre ?? '', rfc: (empresa as any).rfc ?? null, email: (empresa as any).email ?? null, logo_url: (empresa as any).logo_url ?? null } : undefined,
    dateRange: { from: desde, to: hasta },
    currencyCode: (empresa as any)?.moneda ?? 'MXN',
  });

  const handleExportExcel = () => {
    if (rows.length === 0) { toast.error('Nada que exportar'); return; }
    try { exportToExcel(buildExportOpts()); }
    catch (err: any) { toast.error(err?.message || 'Error al exportar Excel'); }
  };
  const handleExportPdf = async () => {
    if (rows.length === 0) { toast.error('Nada que exportar'); return; }
    try { await exportToPDF(buildExportOpts()); }
    catch (err: any) { toast.error(err?.message || 'Error al exportar PDF'); }
  };

  const generarCompras = async () => {
    if (!empresa?.id) return;
    if (faltantes.length === 0) { toast.error('No hay productos con faltante'); return; }
    setGenerando(true);
    try {
      // Agrupar por proveedor preferido
      const grupos = new Map<string, typeof faltantes>();
      for (const f of faltantes) {
        const k = f.proveedor_preferido_id ?? '__sin__';
        if (!grupos.has(k)) grupos.set(k, []);
        grupos.get(k)!.push(f);
      }
      if (grupos.has('__sin__') && grupos.size === 1) {
        toast.error('Asigna un proveedor preferido a estos productos primero.');
        setGenerando(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      const creados: string[] = [];
      const sinProv: string[] = [];

      for (const [provId, items] of grupos) {
        if (provId === '__sin__') { sinProv.push(...items.map(i => i.nombre)); continue; }
        const subtotal = items.reduce((s, r) => s + r.faltante * r.costo, 0);
        const { data: compra, error: e1 } = await supabase.from('compras').insert({
          empresa_id: empresa.id,
          proveedor_id: provId,
          fecha: new Date().toISOString().slice(0, 10),
          status: 'borrador',
          condicion_pago: 'contado',
          subtotal,
          iva_total: 0,
          total: subtotal,
          saldo_pendiente: subtotal,
          notas: `Faltantes para entregas ${desde} a ${hasta}`,
          created_by: user?.id,
        } as any).select('id').single();
        if (e1) throw e1;
        const cls = items.map(r => ({
          compra_id: compra.id,
          producto_id: r.producto_id,
          cantidad: r.faltante,
          precio_unitario: r.costo,
          subtotal: r.faltante * r.costo,
          total: r.faltante * r.costo,
        }));
        const { error: e2 } = await supabase.from('compra_lineas').insert(cls as any);
        if (e2) throw e2;
        creados.push(compra.id);
      }

      if (creados.length === 1) {
        toast.success('Compra borrador creada');
        navigate(`/almacen/compras/${creados[0]}`);
      } else if (creados.length > 1) {
        toast.success(`${creados.length} compras borrador creadas`);
        navigate('/almacen/compras');
      }
      if (sinProv.length > 0) {
        toast.warning(`${sinProv.length} producto(s) sin proveedor preferido: ${sinProv.slice(0, 3).join(', ')}${sinProv.length > 3 ? '…' : ''}`);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Error al generar compras');
    } finally {
      setGenerando(false);
    }
  };

  return (
    <div className="p-4 min-h-full space-y-4">
      <PedidosTabs />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Package className="w-5 h-5 text-primary" /> Concentrado a surtir
          </h1>
          <p className="text-xs text-muted-foreground">
            Total a entregar por producto en el rango (por fecha de entrega), descontando lo ya entregado.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-card border border-border rounded-lg p-3 flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs flex items-center gap-1"><CalendarIcon className="w-3 h-3" /> Rango de fechas</Label>
          <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} />
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => { const t = todayLocal(); setDesde(t); setHasta(t); }}>Hoy</Button>
          <Button size="sm" variant="outline" onClick={() => { const t = addDays(todayLocal(), 1); setDesde(t); setHasta(t); }}>Mañana</Button>
          <Button size="sm" variant="outline" onClick={() => { const t = todayLocal(); setDesde(t); setHasta(addDays(t, 6)); }}>7 días</Button>
        </div>
        <div className="ml-auto flex gap-2">
          <Button size="sm" variant="outline" onClick={() => refetch()}>Refrescar</Button>
          <Button size="sm" variant="outline" onClick={handleExportExcel} disabled={rows.length === 0}>
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel
          </Button>
          <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={rows.length === 0}>
            <FileDown className="w-3.5 h-3.5" /> PDF
          </Button>
          {faltantes.length > 0 && (
            <Button size="sm" onClick={generarCompras} disabled={generando} className="bg-primary text-primary-foreground">
              {generando ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShoppingCart className="w-3.5 h-3.5" />}
              Generar compras ({faltantes.length})
            </Button>
          )}
        </div>

        <div className="w-full space-y-1">
          <Label className="text-xs">Estado del pedido</Label>
          <div className="flex flex-wrap gap-1.5">
            {STATUS_OPTIONS.map(opt => {
              const active = statusFilter.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleStatus(opt.value)}
                  className={`text-xs px-2.5 py-1 rounded-full border transition ${
                    active
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-card text-foreground border-border hover:bg-muted/40'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
            {statusFilter.length > 0 && (
              <button
                type="button"
                onClick={() => setStatusFilter([])}
                className="text-xs px-2.5 py-1 rounded-full border border-border text-muted-foreground hover:bg-muted/40"
              >
                Limpiar
              </button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {statusFilter.length === 0
              ? 'Mostrando: Confirmado, Entregado y Facturado (por defecto).'
              : `Filtrando por ${statusFilter.length} estado(s).`}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <KPI label="Pedidos en rango" value={totales.pedidos} />
        <KPI label="Productos a surtir" value={totales.productos} />
        <KPI label="Con faltante" value={totales.conFaltante} highlight={totales.conFaltante > 0} />
        <KPI label="Costo del faltante" value={fmtMoney(totales.costoFaltante)} />
      </div>

      {/* Aviso */}
      {!isLoading && faltantes.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-lg p-3 flex items-start gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <strong>Atención:</strong> {faltantes.length} producto(s) no alcanzan a cubrirse con el stock actual.
            Usa <em>Generar compras</em> para crear órdenes borrador agrupadas por proveedor preferido.
          </div>
        </div>
      )}
      {!isLoading && rows.length > 0 && faltantes.length === 0 && (
        <div className="bg-success/10 border border-success/30 text-success rounded-lg p-3 flex items-center gap-2 text-sm">
          <CheckCircle2 className="w-4 h-4" /> Hay stock suficiente para cubrir todos los pedidos del rango.
        </div>
      )}

      {/* Tabla */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Código</th>
                <th className="text-left px-3 py-2">Producto</th>
                <th className="text-right px-3 py-2">Requerido</th>
                <th className="text-right px-3 py-2">Ya entregado</th>
                <th className="text-right px-3 py-2">A surtir</th>
                <th className="text-right px-3 py-2">Stock actual</th>
                <th className="text-right px-3 py-2">Faltante</th>
                <th className="text-left px-3 py-2">Proveedor</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && rows.length === 0 && (
                <tr><td colSpan={8} className="text-center py-8 text-muted-foreground">Sin pedidos pendientes a entregar en este rango.</td></tr>
              )}
              {rows.map(r => {
                const prov = proveedores?.find(p => p.id === r.proveedor_preferido_id);
                const tieneFaltante = r.faltante > 0;
                return (
                  <tr key={r.producto_id} className={tieneFaltante ? 'bg-destructive/5' : 'hover:bg-muted/20'}>
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{r.codigo}</td>
                    <td className="px-3 py-2 font-medium">{r.nombre}</td>
                    <td className="px-3 py-2 text-right">{r.requerido}</td>
                    <td className="px-3 py-2 text-right text-muted-foreground">{r.entregado || '—'}</td>
                    <td className="px-3 py-2 text-right font-semibold">{r.pendiente}</td>
                    <td className={`px-3 py-2 text-right ${r.stock < r.pendiente ? 'text-destructive font-semibold' : ''}`}>{r.stock}</td>
                    <td className="px-3 py-2 text-right">
                      {tieneFaltante ? (
                        <Badge variant="destructive" className="font-mono">{r.faltante}</Badge>
                      ) : (
                        <span className="text-success">✓</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {prov?.nombre ?? (r.proveedor_preferido_id ? '—' : <span className="text-destructive/80">Sin proveedor</span>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

interface Row {
  producto_id: string;
  codigo: string;
  nombre: string;
  requerido: number;
  entregado: number;
  pendiente: number;
  stock: number;
  faltante: number;
  costo: number;
  proveedor_preferido_id: string | null;
}

function KPI({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className={`bg-card border rounded-lg p-3 ${highlight ? 'border-destructive/40 bg-destructive/5' : 'border-border'}`}>
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-lg font-bold ${highlight ? 'text-destructive' : 'text-foreground'}`}>{value}</div>
    </div>
  );
}
