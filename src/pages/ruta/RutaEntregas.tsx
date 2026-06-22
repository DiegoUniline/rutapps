import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Truck, ChevronRight, Package, MapPin, Navigation, CheckCircle2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { fmtDate, cn, todayLocal } from '@/lib/utils';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { clienteTieneDia, diaFromDate } from '@/lib/rutaDays';

type StatusFilter = 'todos' | 'pendientes' | 'hecho' | 'no_entregado';

const statusMeta: Record<string, { label: string; className: string }> = {
  cargado: { label: 'Cargado', className: 'border-warning text-warning' },
  en_ruta: { label: 'En ruta', className: 'border-warning text-warning' },
  hecho: { label: 'Entregado', className: 'border-green-600/60 text-green-600' },
  no_entregado: { label: 'No entregado', className: 'border-destructive/60 text-destructive' },
};

function EntregaCard({ e, navigate, dimmed }: { e: any; navigate: (path: string) => void; dimmed?: boolean }) {
  const meta = statusMeta[e.status] ?? { label: e.status, className: 'border-border text-muted-foreground' };
  return (
    <button
      onClick={() => navigate(`/ruta/entregas/${e.id}`)}
      className={cn(
        'w-full text-left bg-card border border-border rounded-2xl overflow-hidden active:scale-[0.98] transition-transform',
        dimmed && 'opacity-60'
      )}
    >
      <div className="p-4 space-y-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-mono text-muted-foreground">{e.folio}</p>
            <p className="text-[15px] font-semibold text-foreground">{e._cliente?.nombre ?? '—'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Badge variant="outline" className={cn('text-[10px]', meta.className)}>
              {meta.label}
            </Badge>
            <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
          </div>
        </div>

        {(e._cliente?.direccion || e._cliente?.colonia) && (
          <div className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
            <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>{[e._cliente?.direccion, e._cliente?.colonia].filter(Boolean).join(', ')}</span>
          </div>
        )}

        {e.status === 'no_entregado' && e.motivo_no_entrega && (
          <div className="flex items-start gap-1.5 text-[11px] text-destructive">
            <XCircle className="h-3 w-3 mt-0.5 shrink-0" />
            <span className="font-medium">{e.motivo_no_entrega}</span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <p className="text-[11px] text-muted-foreground">
            {e.status === 'hecho' && e.fecha_entrega
              ? `Entregado ${fmtDate(e.fecha_entrega)}`
              : fmtDate(e.fecha)}
          </p>
          <p className="text-[12px] font-medium text-foreground">{e._totalPiezas} pza{e._totalPiezas !== 1 ? 's' : ''} · {e._lineas.length} línea{e._lineas.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
    </button>
  );
}

export default function RutaEntregas() {
  const navigate = useNavigate();
  const { empresa, profile } = useAuth();
  const { clientesVisibilidad } = useDataVisibility('clientes');
  const vendedorId = profile?.id;
  const today = todayLocal();
  const diaHoy = diaFromDate(today);
  const [filter, setFilter] = useState<StatusFilter>('todos');

  const { data: allEntregas } = useOfflineQuery('entregas', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id, orderBy: 'fecha' });

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: entregaLineasOffline } = useOfflineQuery('entrega_lineas', {}, { enabled: !!empresa?.id });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });

  // Online fetch of lines for this vendor's entregas — ensures fresh counts even if offline cache is stale
  const entregaIds = useMemo(
    () => (allEntregas ?? [])
      .filter((e: any) =>
        ['cargado', 'en_ruta', 'hecho', 'no_entregado'].includes(e.status) &&
        (e.vendedor_ruta_id ? e.vendedor_ruta_id === vendedorId : e.vendedor_id === vendedorId)
      )
      .map((e: any) => e.id),
    [allEntregas, vendedorId]
  );

  const { data: entregaLineasOnline } = useQuery({
    queryKey: ['ruta-entrega-lineas', empresa?.id, entregaIds.join(',')],
    enabled: !!empresa?.id && entregaIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('entrega_lineas')
        .select('id, entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id')
        .in('entrega_id', entregaIds);
      return data ?? [];
    },
  });

  // Merge: online overrides offline by id; offline used as fallback
  const lineasById = new Map<string, any>();
  for (const l of (entregaLineasOffline ?? [])) lineasById.set(l.id, l);
  for (const l of (entregaLineasOnline ?? [])) lineasById.set(l.id, l);
  const entregaLineas = Array.from(lineasById.values());

  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c]));
  const productoMap = new Map((productos ?? []).map((p: any) => [p.id, p]));

  const entregas = (allEntregas ?? [])
    .filter((e: any) =>
      ['cargado', 'en_ruta', 'hecho', 'no_entregado'].includes(e.status) &&
      // Si hay vendedor_ruta_id (reasignación), solo cuenta ese; si no, cae al vendedor original
      (e.vendedor_ruta_id ? e.vendedor_ruta_id === vendedorId : e.vendedor_id === vendedorId)
    )
    .map((e: any) => {
      const cliente = clienteMap.get(e.cliente_id);
      const lineas = entregaLineas
        .filter((l: any) => l.entrega_id === e.id)
        .map((l: any) => ({
          ...l,
          _productoNombre: productoMap.get(l.producto_id)?.nombre ?? '—',
        }));
      const totalPiezas = lineas.reduce((acc: number, l: any) => acc + (l.cantidad_entregada || l.cantidad_pedida || 0), 0);
      return { ...e, _cliente: cliente, _lineas: lineas, _totalPiezas: totalPiezas };
    });

  const counts = useMemo(() => ({
    todos: entregas.length,
    pendientes: entregas.filter((e: any) => e.status === 'cargado' || e.status === 'en_ruta').length,
    hecho: entregas.filter((e: any) => e.status === 'hecho').length,
    no_entregado: entregas.filter((e: any) => e.status === 'no_entregado').length,
  }), [entregas]);

  const paradasNavegablesHoy = useMemo(() => {
    const entregasHoy = entregas.filter((e: any) =>
      (e.status === 'cargado' || e.status === 'en_ruta') &&
      (e.fecha ?? '').slice(0, 10) === today &&
      !!e._cliente?.gps_lat && !!e._cliente?.gps_lng
    ).length;
    const clientesHoy = (clientes ?? []).filter((c: any) => {
      if (c.status !== 'activo' || !c.gps_lat || !c.gps_lng || !clienteTieneDia(c, diaHoy)) return false;
      if (clientesVisibilidad === 'propios' && vendedorId) return c.vendedor_id === vendedorId;
      return true;
    }).length;
    return entregasHoy + clientesHoy;
  }, [entregas, clientes, today, diaHoy, clientesVisibilidad, vendedorId]);

  const visible = useMemo(() => {
    let list: any[] = entregas;
    if (filter === 'pendientes') list = list.filter(e => e.status === 'cargado' || e.status === 'en_ruta');
    else if (filter === 'hecho') list = list.filter(e => e.status === 'hecho');
    else if (filter === 'no_entregado') list = list.filter(e => e.status === 'no_entregado');
    // sort: pendientes first, then no_entregado, then hecho
    return [...list].sort((a, b) => {
      const order: Record<string, number> = { cargado: 0, en_ruta: 0, no_entregado: 1, hecho: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    });
  }, [entregas, filter]);

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'todos', label: 'Todas', count: counts.todos },
    { key: 'pendientes', label: 'Pendientes', count: counts.pendientes },
    { key: 'hecho', label: 'Entregadas', count: counts.hecho },
    { key: 'no_entregado', label: 'No entregadas', count: counts.no_entregado },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Truck className="h-5 w-5 text-primary" />
        <h1 className="text-[18px] font-bold text-foreground">Entregas</h1>
        <Badge variant="secondary" className="text-[11px]">{counts.pendientes} pendientes</Badge>
        {paradasNavegablesHoy > 0 && (
          <Button
            size="sm"
            className="ml-auto rounded-xl gap-1.5 text-[11px] bg-brand-orange text-brand-orange-foreground hover:bg-brand-orange/90"
            onClick={() => navigate('/ruta/navegacion')}
          >
            <Navigation className="h-3.5 w-3.5" /> Navegar
          </Button>
        )}
      </div>

      {/* Status filter chips */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 pb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setFilter(t.key)}
            className={cn(
              'shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors',
              filter === t.key
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card text-muted-foreground border-border'
            )}
          >
            {t.label} <span className="opacity-70">({t.count})</span>
          </button>
        ))}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            {filter === 'todos' ? 'No tienes entregas' : 'Sin entregas en este filtro'}
          </p>
        </div>
      )}

      {visible.map((e: any) => (
        <EntregaCard key={e.id} e={e} navigate={navigate} dimmed={e.status === 'hecho' || e.status === 'no_entregado'} />
      ))}
    </div>
  );
}
