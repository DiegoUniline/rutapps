import { useState } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Layers, Search, Plus, Trash2, Save, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

function useLotes(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['lotes', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('producto_lotes')
        .select('*, productos(codigo, nombre), almacenes(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('fecha_caducidad', { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      let filtered = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        filtered = filtered.filter(l =>
          l.lote.toLowerCase().includes(s) ||
          ((l.productos as any)?.nombre ?? '').toLowerCase().includes(s)
        );
      }
      return filtered;
    },
  });
}

export default function LotesPage() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: lotes, isLoading } = useLotes(search);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ producto_id: '', lote: '', fecha_produccion: '', fecha_caducidad: '', cantidad: '', almacen_id: '', notas: '' });

  const { data: productos } = useQuery({
    queryKey: ['productos-lote', empresa?.id],
    enabled: !!empresa?.id && showForm,
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, codigo, nombre').eq('empresa_id', empresa!.id).eq('status', 'activo').order('nombre');
      return data ?? [];
    },
  });

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-lote', empresa?.id],
    enabled: !!empresa?.id && showForm,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const saveLote = useMutation({
    mutationFn: async () => {
      if (!form.producto_id || !form.lote) throw new Error('Producto y lote son requeridos');
      const { error } = await supabase.from('producto_lotes').insert({
        empresa_id: empresa!.id,
        producto_id: form.producto_id,
        lote: form.lote,
        fecha_produccion: form.fecha_produccion || null,
        fecha_caducidad: form.fecha_caducidad || null,
        cantidad: parseFloat(form.cantidad) || 0,
        almacen_id: form.almacen_id || null,
        notas: form.notas || null,
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Lote registrado');
      qc.invalidateQueries({ queryKey: ['lotes'] });
      setShowForm(false);
      setForm({ producto_id: '', lote: '', fecha_produccion: '', fecha_caducidad: '', cantidad: '', almacen_id: '', notas: '' });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteLote = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('producto_lotes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success('Lote eliminado'); qc.invalidateQueries({ queryKey: ['lotes'] }); },
  });

  const today = new Date().toISOString().split('T')[0];
  const vencidos = lotes?.filter(l => l.fecha_caducidad && l.fecha_caducidad < today).length ?? 0;
  const porVencer = lotes?.filter(l => {
    if (!l.fecha_caducidad) return false;
    const diff = (new Date(l.fecha_caducidad).getTime() - new Date().getTime()) / 86400000;
    return diff >= 0 && diff <= 30;
  }).length ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Layers className="h-5 w-5" /> Lotes
          <HelpButton title={HELP.lotes.title} sections={HELP.lotes.sections} />
        </h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo lote
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total lotes</p>
          <p className="text-2xl font-bold text-foreground">{lotes?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Por vencer (30 días)</p>
          <p className="text-2xl font-bold text-warning">{porVencer}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Vencidos</p>
          <p className="text-2xl font-bold text-destructive">{vencidos}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Nuevo lote</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SearchableSelect
              options={(productos ?? []).map(p => ({ value: p.id, label: `${p.codigo} — ${p.nombre}` }))}
              value={form.producto_id}
              onChange={val => setForm({ ...form, producto_id: val })}
              placeholder="Buscar producto..."
            />
            <Input placeholder="# Lote *" value={form.lote} onChange={e => setForm({ ...form, lote: e.target.value })} />
            <Input type="number" placeholder="Cantidad" value={form.cantidad} onChange={e => setForm({ ...form, cantidad: e.target.value })} />
            <SearchableSelect
              options={(almacenes ?? []).map(a => ({ value: a.id, label: a.nombre }))}
              value={form.almacen_id}
              onChange={val => setForm({ ...form, almacen_id: val })}
              placeholder="Almacén"
            />
            <Input type="date" placeholder="Producción" value={form.fecha_produccion} onChange={e => setForm({ ...form, fecha_produccion: e.target.value })} />
            <Input type="date" placeholder="Caducidad" value={form.fecha_caducidad} onChange={e => setForm({ ...form, fecha_caducidad: e.target.value })} />
            <Input placeholder="Notas" value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} className="col-span-2" />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => saveLote.mutate()} disabled={saveLote.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" /> Guardar
            </Button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar lote o producto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Lote</TableHead>
              <TableHead className="text-[11px]">Producto</TableHead>
              <TableHead className="text-[11px]">Almacén</TableHead>
              <TableHead className="text-[11px] text-center">Cantidad</TableHead>
              <TableHead className="text-[11px]">Producción</TableHead>
              <TableHead className="text-[11px]">Caducidad</TableHead>
              <TableHead className="text-[11px] text-center">Estado</TableHead>
              <TableHead className="text-[11px] w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lotes?.map(l => {
              const vencido = l.fecha_caducidad && l.fecha_caducidad < today;
              const porVencerItem = l.fecha_caducidad && !vencido && (new Date(l.fecha_caducidad).getTime() - new Date().getTime()) / 86400000 <= 30;
              return (
                <TableRow key={l.id} className={cn(vencido && "bg-destructive/5")}>
                  <TableCell className="font-mono text-[11px] font-bold">{l.lote}</TableCell>
                  <TableCell className="font-medium text-[12px]">{(l.productos as any)?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">{(l.almacenes as any)?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-center font-medium">{l.cantidad}</TableCell>
                  <TableCell className="text-[12px]">{fmtDate(l.fecha_produccion)}</TableCell>
                  <TableCell className="text-[12px]">{fmtDate(l.fecha_caducidad)}</TableCell>
                  <TableCell className="text-center">
                    {vencido ? (
                      <Badge variant="destructive" className="text-[10px]"><AlertTriangle className="h-3 w-3 mr-1" />Vencido</Badge>
                    ) : porVencerItem ? (
                      <Badge className="text-[10px] bg-warning/20 text-warning border-warning/30">Por vencer</Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px]">Vigente</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" onClick={() => { if (confirm('¿Eliminar lote?')) deleteLote.mutate(l.id); }}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && lotes?.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin lotes registrados</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
