import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Search, ChevronRight } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { fmtDate } from '@/lib/utils';
import { useDateFilter } from '@/hooks/useDateFilter';
import DateFilterBar from '@/components/ruta/DateFilterBar';

export default function RutaVentas() {
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const [search, setSearch] = useState('');
  const { desde, hasta, setDesde, setHasta, filterByDate } = useDateFilter();
  const vendedorId = profile?.vendedor_id || profile?.id;

  const { data: ventas, isLoading } = useOfflineQuery('ventas', {
    empresa_id: empresa?.id,
    vendedor_id: vendedorId,
  }, {
    enabled: !!empresa?.id && !!vendedorId,
    orderBy: 'created_at',
    ascending: false,
  });

  // Enrich with client names from local cache
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c.nombre]));

  const enriched = filterByDate((ventas ?? []) as any[], 'fecha').map((v: any) => ({
    ...v,
    _clienteNombre: clienteMap.get(v.cliente_id) ?? 'Sin cliente',
  }));

  const statusColors: Record<string, string> = {
    borrador: 'bg-muted/20 text-muted-foreground',
    confirmado: 'bg-primary/10 text-primary',
    entregado: 'bg-success/10 text-success',
    facturado: 'bg-success/10 text-success',
    cancelado: 'bg-destructive/10 text-destructive',
  };

  const filtered = enriched.filter((v: any) =>
    !search || v.folio?.toLowerCase().includes(search.toLowerCase()) ||
    v._clienteNombre?.toLowerCase().includes(search.toLowerCase())
  );

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
      </div>

      <div className="flex-1 px-4 space-y-2 pb-4">
        {isLoading && <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>}
        {filtered.map((v: any) => (
          <button
            key={v.id}
            onClick={() => navigate(`/ruta/ventas/${v.id}`)}
            className="w-full bg-card border border-border rounded-xl p-3.5 flex items-center gap-3 active:scale-[0.98] transition-transform text-left"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-[14px] font-semibold text-foreground">{v.folio ?? '—'}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColors[v.status] ?? ''}`}>
                  {v.status}
                </span>
              </div>
              <p className="text-[12px] text-muted-foreground truncate mt-0.5">{v._clienteNombre}</p>
              <p className="text-[11px] text-muted-foreground">{fmtDate(v.fecha)}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[15px] font-bold text-foreground">$ {(v.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
          </button>
        ))}
        {!isLoading && filtered.length === 0 && (
          <p className="text-center text-muted-foreground text-[13px] py-8">No hay ventas</p>
        )}
      </div>
    </div>
  );
}
