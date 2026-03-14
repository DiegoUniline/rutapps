import React, { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Search, Package, MapPin, Check, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, fmtDate } from '@/lib/utils';
import { toast } from 'sonner';

function useEntregas(search?: string, vendedorFilter?: string, statusFilter?: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['entregas', empresa?.id, search, vendedorFilter, statusFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('*, clientes(nombre), vendedores(nombre), venta_lineas(cantidad, precio_unitario, productos(codigo, nombre))')
        .eq('empresa_id', empresa!.id)
        .eq('tipo', 'venta_directa')
        .not('pedido_origen_id', 'is', null)
        .order('created_at', { ascending: false });

      if (search) q = q.or(`folio.ilike.%${search}%`);
      if (vendedorFilter && vendedorFilter !== 'todos') q = q.eq('vendedor_id', vendedorFilter);
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter as any);

      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useVendedoresFilter() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['vendedores-filter', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });
}

export default function EntregasPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const { data: entregas, isLoading } = useEntregas(search, vendedorFilter, statusFilter);
  const { data: vendedores } = useVendedoresFilter();

  const marcarEntregado = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').update({ status: 'entregado' as any }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entrega marcada como completada');
      qc.invalidateQueries({ queryKey: ['entregas'] });
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['demanda'] });
    },
  });

  // Group by vendedor
  const grouped = useMemo(() => {
    if (!entregas) return [];
    const map = new Map<string, { vendedorId: string; vendedor: string; entregas: typeof entregas }>();
    for (const e of entregas) {
      const vid = (e as any).vendedor_id ?? 'sin-asignar';
      const vname = (e as any).vendedores?.nombre ?? 'Sin asignar';
      if (!map.has(vid)) map.set(vid, { vendedorId: vid, vendedor: vname, entregas: [] });
      map.get(vid)!.entregas.push(e);
    }
    return Array.from(map.values());
  }, [entregas]);

  const totalEntregas = entregas?.length ?? 0;
  const pendientes = entregas?.filter(e => e.status === 'confirmado').length ?? 0;
  const completadas = entregas?.filter(e => e.status === 'entregado').length ?? 0;
  const totalMonto = entregas?.reduce((s, e) => s + ((e as any).total ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5" /> Entregas
        </h1>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-2xl font-bold text-foreground">{totalEntregas}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Por entregar</p>
          <p className="text-2xl font-bold text-warning">{pendientes}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Entregadas</p>
          <p className="text-2xl font-bold text-success">{completadas}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Monto total</p>
          <p className="text-2xl font-bold text-primary">$ {totalMonto.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Ruta</label>
          <select className="border border-input rounded-md px-3 py-2 text-sm bg-background min-w-[180px]" value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)}>
            <option value="todos">Todas las rutas</option>
            {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
          <select className="border border-input rounded-md px-3 py-2 text-sm bg-background min-w-[150px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="todos">Todos</option>
            <option value="confirmado">Por entregar</option>
            <option value="entregado">Entregadas</option>
          </select>
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Cargando...</p>}

      {/* Grouped by vendedor */}
      {grouped.map(group => (
        <div key={group.vendedorId} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="px-4 py-2 bg-muted/40 border-b border-border flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            <span className="text-[13px] font-semibold text-foreground">{group.vendedor}</span>
            <Badge variant="secondary" className="text-[10px] ml-auto">
              {group.entregas.filter(e => e.status === 'confirmado').length} pendientes
            </Badge>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Folio</TableHead>
                <TableHead className="text-[11px]">Cliente</TableHead>
                <TableHead className="text-[11px]">Fecha</TableHead>
                <TableHead className="text-[11px] text-center">Status</TableHead>
                <TableHead className="text-[11px] text-center">Productos</TableHead>
                <TableHead className="text-[11px] text-right">Total</TableHead>
                <TableHead className="text-[11px] w-28"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {group.entregas.map((e: any) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-[11px] font-bold py-2">{e.folio}</TableCell>
                  <TableCell className="text-[12px] font-medium py-2">{e.clientes?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{fmtDate(e.fecha)}</TableCell>
                  <TableCell className="text-center py-2">
                    {e.status === 'confirmado' ? (
                      <Badge variant="outline" className="text-[10px] border-warning text-warning">
                        <Clock className="h-3 w-3 mr-1" /> Por entregar
                      </Badge>
                    ) : (
                      <Badge className="text-[10px] bg-success text-success-foreground">
                        <Check className="h-3 w-3 mr-1" /> Entregado
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-[12px] text-muted-foreground py-2">
                    {e.venta_lineas?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-right text-[12px] font-medium py-2">
                    $ {(e.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                  </TableCell>
                  <TableCell className="py-2">
                    {e.status === 'confirmado' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[11px] h-7"
                        onClick={() => marcarEntregado.mutate(e.id)}
                        disabled={marcarEntregado.isPending}
                      >
                        <Check className="h-3 w-3 mr-1" /> Entregar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}

      {!isLoading && totalEntregas === 0 && (
        <div className="text-center text-muted-foreground py-12">
          <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
          No hay entregas registradas
        </div>
      )}
    </div>
  );
}
