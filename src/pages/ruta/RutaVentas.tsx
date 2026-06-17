import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronRight, Banknote } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { fmtDate } from '@/lib/utils';
import { useDateFilter } from '@/hooks/useDateFilter';
import DateFilterBar from '@/components/ruta/DateFilterBar';
import { useCurrency } from '@/hooks/useCurrency';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';

type Tab = 'todas' | 'por_cobrar';

export default function RutaVentas() {
  const navigate = useNavigate();
  const { empresa, profile, user, overrideVendedorId } = useAuth();
  const { fmt } = useCurrency();
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<Tab>('todas');
  const { desde, hasta, setDesde, setHasta, filterByDate } = useDateFilter();
  // Super admin impersonando: usa el vendedor seleccionado en el switcher "Viendo:"
  const isSA = isSuperAdminEmail(user?.email);
  const vendedorId = (isSA && overrideVendedorId) ? overrideVendedorId : profile?.id;


  const { data: ventas, isLoading } = useOfflineQuery('ventas', {
    empresa_id: empresa?.id,
    vendedor_id: vendedorId,
  }, {
    enabled: !!empresa?.id && !!vendedorId,
    orderBy: 'created_at',
    ascending: false,
  });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c.nombre]));

  // Cuentas por cobrar de este vendedor (ignora filtro de fechas para no esconder vencidas)
  const porCobrar = useMemo(() => {
    return ((ventas ?? []) as any[])
      .filter(v => (v.saldo_pendiente ?? 0) > 0 && v.status !== 'cancelado' && v.status !== 'borrador')
      .map(v => ({ ...v, _clienteNombre: clienteMap.get(v.cliente_id) ?? 'Sin cliente' }))
      .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime());
  }, [ventas, clientes]);

  const totalPorCobrar = porCobrar.reduce((s, v: any) => s + (v.saldo_pendiente ?? 0), 0);

  const enrichedTodas = filterByDate((ventas ?? []) as any[], 'fecha').map((v: any) => ({
    ...v,
    _clienteNombre: clienteMap.get(v.cliente_id) ?? 'Sin cliente',
  }));

  const statusColors: Record<string, string> = {
    borrador: 'bg-card/50 text-muted-foreground',
    confirmado: 'bg-primary/10 text-primary',
    entregado: 'bg-success/10 text-success',
    facturado: 'bg-success/10 text-success',
    cancelado: 'bg-destructive/10 text-destructive',
  };

  const sourceList: any[] = tab === 'por_cobrar' ? porCobrar : enrichedTodas;
  const filtered = sourceList.filter((v: any) =>
    !search || v.folio?.toLowerCase().includes(search.toLowerCase()) ||
    v._clienteNombre?.toLowerCase().includes(search.toLowerCase())
  );

  const today = new Date();
  const diasVencido = (fecha: string) =>
    Math.max(0, Math.floor((today.getTime() - new Date(fecha).getTime()) / 86400000));

  return (
    <div className="flex flex-col h-full">
      <div className="sticky top-0 z-10 bg-background px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[20px] font-bold text-foreground">Ventas</h1>
          <button
            onClick={() => navigate('/ruta/ventas/nueva')}
            className="bg-primary text-primary-foreground rounded-xl px-4 py-2 text-[13px] font-semibold flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus className="h-4 w-4" /> Nueva
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mb-3 bg-accent rounded-lg p-[4px] border-0">
          <button
            onClick={() => setTab('todas')}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors ${tab === 'todas' ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' : 'text-muted-foreground'}`}
          >
            Todas
          </button>
          <button
            onClick={() => setTab('por_cobrar')}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-colors flex items-center justify-center gap-1.5 ${tab === 'por_cobrar' ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/25' : 'text-muted-foreground'}`}
          >
            Por cobrar
            {porCobrar.length > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px]">
                {porCobrar.length}
              </span>
            )}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar por folio o cliente..."
            className="w-full bg-card border border-border rounded-xl pl-9 pr-3 py-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {tab === 'todas' && (
          <DateFilterBar desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
        )}
        {tab === 'por_cobrar' && porCobrar.length > 0 && (
          <div className="mt-3 bg-destructive/8 border border-destructive/20 rounded-xl p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total por cobrar</p>
              <p className="text-2xl font-bold text-destructive tabular-nums">{fmt(totalPorCobrar)}</p>
            </div>
            <p className="text-sm text-muted-foreground">{porCobrar.length} ventas</p>
          </div>
        )}
      </div>

      <div className="flex-1 px-4 space-y-2 pb-4">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
        {filtered.map((v: any) => {
          const saldo = v.saldo_pendiente ?? 0;
          const esCredito = v.condicion_pago === 'credito';
          const dias = tab === 'por_cobrar' ? diasVencido(v.fecha) : 0;
          return (
            <div
              key={v.id}
              className="w-full bg-card border border-border rounded-xl p-3.5 flex items-center gap-3 text-left"
            >
              <button
                onClick={() => navigate(`/ruta/ventas/${v.id}`)}
                className="flex-1 min-w-0 text-left active:opacity-70"
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[14px] font-semibold text-foreground">{v.folio ?? '—'}</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[v.status] ?? ''}`}>
                    {v.status}
                  </span>
                  <span className={`text-[10px] font-medium ${esCredito ? 'text-warning' : 'text-muted-foreground'}`}>
                    {esCredito ? '· Crédito' : '· Contado'}
                  </span>
                </div>
                <p className="text-[12px] text-muted-foreground truncate mt-0.5">{v._clienteNombre}</p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtDate(v.fecha)}
                  {tab === 'por_cobrar' && dias > 0 && (
                    <span className={`ml-2 font-medium ${dias > 30 ? 'text-destructive' : dias > 15 ? 'text-warning' : 'text-muted-foreground'}`}>
                      · {dias}d
                    </span>
                  )}
                </p>
              </button>
              <div className="text-right shrink-0">
                <p className="text-[15px] font-bold text-foreground">{fmt(v.total ?? 0)}</p>
                {saldo > 0 && v.status !== 'cancelado' && (
                  <p className="text-[11px] font-medium text-destructive">Saldo: {fmt(saldo)}</p>
                )}
                {saldo <= 0 && v.status !== 'borrador' && v.status !== 'cancelado' && (
                  <p className="text-[11px] font-medium text-primary">Pagado</p>
                )}
              </div>
              {tab === 'por_cobrar' ? (
                <button
                  onClick={() => navigate(`/ruta/ventas/${v.id}`)}
                  className="shrink-0 bg-success text-white rounded-lg px-2.5 py-2 text-[11px] font-bold flex items-center gap-1 active:scale-95 transition-transform"
                  title="Cobrar"
                >
                  <Banknote className="h-3.5 w-3.5" />
                  Cobrar
                </button>
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          );
        })}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">
            {tab === 'por_cobrar' ? 'Sin cuentas por cobrar 🎉' : 'No hay ventas'}
          </p>
        )}
      </div>
    </div>
  );
}
