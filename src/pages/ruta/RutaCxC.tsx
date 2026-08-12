import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ChevronRight, ChevronDown, AlertCircle, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { fmtDate } from '@/lib/utils';


export default function RutaCxC() {
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const { fmt } = useCurrency();
  const [search, setSearch] = useState('');

  const { clientesVisibilidad } = useDataVisibility('cobros');
  const vendedorId = profile?.id;
  // La configuración de empresa "clientes_visibilidad" manda en app móvil.
  // 'todos' = todas las ventas; 'propios' = filtrar por clientes asignados al vendedor.
  const limitarPorClientesPropios = clientesVisibilidad === 'propios' && !!vendedorId;
  const { data: ventas } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: vendedores } = useOfflineQuery('vendedores', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });


  // En móvil, la configuración "clientes propios" manda sobre "ver todos".
  const clientesPermitidos = useMemo(() => {
    if (!limitarPorClientesPropios) return null;
    return new Set(((clientes ?? []) as any[])
      .filter((c: any) => c.vendedor_id === vendedorId)
      .map((c: any) => c.id));
  }, [clientes, limitarPorClientesPropios, vendedorId]);

  const vendedorMap = useMemo(() => {
    const map = new Map<string, string>();
    (vendedores ?? []).forEach((v: any) => {
      if (v.id && v.nombre) map.set(v.id, v.nombre);
    });
    return map;
  }, [vendedores]);

  interface DocCxC { id: string; folio: string | null; fecha: string; saldo: number }

  const clientesConSaldo = useMemo(() => {
    const map = new Map<string, { id: string; nombre: string; saldo: number; numCuentas: number; oldest?: string; vendedorId?: string; vendedorNombre?: string; docs: DocCxC[] }>();
    (ventas ?? []).forEach((v: any) => {
      const saldo = Number(v.saldo_pendiente ?? 0);
      if (!v.cliente_id || saldo <= 0 || v.status === 'cancelado') return;
      if (clientesPermitidos && !clientesPermitidos.has(v.cliente_id)) return;
      const c = (clientes ?? []).find((x: any) => x.id === v.cliente_id);
      const nombre = c?.nombre ?? 'Cliente';
      const vendedorId = c?.vendedor_id ?? v.vendedor_id;
      const prev = map.get(v.cliente_id) ?? { id: v.cliente_id, nombre, saldo: 0, numCuentas: 0, oldest: v.fecha, vendedorId, docs: [] as DocCxC[] };
      prev.saldo += saldo;
      prev.numCuentas += 1;
      prev.docs.push({ id: v.id, folio: v.folio ?? null, fecha: v.fecha, saldo });
      if (v.fecha && (!prev.oldest || v.fecha < prev.oldest)) prev.oldest = v.fecha;
      if (!prev.vendedorId && vendedorId) prev.vendedorId = vendedorId;
      map.set(v.cliente_id, prev);
    });
    return Array.from(map.values()).map(c => ({
      ...c,
      // Documentos ordenados de la nota más vieja a la más nueva.
      docs: c.docs.sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '')),
      vendedorNombre: c.vendedorId ? vendedorMap.get(c.vendedorId) ?? undefined : undefined,
    })).sort((a, b) => b.saldo - a.saldo);
  }, [ventas, clientes, clientesPermitidos, vendedorMap]);



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
            const abierto = expandido === c.id;
            const sel = seleccion[c.id] ?? [];
            const totalSel = c.docs.filter(doc => sel.includes(doc.id)).reduce((s, doc) => s + doc.saldo, 0);
            return (
              <div key={c.id} className="bg-card border border-border rounded-xl overflow-hidden">
                <button
                  onClick={() => { setExpandido(abierto ? null : c.id); }}
                  className="w-full p-3 flex items-center justify-between gap-3 text-left active:scale-[0.99] transition-transform"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-foreground truncate">{c.nombre}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.numCuentas} cuenta{c.numCuentas === 1 ? '' : 's'}
                      {c.oldest && <span className={overdue ? 'text-destructive ml-1' : 'ml-1'}>· {d} días</span>}
                    </p>
                    {c.vendedorNombre && (
                      <p className="text-[10px] text-primary font-medium mt-0.5">Vendedor: {c.vendedorNombre}</p>
                    )}
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-[14px] font-bold text-destructive">{fmt(c.saldo)}</p>
                      <p className="text-[10px] text-primary font-semibold">{abierto ? 'Ocultar' : 'Ver notas'}</p>
                    </div>
                    {abierto
                      ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {abierto && (
                  <div className="border-t border-border px-3 py-2 space-y-1.5 bg-accent/20">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                        Notas (más antigua primero)
                      </p>
                      <button
                        onClick={() => toggleTodos(c.id, c.docs.map(doc => doc.id))}
                        className="text-[11px] font-semibold text-primary"
                      >
                        {sel.length === c.docs.length ? 'Quitar todas' : 'Seleccionar todas'}
                      </button>
                    </div>

                    {c.docs.map(doc => {
                      const marcado = sel.includes(doc.id);
                      const dd = daysOld(doc.fecha);
                      return (
                        <div
                          key={doc.id}
                          className={`flex items-center gap-2 rounded-lg px-2.5 py-2 border ${marcado ? 'bg-primary/5 border-primary/40' : 'bg-card border-border'}`}
                        >
                          <button
                            onClick={() => toggleDoc(c.id, doc.id)}
                            className={`h-5 w-5 rounded-md border flex items-center justify-center shrink-0 ${marcado ? 'bg-primary border-primary' : 'border-border'}`}
                            aria-label="Seleccionar nota"
                          >
                            {marcado && <Check className="h-3.5 w-3.5 text-primary-foreground" />}
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-semibold text-foreground truncate">{doc.folio || 'Sin folio'}</p>
                            <p className="text-[10px] text-muted-foreground">
                              {fmtDate(doc.fecha)} · {dd}d
                              {dd > 30 && <span className="text-destructive ml-1">vencida</span>}
                            </p>
                          </div>
                          <p className="text-[13px] font-bold text-destructive tabular-nums shrink-0">{fmt(doc.saldo)}</p>
                          <button
                            onClick={() => navigate('/ruta/cobros/nuevo', { state: { clienteId: c.id, ventaIds: [doc.id] } })}
                            className="text-[11px] font-semibold text-primary shrink-0 px-2 py-1 rounded-lg bg-primary/10"
                          >
                            Cobrar
                          </button>
                        </div>
                      );
                    })}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => navigate('/ruta/cobros/nuevo', { state: { clienteId: c.id, ventaIds: sel } })}
                        disabled={sel.length === 0}
                        className="flex-1 bg-primary text-primary-foreground rounded-lg py-2.5 text-[13px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                      >
                        Cobrar {sel.length} nota{sel.length === 1 ? '' : 's'} · {fmt(totalSel)}
                      </button>
                      <button
                        onClick={() => navigate('/ruta/cobros/nuevo', { state: { clienteId: c.id, ventaIds: c.docs.map(doc => doc.id) } })}
                        className="flex-1 bg-success text-success-foreground rounded-lg py-2.5 text-[13px] font-bold active:scale-[0.98] transition-transform"
                      >
                        Liquidar todo · {fmt(c.saldo)}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

        </div>
      )}
    </div>
  );
}
