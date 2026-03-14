import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ShoppingBag, Search, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { fmtDate } from '@/lib/utils';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', confirmada: 'Confirmada', recibida: 'Recibida', cancelada: 'Cancelada'
};

function useCompras(search: string, statusFilter: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['compras', empresa?.id, search, statusFilter],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('compras')
        .select('*, proveedores(nombre), almacenes(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (statusFilter && statusFilter !== 'todos') q = q.eq('status', statusFilter);
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(c => (c.folio ?? '').toLowerCase().includes(s) || ((c.proveedores as any)?.nombre ?? '').toLowerCase().includes(s));
      }
      return filtered;
    },
  });
}

export default function ComprasPage() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const { data: compras, isLoading } = useCompras(search, statusFilter);
  const [showForm, setShowForm] = useState(false);

  // Quick-create form
  const [proveedorId, setProveedorId] = useState('');
  const [almacenId, setAlmacenId] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);

  const { data: proveedores } = useQuery({
    queryKey: ['proveedores-compra', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('proveedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-compra', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const crearCompra = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.from('compras').insert({
        empresa_id: empresa!.id,
        proveedor_id: proveedorId || null,
        almacen_id: almacenId || null,
        fecha,
      } as any).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data: any) => {
      toast.success('Compra creada');
      qc.invalidateQueries({ queryKey: ['compras'] });
      setShowForm(false);
      // Could navigate to detail
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteCompra = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('compras').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Compra eliminada');
      qc.invalidateQueries({ queryKey: ['compras'] });
    },
  });

  const totalCompras = compras?.reduce((s, c) => s + (c.total ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <ShoppingBag className="h-5 w-5" /> Compras
        </h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nueva compra
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total compras</p>
          <p className="text-2xl font-bold text-foreground">$ {fmt(totalCompras)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Registros</p>
          <p className="text-2xl font-bold text-foreground">{compras?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Pendientes</p>
          <p className="text-2xl font-bold text-warning">{compras?.filter(c => c.status === 'borrador' || c.status === 'confirmada').length ?? 0}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Nueva compra</h3>
          <div className="grid grid-cols-3 gap-3">
            <select className="border border-input rounded-md px-3 py-2 text-sm bg-background" value={proveedorId} onChange={e => setProveedorId(e.target.value)}>
              <option value="">Proveedor...</option>
              {proveedores?.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
            </select>
            <select className="border border-input rounded-md px-3 py-2 text-sm bg-background" value={almacenId} onChange={e => setAlmacenId(e.target.value)}>
              <option value="">Almacén destino...</option>
              {almacenes?.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
            </select>
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => crearCompra.mutate()} disabled={crearCompra.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" /> Crear
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="border border-input rounded-md px-3 py-2 text-sm bg-background" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="todos">Todos</option>
          <option value="borrador">Borrador</option>
          <option value="confirmada">Confirmada</option>
          <option value="recibida">Recibida</option>
          <option value="cancelada">Cancelada</option>
        </select>
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Proveedor</TableHead>
              <TableHead className="text-[11px]">Almacén</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px] text-right">Total</TableHead>
              <TableHead className="text-[11px] text-center">Estado</TableHead>
              <TableHead className="text-[11px] w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {compras?.map(c => (
              <TableRow key={c.id}>
                <TableCell className="font-mono text-[11px]">{c.folio ?? c.id.slice(0, 8)}</TableCell>
                <TableCell className="font-medium text-[12px]">{(c.proveedores as any)?.nombre ?? '—'}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{(c.almacenes as any)?.nombre ?? '—'}</TableCell>
                <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                <TableCell className="text-right font-bold">$ {fmt(c.total ?? 0)}</TableCell>
                <TableCell className="text-center">
                  <Badge variant={c.status === 'recibida' ? 'default' : c.status === 'cancelada' ? 'destructive' : 'outline'} className="text-[10px]">
                    {STATUS_LABELS[c.status] ?? c.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  {c.status === 'borrador' && (
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm('¿Eliminar?')) deleteCompra.mutate(c.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && compras?.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin compras</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
