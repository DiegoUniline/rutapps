import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Receipt, Search, Plus, Trash2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

function useGastos(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['gastos-desktop', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('gastos')
        .select('*, vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (search) q = q.ilike('concepto', `%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export default function GastosDesktopPage() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const { data: gastos, isLoading } = useGastos(search);
  const [showForm, setShowForm] = useState(false);
  const [concepto, setConcepto] = useState('');
  const [monto, setMonto] = useState('');
  const [fecha, setFecha] = useState(new Date().toISOString().split('T')[0]);
  const [notas, setNotas] = useState('');

  const saveGasto = useMutation({
    mutationFn: async () => {
      if (!concepto || !monto) throw new Error('Completa concepto y monto');
      const { error } = await supabase.from('gastos').insert({
        empresa_id: empresa!.id,
        user_id: user!.id,
        concepto,
        monto: parseFloat(monto),
        fecha,
        notas: notas || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Gasto registrado');
      qc.invalidateQueries({ queryKey: ['gastos-desktop'] });
      setShowForm(false);
      setConcepto(''); setMonto(''); setNotas('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteGasto = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Gasto eliminado');
      qc.invalidateQueries({ queryKey: ['gastos-desktop'] });
    },
  });

  const totalGastos = gastos?.reduce((s, g) => s + (g.monto ?? 0), 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Receipt className="h-5 w-5" /> Gastos
        </h1>
        <Button size="sm" onClick={() => setShowForm(!showForm)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nuevo gasto
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total gastos</p>
          <p className="text-2xl font-bold text-destructive">$ {fmt(totalGastos)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Registros</p>
          <p className="text-2xl font-bold text-foreground">{gastos?.length ?? 0}</p>
        </div>
      </div>

      {showForm && (
        <div className="bg-card border border-border rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Nuevo gasto</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Input placeholder="Concepto *" value={concepto} onChange={e => setConcepto(e.target.value)} />
            <Input type="number" placeholder="Monto *" value={monto} onChange={e => setMonto(e.target.value)} />
            <Input type="date" value={fecha} onChange={e => setFecha(e.target.value)} />
            <Input placeholder="Notas" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button size="sm" onClick={() => saveGasto.mutate()} disabled={saveGasto.isPending}>
              <Save className="h-3.5 w-3.5 mr-1" /> Guardar
            </Button>
          </div>
        </div>
      )}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar gasto..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px]">Concepto</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Notas</TableHead>
              <TableHead className="text-[11px] text-right">Monto</TableHead>
              <TableHead className="text-[11px] w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {gastos?.map(g => (
              <TableRow key={g.id}>
                <TableCell className="text-[12px]">{fmtDate(g.fecha)}</TableCell>
                <TableCell className="font-medium text-[12px]">{g.concepto}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{(g.vendedores as any)?.nombre ?? '—'}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground truncate max-w-[200px]">{g.notas ?? '—'}</TableCell>
                <TableCell className="text-right font-bold text-destructive">$ {fmt(g.monto)}</TableCell>
                <TableCell>
                  <Button variant="ghost" size="icon" onClick={() => { if (confirm('¿Eliminar gasto?')) deleteGasto.mutate(g.id); }}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && gastos?.length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">Sin gastos registrados</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
