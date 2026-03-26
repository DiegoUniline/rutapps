import React, { useState, useMemo } from 'react';
import SearchableSelect from '@/components/SearchableSelect';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search, Truck, CalendarIcon, Printer, Package } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow, TableFooter } from '@/components/ui/table';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

function useReporteEntregas(vendedorId: string, fechaDesde: Date, fechaHasta: Date) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['reporte-entregas', empresa?.id, vendedorId, fechaDesde.toISOString(), fechaHasta.toISOString()],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('*, clientes(nombre), vendedores(nombre), venta_lineas(cantidad, precio_unitario, subtotal, total, productos(id, codigo, nombre), unidades(abreviatura))')
        .eq('empresa_id', empresa!.id)
        .eq('tipo', 'venta_directa')
        .not('pedido_origen_id', 'is', null)
        .gte('fecha_entrega', fechaDesde.toISOString().slice(0, 10))
        .lte('fecha_entrega', fechaHasta.toISOString().slice(0, 10))
        .order('fecha_entrega', { ascending: true });

      if (vendedorId && vendedorId !== 'todos') q = q.eq('vendedor_id', vendedorId);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useVendedoresList() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-reporte', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
}

export default function ReporteEntregasPage() {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const [vendedorId, setVendedorId] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 7); return d; });
  const [fechaHasta, setFechaHasta] = useState(() => new Date());

  const { data: entregas, isLoading } = useReporteEntregas(vendedorId, fechaDesde, fechaHasta);
  const { data: vendedores } = useVendedoresList();

  // Product summary across all deliveries
  const productSummary = useMemo(() => {
    if (!entregas) return [];
    const map = new Map<string, { codigo: string; nombre: string; cantidad: number; total: number }>();
    for (const e of entregas) {
      for (const l of ((e as any).venta_lineas ?? [])) {
        const pid = l.productos?.id ?? l.producto_id;
        const existing = map.get(pid);
        if (existing) {
          existing.cantidad += l.cantidad ?? 0;
          existing.total += (l.cantidad ?? 0) * (l.precio_unitario ?? 0);
        } else {
          map.set(pid, {
            codigo: l.productos?.codigo ?? '—',
            nombre: l.productos?.nombre ?? '—',
            cantidad: l.cantidad ?? 0,
            total: (l.cantidad ?? 0) * (l.precio_unitario ?? 0),
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad);
  }, [entregas]);

  // Group by route
  const byRoute = useMemo(() => {
    if (!entregas) return [];
    const map = new Map<string, { vendedor: string; entregas: typeof entregas; total: number }>();
    for (const e of entregas) {
      const vid = (e as any).vendedor_id ?? 'sin';
      const vn = (e as any).vendedores?.nombre ?? 'Sin asignar';
      if (!map.has(vid)) map.set(vid, { vendedor: vn, entregas: [], total: 0 });
      const g = map.get(vid)!;
      g.entregas.push(e);
      g.total += (e as any).total ?? 0;
    }
    return Array.from(map.values());
  }, [entregas]);

  // Group by date
  const byDate = useMemo(() => {
    if (!entregas) return [];
    const map = new Map<string, { fecha: string; entregas: typeof entregas; total: number }>();
    for (const e of entregas) {
      const f = (e as any).fecha_entrega ?? (e as any).fecha;
      if (!map.has(f)) map.set(f, { fecha: f, entregas: [], total: 0 });
      const g = map.get(f)!;
      g.entregas.push(e);
      g.total += (e as any).total ?? 0;
    }
    return Array.from(map.values()).sort((a, b) => a.fecha.localeCompare(b.fecha));
  }, [entregas]);

  const totalMonto = entregas?.reduce((s, e) => s + ((e as any).total ?? 0), 0) ?? 0;
  const totalUnidades = productSummary.reduce((s, p) => s + p.cantidad, 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <FileText className="h-5 w-5" /> Reporte de entregas
        </h1>
        <Button variant="outline" size="sm" onClick={handlePrint}>
          <Printer className="h-4 w-4 mr-1" /> Imprimir
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Ruta</label>
          <SearchableSelect
            options={[{ value: 'todos', label: 'Todas las rutas' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
            value={vendedorId}
            onChange={setVendedorId}
            placeholder="Buscar ruta..."
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Desde</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[140px] justify-start">
                <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                {format(fechaDesde, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fechaDesde} onSelect={d => d && setFechaDesde(d)} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Hasta</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-[140px] justify-start">
                <CalendarIcon className="h-3.5 w-3.5 mr-1" />
                {format(fechaHasta, 'dd/MM/yyyy')}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={fechaHasta} onSelect={d => d && setFechaHasta(d)} className={cn("p-3 pointer-events-auto")} />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Print header */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">{empresa?.nombre} — Reporte de entregas</h1>
        <p className="text-sm text-muted-foreground">
          {format(fechaDesde, 'dd/MM/yyyy')} al {format(fechaHasta, 'dd/MM/yyyy')}
          {vendedorId !== 'todos' && ` — Ruta: ${vendedores?.find(v => v.id === vendedorId)?.nombre}`}
        </p>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Entregas</p>
          <p className="text-2xl font-bold text-foreground">{entregas?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Rutas</p>
          <p className="text-2xl font-bold text-foreground">{byRoute.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Unidades totales</p>
          <p className="text-2xl font-bold text-warning">{totalUnidades}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Monto total</p>
          <p className="text-2xl font-bold text-primary">{fmt(totalMonto)}</p>
        </div>
      </div>

      {/* Product summary */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-card border-b border-border flex items-center gap-2">
          <Package className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">Resumen por producto</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Código</TableHead>
              <TableHead className="text-[11px]">Producto</TableHead>
              <TableHead className="text-[11px] text-right">Cantidad total</TableHead>
              <TableHead className="text-[11px] text-right">Monto total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {productSummary.map(p => (
              <TableRow key={p.codigo}>
                <TableCell className="font-mono text-[11px] text-muted-foreground py-1.5">{p.codigo}</TableCell>
                <TableCell className="text-[12px] font-medium py-1.5">{p.nombre}</TableCell>
                <TableCell className="text-right text-[12px] font-bold py-1.5">{p.cantidad}</TableCell>
                <TableCell className="text-right text-[12px] py-1.5">{fmt(p.total)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={2} className="text-[11px] font-semibold">Total</TableCell>
              <TableCell className="text-right text-[12px] font-bold">{totalUnidades}</TableCell>
              <TableCell className="text-right text-[12px] font-bold">{fmt(totalMonto)}</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>

      {/* By date */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="px-4 py-2 bg-card border-b border-border flex items-center gap-2">
          <CalendarIcon className="h-4 w-4 text-primary" />
          <span className="text-[13px] font-semibold text-foreground">Detalle por fecha de entrega</span>
        </div>
        {byDate.map(group => (
          <div key={group.fecha}>
            <div className="px-4 py-1.5 bg-card/50 border-b border-border flex items-center justify-between">
              <span className="text-[12px] font-semibold text-foreground">{fmtDate(group.fecha)}</span>
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-muted-foreground">{group.entregas.length} entregas</span>
                <span className="text-[12px] font-bold text-foreground">{fmt(group.total)}</span>
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[10px]">Folio</TableHead>
                  <TableHead className="text-[10px]">Cliente</TableHead>
                  <TableHead className="text-[10px]">Ruta</TableHead>
                  <TableHead className="text-[10px] text-center">Status</TableHead>
                  <TableHead className="text-[10px] text-center">Líneas</TableHead>
                  <TableHead className="text-[10px] text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {group.entregas.map((e: any) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-[11px] font-bold py-1.5">{e.folio}</TableCell>
                    <TableCell className="text-[11px] font-medium py-1.5">{e.clientes?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-[11px] text-muted-foreground py-1.5">{e.vendedores?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-center py-1.5">
                      <Badge variant={e.status === 'entregado' ? 'default' : 'outline'} className={cn("text-[9px]", e.status === 'entregado' ? 'bg-success text-success-foreground' : 'border-warning text-warning')}>
                        {e.status === 'confirmado' ? 'Pendiente' : 'Entregado'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-[11px] text-muted-foreground py-1.5">{e.venta_lineas?.length ?? 0}</TableCell>
                    <TableCell className="text-right text-[11px] font-medium py-1.5">{fmt(e.total ?? 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </div>

      {/* By route */}
      {byRoute.length > 1 && (
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-card border-b border-border flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">Resumen por ruta</span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Ruta / Vendedor</TableHead>
                <TableHead className="text-[11px] text-center">Entregas</TableHead>
                <TableHead className="text-[11px] text-center">Pendientes</TableHead>
                <TableHead className="text-[11px] text-center">Entregadas</TableHead>
                <TableHead className="text-[11px] text-right">Monto total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {byRoute.map(r => (
                <TableRow key={r.vendedor}>
                  <TableCell className="text-[12px] font-semibold py-1.5">{r.vendedor}</TableCell>
                  <TableCell className="text-center text-[12px] py-1.5">{r.entregas.length}</TableCell>
                  <TableCell className="text-center text-[12px] text-warning font-bold py-1.5">{r.entregas.filter(e => e.status === 'confirmado').length}</TableCell>
                  <TableCell className="text-center text-[12px] text-success font-bold py-1.5">{r.entregas.filter(e => e.status === 'entregado').length}</TableCell>
                  <TableCell className="text-right text-[12px] font-bold py-1.5">{fmt(r.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {!isLoading && (entregas?.length ?? 0) === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No hay entregas en el rango seleccionado
        </div>
      )}
    </div>
  );
}
