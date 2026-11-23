import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ChevronRight, Package, MapPin, Navigation, CheckCircle2, XCircle, Banknote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { fmtDate, cn, todayLocal } from '@/lib/utils';
import { useDataVisibility } from '@/hooks/useDataVisibility';
import { clienteTieneDia, diaFromDate } from '@/lib/rutaDays';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useVendedorRutaVista } from '@/hooks/useVendedorRutaVista';
import { useZonaFiltroRuta, clienteEnZona } from '@/components/ruta/ZonaFiltroRuta';
import { useClienteOrdenRuta } from '@/hooks/useClienteOrdenRuta';

type StatusFilter = 'todos' | 'pendientes' | 'hecho' | 'no_entregado';

const statusMeta: Record<string, { label: string; className: string }> = {
  cargado: { label: 'Cargado', className: 'text-warning' },
  en_ruta: { label: 'En ruta', className: 'text-warning' },
  hecho: { label: 'Entregado', className: 'text-emerald-600' },
  no_entregado: { label: 'No entregado', className: 'text-destructive' },
};

function EntregaCard({ e, idx, navigate }: { e: any; idx: number; navigate: (path: string) => void }) {
  const esParcial = e.status === 'hecho' && (e._lineas ?? []).some((l: any) => {
    const ent = Number(l.cantidad_entregada ?? 0);
    const ped = Number(l.cantidad_pedida ?? 0);
    return ped > 0 && ent < ped;
  });
  const baseMeta = statusMeta[e.status] ?? { label: e.status, className: 'text-muted-foreground' };
  const meta = esParcial ? { label: 'Parcial', className: 'text-amber-600 dark:text-amber-400' } : baseMeta;
  const hecho = e.status === 'hecho';
  const noEntregado = e.status === 'no_entregado';
  const hasGps = !!e._cliente?.gps_lat && !!e._cliente?.gps_lng;
  const piezas = esParcial
    ? `${e._totalEntregado}/${e._totalPedido} pza`
    : `${e._totalPiezas} pza${e._totalPiezas !== 1 ? 's' : ''}`;
  const openMaps = (ev: React.MouseEvent) => {
    ev.stopPropagation();
    window.open(`https://www.google.com/maps/dir/?api=1&destination=${e._cliente.gps_lat},${e._cliente.gps_lng}`, '_blank');
  };
  const direccion = [e._cliente?.direccion, e._cliente?.colonia].filter(Boolean).join(', ');
  return (
    <div
      role="button"
      onClick={() => navigate(`/ruta/entregas/${e.id}`)}
      className={cn(
        'bg-card border rounded-xl px-2.5 py-2 active:bg-accent/50 transition-colors cursor-pointer',
        hecho ? 'border-emerald-500/40 bg-emerald-500/5' : noEntregado ? 'border-destructive/30' : 'border-border'
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn(
          'w-7 h-7 rounded-md flex items-center justify-center shrink-0',
          hecho ? 'bg-emerald-500 text-white' : noEntregado ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'
        )}>
          {hecho ? <CheckCircle2 className="h-3.5 w-3.5" /> : noEntregado ? <XCircle className="h-3.5 w-3.5" /> : <span className="font-bold text-[11px]">{idx + 1}</span>}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <p className={cn('text-[13px] font-semibold truncate flex-1 min-w-0', hecho ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground')}>
              {e._cliente?.nombre ?? '—'}
            </p>
            <span className="text-[10px] text-muted-foreground font-mono shrink-0">{e.folio}</span>
          </div>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1 truncate leading-tight">
            {direccion && <><MapPin className="h-2.5 w-2.5 shrink-0" /><span className="truncate">{direccion}</span><span className="shrink-0">·</span></>}
            <span className="shrink-0">{piezas}</span>
            <span className="shrink-0">·</span>
            <span className={cn('shrink-0 font-medium', meta.className)}>{meta.label}</span>
          </p>
          {noEntregado && e.motivo_no_entrega && (
            <p className="text-[10px] text-destructive truncate leading-tight">{e.motivo_no_entrega}</p>
          )}
        </div>

        {hecho && e._saldo > 0.009 && e.pedido_id && (
          <button
            onClick={(ev) => { ev.stopPropagation(); navigate(`/ruta/ventas/${e.pedido_id}?cobrar=1`); }}
            className="h-7 px-2 rounded-md bg-primary text-primary-foreground flex items-center gap-1 text-[11px] font-semibold active:scale-90 transition-transform shrink-0"
            title="Cobrar"
          >
            <Banknote className="h-3.5 w-3.5" /> Cobrar
          </button>
        )}
        {hasGps && !hecho && (
          <button
            onClick={openMaps}
            className="h-7 w-7 rounded-md bg-primary/10 flex items-center justify-center text-primary active:scale-90 transition-transform shrink-0"
            title="Navegar a este cliente"
          >
            <Navigation className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
      </div>
    </div>
  );
}

export default function RutaEntregas() {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const { clientesVisibilidad } = useDataVisibility('clientes');
  // Super admin viendo a otro vendedor: sus entregas y clientes se leen del servidor
  // (el celular solo tiene sincronizado lo del propio usuario; antes salía «No tienes entregas»).
  const { vendedorId, desdeServidor } = useVendedorRutaVista();
  const today = todayLocal();
  const diaHoy = diaFromDate(today);
  const [filter, setFilter] = useState<StatusFilter>('pendientes');
  // Zona universal: las entregas se filtran por la zona de su cliente.
  const { zona, setZona } = useZonaFiltroRuta();
  const { ordenMap } = useClienteOrdenRuta(vendedorId, diaHoy);

  const { data: entregasOffline } = useOfflineQuery('entregas', {
    empresa_id: empresa?.id,
  }, { enabled: !!empresa?.id && !desdeServidor, orderBy: 'fecha' });
  const { data: clientesOffline } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id && !desdeServidor });
  // Saldo del pedido de cada entrega (para el botón Cobrar en las ya entregadas).
  const { data: ventasOffline } = useOfflineQuery('ventas', { empresa_id: empresa?.id }, { enabled: !!empresa?.id && !desdeServidor });

  const { data: entregasServidor } = useQuery({
    queryKey: ['sa-ruta-entregas', empresa?.id, vendedorId],
    enabled: !!empresa?.id && !!vendedorId && desdeServidor,
    queryFn: () => {
      // Pendientes completas; entregadas / no entregadas solo de los últimos 7 días
      // (antes todo el historial del repartidor, que crece sin límite).
      const desde = new Date(Date.now() - 7 * 86400000).toISOString();
      return fetchAllPages((from, to) => supabase
        .from('entregas')
        .select('id, empresa_id, folio, pedido_id, vendedor_id, cliente_id, almacen_id, fecha, status, notas, vendedor_ruta_id, fecha_asignacion, fecha_carga, orden_entrega, fecha_entrega, motivo_no_entrega, created_at, updated_at')
        .eq('empresa_id', empresa!.id)
        .or(`vendedor_ruta_id.eq.${vendedorId},vendedor_id.eq.${vendedorId}`)
        .or(`status.in.(cargado,en_ruta),and(status.in.(hecho,no_entregado),updated_at.gte.${desde})`)
        .order('fecha')
        .order('id')
        .range(from, to));
    },
  });
  const { data: clientesServidor } = useQuery({
    queryKey: ['sa-ruta-entregas-clientes', empresa?.id],
    enabled: !!empresa?.id && desdeServidor,
    queryFn: () => fetchAllPages((from, to) => supabase
      .from('clientes').select('id, nombre, direccion, colonia, gps_lat, gps_lng, status, vendedor_id, dia_visita, zona_id, orden')
      .eq('empresa_id', empresa!.id).order('id').range(from, to)),
  });

  const allEntregas = desdeServidor ? entregasServidor : entregasOffline;
  const clientes = desdeServidor ? clientesServidor : clientesOffline;
  const { data: entregaLineasOffline } = useOfflineQuery('entrega_lineas', {}, { enabled: !!empresa?.id, localOnly: true });
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
      // En trozos de 200 ids: una lista larga en la URL hacía fallar la consulta (y se veía vacía).
      const out: any[] = [];
      for (let i = 0; i < entregaIds.length; i += 200) {
        const { data, error } = await supabase
          .from('entrega_lineas')
          .select('id, entrega_id, producto_id, cantidad_pedida, cantidad_entregada, hecho, almacen_origen_id')
          .in('entrega_id', entregaIds.slice(i, i + 200));
        if (error) throw error;
        out.push(...(data ?? []));
      }
      return out;
    },
  });

  // Merge: online overrides offline by id; offline used as fallback
  const lineasById = new Map<string, any>();
  for (const l of (entregaLineasOffline ?? [])) lineasById.set(l.id, l);
  for (const l of (entregaLineasOnline ?? [])) lineasById.set(l.id, l);
  const entregaLineas = Array.from(lineasById.values());

  const clienteMap = new Map((clientes ?? []).map((c: any) => [c.id, c]));
  const productoMap = new Map((productos ?? []).map((p: any) => [p.id, p]));

  const saldoPorPedido = new Map<string, number>(
    ((ventasOffline ?? []) as any[]).map((v: any) => [v.id, Number(v.saldo_pendiente) || 0])
  );
  const entregas = (allEntregas ?? [])
    .filter((e: any) =>
      ['cargado', 'en_ruta', 'hecho', 'no_entregado'].includes(e.status) &&
      // Si hay vendedor_ruta_id (reasignación), solo cuenta ese; si no, cae al vendedor original
      (e.vendedor_ruta_id ? e.vendedor_ruta_id === vendedorId : e.vendedor_id === vendedorId) &&
      clienteEnZona(clienteMap.get(e.cliente_id) as any, zona)
    )
    .map((e: any) => {
      const cliente = clienteMap.get(e.cliente_id);
      const lineas = entregaLineas
        .filter((l: any) => l.entrega_id === e.id)
        .map((l: any) => ({
          ...l,
          _productoNombre: productoMap.get(l.producto_id)?.nombre ?? '—',
        }));
      const totalEntregado = lineas.reduce((acc: number, l: any) => acc + (Number(l.cantidad_entregada) || 0), 0);
      const totalPedido = lineas.reduce((acc: number, l: any) => acc + (Number(l.cantidad_pedida) || 0), 0);
      const totalPiezas = lineas.reduce((acc: number, l: any) => acc + (l.cantidad_entregada || l.cantidad_pedida || 0), 0);
      const saldo = Number(saldoPorPedido.get(e.pedido_id) ?? 0);
      return { ...e, _cliente: cliente, _lineas: lineas, _totalPiezas: totalPiezas, _totalEntregado: totalEntregado, _totalPedido: totalPedido, _saldo: saldo };
    });


  const counts = useMemo(() => ({
    todos: entregas.length,
    pendientes: entregas.filter((e: any) => e.status === 'cargado' || e.status === 'en_ruta').length,
    hecho: entregas.filter((e: any) => e.status === 'hecho').length,
    no_entregado: entregas.filter((e: any) => e.status === 'no_entregado').length,
  }), [entregas]);

  // Clientes donde el usuario actual es repartidor (vendedor_ruta_id) en alguna entrega.
  // Un cliente solo tiene un vendedor pero puede tener varios repartidores.
  const clientesComoRepartidor = useMemo(() => {
    const set = new Set<string>();
    if (!vendedorId) return set;
    (allEntregas ?? []).forEach((e: any) => {
      if (e.vendedor_ruta_id === vendedorId && e.cliente_id) set.add(e.cliente_id);
    });
    return set;
  }, [allEntregas, vendedorId]);

  const paradasNavegablesHoy = useMemo(() => {
    const entregasHoy = entregas.filter((e: any) =>
      (e.status === 'cargado' || e.status === 'en_ruta') &&
      (e.fecha ?? '').slice(0, 10) === today &&
      !!e._cliente?.gps_lat && !!e._cliente?.gps_lng
    ).length;
    const clientesHoy = (clientes ?? []).filter((c: any) => {
      if (c.status !== 'activo' || !c.gps_lat || !c.gps_lng || !clienteTieneDia(c, diaHoy) || !clienteEnZona(c, zona)) return false;
      if (clientesVisibilidad === 'propios' && vendedorId) {
        return c.vendedor_id === vendedorId || clientesComoRepartidor.has(c.id);
      }
      return true;
    }).length;
    return entregasHoy + clientesHoy;
  }, [entregas, clientes, today, diaHoy, clientesVisibilidad, vendedorId, clientesComoRepartidor, zona]);

  const visible = useMemo(() => {
    let list: any[] = entregas;
    if (filter === 'pendientes') list = list.filter(e => e.status === 'cargado' || e.status === 'en_ruta');
    else if (filter === 'hecho') list = list.filter(e => e.status === 'hecho');
    else if (filter === 'no_entregado') list = list.filter(e => e.status === 'no_entregado');
    // Pendientes, luego no entregadas, luego entregadas; dentro de cada grupo, el mismo
    // orden de ruta del cliente que la pestaña Clientes (cliente_orden_ruta del día → clientes.orden).
    const ordenCliente = (e: any) => ordenMap.get(e.cliente_id) ?? null;
    return [...list].sort((a, b) => {
      const order: Record<string, number> = { cargado: 0, en_ruta: 0, no_entregado: 1, hecho: 2 };
      const g = (order[a.status] ?? 3) - (order[b.status] ?? 3);
      if (g !== 0) return g;
      const oa = ordenCliente(a), ob = ordenCliente(b);
      if (oa != null && ob != null && oa !== ob) return oa - ob;
      if (oa != null && ob == null) return -1;
      if (ob != null && oa == null) return 1;
      const la = a._cliente?.orden ?? 9999, lb = b._cliente?.orden ?? 9999;
      if (la !== lb) return la - lb;
      return String(a.fecha ?? '').localeCompare(String(b.fecha ?? '')) || String(a.folio ?? '').localeCompare(String(b.folio ?? ''));
    });
  }, [entregas, filter, ordenMap]);

  const tabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'pendientes', label: 'Pendientes', count: counts.pendientes },
    { key: 'hecho', label: 'Entregadas', count: counts.hecho },
    { key: 'no_entregado', label: 'No entreg.', count: counts.no_entregado },
    { key: 'todos', label: 'Todas', count: counts.todos },
  ];

  return (
    <div className="px-4 pt-2 pb-4 space-y-2">
      <div className="flex items-center gap-2">
        <h1 className="text-[18px] font-bold text-foreground">Entregas</h1>
        <Badge variant="secondary" className="text-[11px]">{counts.pendientes} pendientes</Badge>
        {paradasNavegablesHoy > 0 && (
          <button
            onClick={() => navigate('/ruta/navegacion')}
            className="ml-auto inline-flex items-center gap-1.5 rounded-xl bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
          >
            <Navigation className="h-3.5 w-3.5" /> Navegar
          </button>
        )}
      </div>

      <div className="flex gap-0.5 bg-accent rounded-lg p-[4px]">
        {tabs.map(t => {
          const activo = filter === t.key;
          const verde = t.key === 'hecho';
          return (
            <button
              key={t.key}
              onClick={() => setFilter(t.key)}
              className={cn(
                'flex-1 py-1.5 rounded-md text-[11px] font-semibold transition-colors whitespace-nowrap',
                activo ? (verde ? 'bg-emerald-600 text-white shadow-sm' : 'bg-primary text-primary-foreground shadow-sm') : 'text-muted-foreground'
              )}
            >
              {t.label}
              {t.key !== 'todos' && t.count > 0 && (
                <span className={cn(
                  'ml-0.5 text-[9px] px-1 py-px rounded-full font-bold',
                  activo ? 'bg-white/20' : verde ? 'bg-emerald-500/10 text-emerald-600' : 'bg-primary/10 text-primary'
                )}>{t.count}</span>
              )}
            </button>
          );
        })}
      </div>

      {visible.length === 0 && (
        <div className="text-center py-16">
          <Package className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="text-muted-foreground text-sm">
            {zona ? 'Sin entregas de esta zona' : filter === 'todos' ? 'No tienes entregas' : 'Sin entregas en este filtro'}
          </p>
          {zona && (
            <button onClick={() => setZona('')} className="mt-3 inline-flex items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground active:scale-95">
              Ver todas las zonas
            </button>
          )}
        </div>
      )}

      {visible.map((e: any, idx: number) => (
        <EntregaCard key={e.id} e={e} idx={idx} navigate={navigate} />
      ))}
    </div>
  );
}
