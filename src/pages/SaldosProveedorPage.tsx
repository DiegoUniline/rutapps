import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { Search, Truck, ChevronRight, CreditCard, FileText, ArrowLeft, Banknote } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusChip } from '@/components/StatusChip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/* ── hooks ── */
function useProveedoresSaldo() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['proveedores-saldo-resumen', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('proveedor_id, saldo_pendiente, total, status, proveedores(id, nombre)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['confirmada', 'recibida', 'pagada'] as any);
      if (error) throw error;

      const map = new Map<string, {
        id: string; nombre: string;
        totalComprado: number; saldoPendiente: number; docs: number;
      }>();
      (data ?? []).forEach((c: any) => {
        const pid = c.proveedor_id;
        if (!pid) return;
        const existing = map.get(pid);
        if (existing) {
          existing.totalComprado += c.total ?? 0;
          existing.saldoPendiente += c.saldo_pendiente ?? 0;
          existing.docs += 1;
        } else {
          map.set(pid, {
            id: pid, nombre: c.proveedores?.nombre ?? 'Sin proveedor',
            totalComprado: c.total ?? 0, saldoPendiente: c.saldo_pendiente ?? 0, docs: 1,
          });
        }
      });
      return Array.from(map.values()).sort((a, b) => b.saldoPendiente - a.saldoPendiente);
    },
  });
}

function useProveedorDetalle(proveedorId: string | null) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['proveedor-estado-cuenta', empresa?.id, proveedorId],
    enabled: !!empresa?.id && !!proveedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, dias_credito')
        .eq('empresa_id', empresa!.id)
        .eq('proveedor_id', proveedorId!)
        .in('status', ['confirmada', 'recibida', 'pagada'] as any)
        .order('fecha', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/* ── page ── */
export default function SaldosProveedorPage() {
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: proveedores, isLoading } = useProveedoresSaldo();
  const { data: compras, isLoading: loadingDetalle } = useProveedorDetalle(selectedId);

  const filtered = useMemo(() => {
    if (!proveedores) return [];
    if (!search) return proveedores;
    const s = search.toLowerCase();
    return proveedores.filter(p => p.nombre.toLowerCase().includes(s));
  }, [proveedores, search]);

  const selected = proveedores?.find(p => p.id === selectedId);

  const totalPendienteGlobal = proveedores?.reduce((s, p) => s + p.saldoPendiente, 0) ?? 0;
  const provConSaldo = proveedores?.filter(p => p.saldoPendiente > 0.01).length ?? 0;

  const comprasPendientes = compras?.filter(c => (c.saldo_pendiente ?? 0) > 0.01) ?? [];
  const comprasPagadas = compras?.filter(c => (c.saldo_pendiente ?? 0) <= 0.01) ?? [];

  // ── Detail view ──
  if (selectedId && selected) {
    const totalCompras = compras?.reduce((s, c) => s + (c.total ?? 0), 0) ?? 0;
    const totalSaldo = compras?.reduce((s, c) => s + (c.saldo_pendiente ?? 0), 0) ?? 0;

    return (
      <div className="p-4 space-y-4 min-h-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Estado de cuenta proveedor</h1>
            <p className="text-sm text-muted-foreground">{selected.nombre}</p>
          </div>
          {comprasPendientes.length > 0 && (
            <Button onClick={() => navigate(`/almacen/compras/${comprasPendientes[0].id}`)} className="gap-2">
              <Banknote className="h-4 w-4" /> Registrar pago
            </Button>
          )}
        </div>

        {/* Summary card */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total comprado</p>
              <p className="text-lg font-bold text-foreground">{fmt(totalCompras)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Pagado</p>
              <p className="text-lg font-bold text-success">{fmt(totalCompras - totalSaldo)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Saldo pendiente</p>
              <p className="text-lg font-bold text-destructive">{fmt(totalSaldo)}</p>
            </div>
          </div>
        </div>

        {/* Compras pendientes */}
        <div>
          <h3 className="text-sm font-semibold mb-2 text-destructive flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Compras con saldo pendiente ({comprasPendientes.length})
          </h3>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Folio</TableHead>
                  <TableHead className="text-[11px]">Fecha</TableHead>
                  <TableHead className="text-[11px] text-center">Días crédito</TableHead>
                  <TableHead className="text-[11px] text-right">Total</TableHead>
                  <TableHead className="text-[11px] text-right">Pagado</TableHead>
                  <TableHead className="text-[11px] text-right">Pendiente</TableHead>
                  <TableHead className="text-[11px] text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comprasPendientes.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/almacen/compras/${c.id}`)}>
                    <TableCell className="font-mono text-[11px]">{c.folio ?? c.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                    <TableCell className="text-center text-[12px] text-muted-foreground">{c.dias_credito ?? 0}d</TableCell>
                    <TableCell className="text-right text-[12px]">{fmt(c.total ?? 0)}</TableCell>
                    <TableCell className="text-right text-[12px] text-success">{fmt((c.total ?? 0) - (c.saldo_pendiente ?? 0))}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{fmt(c.saldo_pendiente ?? 0)}</TableCell>
                    <TableCell className="text-center"><StatusChip status={c.status} /></TableCell>
                  </TableRow>
                ))}
                {comprasPendientes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">Sin saldos pendientes 🎉</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Compras pagadas */}
        {comprasPagadas.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2 text-success flex items-center gap-2">
              <FileText className="h-4 w-4" /> Compras liquidadas ({comprasPagadas.length})
            </h3>
            <div className="bg-card border border-border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Folio</TableHead>
                    <TableHead className="text-[11px]">Fecha</TableHead>
                    <TableHead className="text-[11px] text-right">Total</TableHead>
                    <TableHead className="text-[11px] text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comprasPagadas.slice(0, 30).map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/almacen/compras/${c.id}`)}>
                      <TableCell className="font-mono text-[11px]">{c.folio ?? c.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                      <TableCell className="text-right text-[12px]">{fmt(c.total ?? 0)}</TableCell>
                      <TableCell className="text-center"><StatusChip status={c.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {loadingDetalle && <p className="text-center text-muted-foreground py-4">Cargando...</p>}
      </div>
    );
  }

  // ── List view ──
  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5" /> Saldos por proveedor
        </h1>
        <Button onClick={() => navigate('/finanzas/aplicar-pagos-proveedor')} className="gap-2">
          <Banknote className="h-4 w-4" /> Aplicar pagos
        </Button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total por pagar</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendienteGlobal)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Proveedores con saldo</p>
          <p className="text-2xl font-bold text-foreground">{provConSaldo}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total proveedores</p>
          <p className="text-2xl font-bold text-muted-foreground">{proveedores?.length ?? 0}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar proveedor..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Proveedor</TableHead>
              <TableHead className="text-[11px] text-center">Compras</TableHead>
              <TableHead className="text-[11px] text-right">Total comprado</TableHead>
              <TableHead className="text-[11px] text-right">Saldo pendiente</TableHead>
              <TableHead className="text-[11px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <TableRow
                key={p.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedId(p.id)}
              >
                <TableCell className="font-medium text-[12px]">{p.nombre}</TableCell>
                <TableCell className="text-center text-[12px]">{p.docs}</TableCell>
                <TableCell className="text-right text-[12px]">{fmt(p.totalComprado)}</TableCell>
                <TableCell className={cn("text-right font-bold text-[12px]", p.saldoPendiente > 0.01 ? 'text-destructive' : 'text-success')}>
                  {fmt(p.saldoPendiente)}
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin proveedores con compras</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
