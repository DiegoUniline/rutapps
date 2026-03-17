import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Banknote, Search, Plus, Receipt, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

function useCobros(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cobros-desktop', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('cobros')
        .select('*, clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false });
      if (search) q = q.or(`clientes.nombre.ilike.%${search}%,referencia.ilike.%${search}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

function useClientesConDeuda() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-deuda', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('cliente_id, clientes(id, nombre, codigo), saldo_pendiente')
        .eq('empresa_id', empresa!.id)
        .gt('saldo_pendiente', 0);
      // Group by client
      const map: Record<string, { nombre: string; codigo: string; id: string; total: number; ventas: number }> = {};
      for (const v of (data ?? [])) {
        const cid = v.cliente_id ?? '';
        if (!map[cid]) map[cid] = { id: cid, nombre: (v.clientes as any)?.nombre ?? '—', codigo: (v.clientes as any)?.codigo ?? '', total: 0, ventas: 0 };
        map[cid].total += v.saldo_pendiente ?? 0;
        map[cid].ventas += 1;
      }
      return Object.values(map).sort((a, b) => b.total - a.total);
    },
  });
}

export default function CobranzaPage() {
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'cobros' | 'deudores'>('deudores');
  const { data: cobros, isLoading } = useCobros(search);
  const { data: deudores } = useClientesConDeuda();

  const totalCobrado = cobros?.reduce((s, c) => s + (c.monto ?? 0), 0) ?? 0;
  const totalDeuda = deudores?.reduce((s, d) => s + d.total, 0) ?? 0;

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Banknote className="h-5 w-5" /> Cobranza
        <HelpButton title={HELP.cobranza.title} sections={HELP.cobranza.sections} />
      </h1>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total por cobrar</p>
          <p className="text-2xl font-bold text-destructive">$ {fmt(totalDeuda)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Clientes con deuda</p>
          <p className="text-2xl font-bold text-warning">{deudores?.length ?? 0}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Cobros registrados</p>
          <p className="text-2xl font-bold text-success">{cobros?.length ?? 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {([['deudores', 'Clientes con deuda'], ['cobros', 'Historial de cobros']] as const).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)} className={cn(
            "px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
            tab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
          )}>{label}</button>
        ))}
      </div>

      {tab === 'deudores' && (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Código</TableHead>
                <TableHead className="text-[11px]">Cliente</TableHead>
                <TableHead className="text-[11px] text-center">Ventas pendientes</TableHead>
                <TableHead className="text-[11px] text-right">Saldo total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deudores?.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">{d.codigo}</TableCell>
                  <TableCell className="font-medium text-[12px]">{d.nombre}</TableCell>
                  <TableCell className="text-center">{d.ventas}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">$ {fmt(d.total)}</TableCell>
                </TableRow>
              ))}
              {(!deudores || deudores.length === 0) && (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Sin deudores 🎉</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {tab === 'cobros' && (
        <>
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cobro..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Fecha</TableHead>
                  <TableHead className="text-[11px]">Cliente</TableHead>
                  <TableHead className="text-[11px]">Método</TableHead>
                  <TableHead className="text-[11px]">Referencia</TableHead>
                  <TableHead className="text-[11px] text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cobros?.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                    <TableCell className="font-medium text-[12px]">{(c.clientes as any)?.nombre ?? '—'}</TableCell>
                    <TableCell className="text-[12px]"><Badge variant="outline">{c.metodo_pago}</Badge></TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{c.referencia ?? '—'}</TableCell>
                    <TableCell className="text-right font-bold text-success">$ {fmt(c.monto)}</TableCell>
                  </TableRow>
                ))}
                {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
                {!isLoading && cobros?.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin cobros</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  );
}
