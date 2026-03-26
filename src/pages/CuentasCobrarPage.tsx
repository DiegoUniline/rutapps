import { useState, useMemo } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { CreditCard, Search, ChevronRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import ClienteEstadoCuenta from '@/components/ClienteEstadoCuenta';

interface ClienteDeuda {
  cliente_id: string;
  nombre: string;
  codigo: string | null;
  telefono: string | null;
  vendedor: string | null;
  totalVentas: number;
  totalDeuda: number;
  numDocumentos: number;
  ventaMasAntigua: string;
  diasMax: number;
}

export default function CuentasCobrarPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [search, setSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string } | null>(null);

  const { data: ventas, isLoading } = useQuery({
    queryKey: ['clientes-deuda', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, cliente_id, clientes(nombre, codigo, telefono, vendedor_id, vendedores(nombre)), vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .gt('saldo_pendiente', 0)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const clientes = useMemo(() => {
    if (!ventas) return [];
    const map = new Map<string, ClienteDeuda>();
    const today = new Date();

    for (const v of ventas) {
      const cid = v.cliente_id;
      if (!cid) continue;
      const cli = v.clientes as any;
      const existing = map.get(cid);
      const saldo = v.saldo_pendiente ?? 0;
      const dias = Math.floor((today.getTime() - new Date(v.fecha).getTime()) / 86400000);

      if (existing) {
        existing.totalVentas += v.total ?? 0;
        existing.totalDeuda += saldo;
        existing.numDocumentos += 1;
        if (dias > existing.diasMax) {
          existing.diasMax = dias;
          existing.ventaMasAntigua = v.fecha;
        }
      } else {
        map.set(cid, {
          cliente_id: cid,
          nombre: cli?.nombre ?? '—',
          codigo: cli?.codigo ?? null,
          telefono: cli?.telefono ?? null,
          vendedor: (cli?.vendedores as any)?.nombre ?? (v.vendedores as any)?.nombre ?? null,
          totalVentas: v.total ?? 0,
          totalDeuda: saldo,
          numDocumentos: 1,
          ventaMasAntigua: v.fecha,
          diasMax: dias,
        });
      }
    }

    let list = Array.from(map.values());
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        c.nombre.toLowerCase().includes(s) ||
        (c.codigo ?? '').toLowerCase().includes(s) ||
        (c.vendedor ?? '').toLowerCase().includes(s)
      );
    }
    return list.sort((a, b) => b.totalDeuda - a.totalDeuda);
  }, [ventas, search]);

  const totalPendiente = clientes.reduce((s, c) => s + c.totalDeuda, 0);
  const totalDocs = clientes.reduce((s, c) => s + c.numDocumentos, 0);

  const today = new Date();
  const aging = { corriente: 0, d30: 0, d60: 0, d90: 0, masD90: 0 };
  ventas?.forEach(v => {
    const dias = Math.floor((today.getTime() - new Date(v.fecha).getTime()) / 86400000);
    const saldo = v.saldo_pendiente ?? 0;
    if (dias <= 15) aging.corriente += saldo;
    else if (dias <= 30) aging.d30 += saldo;
    else if (dias <= 60) aging.d60 += saldo;
    else if (dias <= 90) aging.d90 += saldo;
    else aging.masD90 += saldo;
  });

  const agingColor = (dias: number) => {
    if (dias <= 15) return 'text-green-600 dark:text-green-400';
    if (dias <= 30) return 'text-yellow-600 dark:text-yellow-400';
    if (dias <= 60) return 'text-orange-500';
    return 'text-destructive';
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <CreditCard className="h-5 w-5" /> Clientes con deuda
        <HelpButton title={HELP.cuentasCobrar.title} sections={HELP.cuentasCobrar.sections} />
      </h1>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total pendiente</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendiente)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Clientes</p>
          <p className="text-2xl font-bold text-foreground">{clientes.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Documentos</p>
          <p className="text-2xl font-bold text-foreground">{totalDocs}</p>
        </div>
      </div>

      {/* Aging */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Antigüedad de saldos</h3>
        <div className="grid grid-cols-5 gap-2 text-center">
          {[
            { label: 'Corriente', val: aging.corriente, color: 'text-green-600 dark:text-green-400' },
            { label: '16-30 días', val: aging.d30, color: 'text-yellow-600 dark:text-yellow-400' },
            { label: '31-60 días', val: aging.d60, color: 'text-orange-500' },
            { label: '61-90 días', val: aging.d90, color: 'text-destructive' },
            { label: '+90 días', val: aging.masD90, color: 'text-destructive font-bold' },
          ].map(a => (
            <div key={a.label}>
              <p className="text-[10px] text-muted-foreground">{a.label}</p>
              <p className={cn("text-sm font-bold", a.color)}>{fmt(a.val)}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar cliente, código o vendedor..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px] text-center">Docs</TableHead>
              <TableHead className="text-[11px] text-center">Días</TableHead>
              <TableHead className="text-[11px] text-right">Total vendido</TableHead>
              <TableHead className="text-[11px] text-right">Deuda</TableHead>
              <TableHead className="w-8"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {clientes.map(c => (
              <TableRow
                key={c.cliente_id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedCliente({ id: c.cliente_id, nombre: c.nombre })}
              >
                <TableCell>
                  <div>
                    <p className="font-medium text-[12px]">{c.nombre}</p>
                    {c.codigo && <p className="text-[10px] text-muted-foreground">{c.codigo}</p>}
                  </div>
                </TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{c.vendedor ?? '—'}</TableCell>
                <TableCell className="text-center text-[12px]">{c.numDocumentos}</TableCell>
                <TableCell className={cn("text-center text-[12px] font-semibold", agingColor(c.diasMax))}>
                  {c.diasMax}d
                </TableCell>
                <TableCell className="text-right text-[12px]">{fmt(c.totalVentas)}</TableCell>
                <TableCell className="text-right font-bold text-destructive text-[12px]">{fmt(c.totalDeuda)}</TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
            )}
            {!isLoading && clientes.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin clientes con deuda 🎉</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <ClienteEstadoCuenta
        clienteId={selectedCliente?.id ?? null}
        clienteNombre={selectedCliente?.nombre ?? ''}
        onClose={() => setSelectedCliente(null)}
      />
    </div>
  );
}
