import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';
import { useDataVisibility } from '@/hooks/useDataVisibility';

export default function RutaCxC() {
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const { fmt } = useCurrency();
  const [search, setSearch] = useState('');

  const { seeAll, clientesVisibilidad } = useDataVisibility('cobros');
  const vendedorId = profile?.id;
  // Si tiene "ver todos", trae todas las ventas de la empresa; si no, sólo las suyas
  const ventasFilter = seeAll
    ? { empresa_id: empresa?.id }
    : { empresa_id: empresa?.id, vendedor_id: vendedorId };
  const { data: ventas } = useOfflineQuery('ventas', ventasFilter, { enabled: !!empresa?.id && !!vendedorId });
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: vendedores } = useOfflineQuery('vendedores', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });


  // Si la empresa restringe clientes a "propios" y el usuario no ve todo, sólo cuentas de sus clientes
  const clientesPermitidos = useMemo(() => {
    if (seeAll || clientesVisibilidad !== 'propios') return null;
    return new Set(((clientes ?? []) as any[])
      .filter((c: any) => c.vendedor_id === profile?.id)
      .map((c: any) => c.id));
  }, [clientes, seeAll, clientesVisibilidad, profile?.id]);

  const clientesConSaldo = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; saldo: number; numCuentas: number; oldest?: string }>();
    (ventas ?? []).forEach((v: any) => {
      const saldo = Number(v.saldo_pendiente ?? 0);
      if (!v.cliente_id || saldo <= 0 || v.status === 'cancelada') return;
      if (clientesPermitidos && !clientesPermitidos.has(v.cliente_id)) return;
      const c = (clientes ?? []).find((x: any) => x.id === v.cliente_id);
      const nombre = c?.nombre ?? 'Cliente';
      const prev = map.get(v.cliente_id) ?? { id: v.cliente_id, nombre, saldo: 0, numCuentas: 0, oldest: v.fecha };
      prev.saldo += saldo;
      prev.numCuentas += 1;
      if (v.fecha && (!prev.oldest || v.fecha < prev.oldest)) prev.oldest = v.fecha;
      map.set(v.cliente_id, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.saldo - a.saldo);
  }, [ventas, clientes, clientesPermitidos]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return clientesConSaldo;
    return clientesConSaldo.filter(c => c.nombre.toLowerCase().includes(s));
  }, [clientesConSaldo, search]);

  const totalCxC = filtered.reduce((s, c) => s + c.saldo, 0);
  const today = new Date();
  const daysOld = (d?: string) => {
    if (!d) return 0;
    const dt = new Date(d + 'T12:00:00');
    return Math.max(0, Math.floor((today.getTime() - dt.getTime()) / 86400000));
  };

  return (
    <div className="p-4 space-y-3 pb-24">
      {/* KPI */}
      <div className="bg-destructive/10 border border-destructive/20 rounded-2xl p-4">
        <p className="text-[12px] text-destructive font-semibold flex items-center gap-1.5">
          <AlertCircle className="h-3.5 w-3.5" /> Cuentas por cobrar
        </p>
        <p className="text-[24px] font-bold text-foreground mt-1">{fmt(totalCxC)}</p>
        <p className="text-[11px] text-muted-foreground">{filtered.length} cliente{filtered.length === 1 ? '' : 's'} con saldo</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente..."
          className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-card border border-border text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {/* Lista */}
      {filtered.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-[13px] text-muted-foreground">Sin cuentas por cobrar 🎉</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(c => {
            const d = daysOld(c.oldest);
            const overdue = d > 30;
            return (
              <button
                key={c.id}
                onClick={() => navigate('/ruta/cobros/nuevo', { state: { clienteId: c.id } })}
                className="w-full bg-card border border-border rounded-xl p-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-foreground truncate">{c.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {c.numCuentas} cuenta{c.numCuentas === 1 ? '' : 's'}
                    {c.oldest && <span className={overdue ? 'text-destructive ml-1' : 'ml-1'}>· {d} días</span>}
                  </p>
                </div>
                <div className="text-right shrink-0 flex items-center gap-2">
                  <div>
                    <p className="text-[14px] font-bold text-destructive">{fmt(c.saldo)}</p>
                    <p className="text-[10px] text-primary font-semibold">Cobrar →</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
