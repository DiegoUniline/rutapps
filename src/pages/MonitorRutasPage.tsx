import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useVendedores } from '@/hooks/useClientes';
import { useGoogleMaps, GoogleMapsProvider } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, MarkerF, InfoWindow } from '@react-google-maps/api';
import {
  Activity, Users, MapPin, CheckCircle2, XCircle, Clock, Truck,
  ShoppingCart, TrendingUp, Eye, BarChart3, Package, Navigation, CalendarIcon, Filter
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type VisitStatus = 'visited' | 'sold' | 'pending' | 'delivered' | 'en_ruta';

interface ClientVisit {
  id: string;
  nombre: string;
  codigo?: string;
  direccion?: string;
  colonia?: string;
  telefono?: string;
  gps_lat?: number;
  gps_lng?: number;
  vendedor_id?: string;
  vendedorNombre?: string;
  status: VisitStatus;
  ventaTotal?: number;
  entregaFolio?: string;
  ordenEntrega?: number;
}

function MonitorContent() {
  const { empresa } = useAuth();
  const { isLoaded } = useGoogleMaps();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [vendedorFilters, setVendedorFilters] = useState<string[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientVisit | null>(null);
  const [view, setView] = useState<'map' | 'table'>('map');
  const mapRef = useRef<google.maps.Map | null>(null);

  const dateStr = format(selectedDate, 'yyyy-MM-dd');
  const dayIdx = selectedDate.getDay() === 0 ? 6 : selectedDate.getDay() - 1;
  const diaVisita = DIAS[dayIdx];
  const diaLabel = diaVisita.charAt(0).toUpperCase() + diaVisita.slice(1);

  const toggleVendedor = (id: string) => {
    setVendedorFilters(prev =>
      prev.includes(id) ? prev.filter(v => v !== id) : [...prev, id]
    );
  };

  // Vendedores
  const { data: vendedores } = useVendedores();

  // Clients scheduled for selected day
  const { data: clientesHoy } = useQuery({
    queryKey: ['monitor-clientes-hoy', empresa?.id, diaVisita],
    enabled: !!empresa?.id,
    staleTime: 60 * 1000,
    refetchInterval: 60000,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, codigo, nombre, direccion, colonia, telefono, gps_lat, gps_lng, vendedor_id, dia_visita, vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'activo')
        .order('orden', { ascending: true });
      return (data ?? []).filter((c: any) =>
        c.dia_visita?.some((d: string) => d.toLowerCase() === diaVisita)
      );
    },
  });

  // Sales for selected date
  const { data: ventasHoy } = useQuery({
    queryKey: ['monitor-ventas-hoy', dateStr],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, cliente_id, vendedor_id, total, status, tipo')
        .eq('fecha', dateStr);
      return data ?? [];
    },
  });

  // Entregas for selected date (with client GPS)
  const { data: entregasHoy } = useQuery({
    queryKey: ['monitor-entregas-hoy', dateStr],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase
        .from('entregas')
        .select('id, cliente_id, vendedor_id, vendedor_ruta_id, status, folio, orden_entrega, clientes(id, nombre, codigo, direccion, colonia, gps_lat, gps_lng, vendedor_id, vendedores(nombre))')
        .eq('fecha', dateStr);
      return data ?? [];
    },
  });

  // Cobros for selected date
  const { data: cobrosHoy } = useQuery({
    queryKey: ['monitor-cobros-hoy', dateStr],
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await supabase.from('cobros').select('id, monto').eq('fecha', dateStr);
      return data ?? [];
    },
  });

  // Build visit statuses — include scheduled clients + entregas/ventas clients
  const visits: ClientVisit[] = useMemo(() => {
    const salesByClient = new Map<string, { total: number; vendedor_id: string }>();
    (ventasHoy ?? []).forEach((v: any) => {
      const prev = salesByClient.get(v.cliente_id);
      salesByClient.set(v.cliente_id, {
        total: (prev?.total ?? 0) + (v.total ?? 0),
        vendedor_id: v.vendedor_id,
      });
    });

    const entregasByClient = new Map<string, any>();
    (entregasHoy ?? []).forEach((e: any) => {
      if (e.cliente_id) {
        const prev = entregasByClient.get(e.cliente_id);
        const clientInfo = e.clientes || prev?.clientInfo;
        // Keep highest priority: hecho > cargado > asignado > surtido > borrador
        const prevDelivered = prev?.isDelivered || false;
        const isDelivered = prevDelivered || e.status === 'hecho';
        // Use orden_entrega from the most relevant entrega
        const ordenEntrega = e.orden_entrega ?? prev?.ordenEntrega ?? 0;
        entregasByClient.set(e.cliente_id, {
          clientInfo,
          isDelivered: isDelivered,
          hasEntrega: true,
          entregaFolio: e.folio,
          entregaStatus: e.status,
          ordenEntrega,
          vendedor_ruta_id: e.vendedor_ruta_id || e.vendedor_id,
        });
      }
    });

    const getEntregaStatus = (entrega: any, sale: any): VisitStatus => {
      if (sale) return 'sold';
      if (entrega?.isDelivered) return 'delivered';
      if (entrega?.hasEntrega) return 'en_ruta';
      return 'pending';
    };

    // Start with scheduled clients
    const clientMap = new Map<string, ClientVisit>();
    (clientesHoy ?? []).forEach((c: any) => {
      const sale = salesByClient.get(c.id);
      const entrega = entregasByClient.get(c.id);

      clientMap.set(c.id, {
        id: c.id,
        nombre: c.nombre,
        codigo: c.codigo,
        direccion: c.direccion,
        colonia: c.colonia,
        telefono: c.telefono,
        gps_lat: c.gps_lat,
        gps_lng: c.gps_lng,
        vendedor_id: c.vendedor_id,
        vendedorNombre: c.vendedores?.nombre,
        status: getEntregaStatus(entrega, sale),
        ventaTotal: sale?.total,
        entregaFolio: entrega?.entregaFolio,
        ordenEntrega: entrega?.ordenEntrega,
      });
    });

    // Add clients from entregas that aren't already scheduled
    entregasByClient.forEach((info, clienteId) => {
      if (!clientMap.has(clienteId) && info.clientInfo) {
        const sale = salesByClient.get(clienteId);
        const ci = info.clientInfo;
        clientMap.set(clienteId, {
          id: clienteId,
          nombre: ci.nombre,
          codigo: ci.codigo,
          direccion: ci.direccion,
          colonia: ci.colonia,
          telefono: ci.telefono,
          gps_lat: ci.gps_lat,
          gps_lng: ci.gps_lng,
          vendedor_id: ci.vendedor_id,
          vendedorNombre: ci.vendedores?.nombre,
          status: getEntregaStatus(info, sale),
          ventaTotal: sale?.total,
          entregaFolio: info.entregaFolio,
          ordenEntrega: info.ordenEntrega,
        });
      }
    });

    return Array.from(clientMap.values());
  }, [clientesHoy, ventasHoy, entregasHoy]);

  const filtered = useMemo(() => {
    if (vendedorFilters.length === 0) return visits;
    return visits.filter(v => v.vendedor_id && vendedorFilters.includes(v.vendedor_id));
  }, [visits, vendedorFilters]);

  const withGps = useMemo(() => filtered.filter(v => v.gps_lat && v.gps_lng), [filtered]);

  // KPIs
  const totalScheduled = filtered.length;
  const totalVisited = filtered.filter(v => v.status === 'sold' || v.status === 'delivered').length;
  const totalPending = filtered.filter(v => v.status === 'pending').length;
  const totalSold = filtered.filter(v => v.status === 'sold').length;
  const totalDelivered = filtered.filter(v => v.status === 'delivered').length;
  const totalSalesAmount = filtered.reduce((acc, v) => acc + (v.ventaTotal ?? 0), 0);
  const visitRate = totalScheduled > 0 ? Math.round((totalVisited / totalScheduled) * 100) : 0;
  const totalEntregasPending = (entregasHoy ?? []).filter((e: any) => e.status !== 'hecho').length;
  const totalEntregasDone = (entregasHoy ?? []).filter((e: any) => e.status === 'hecho').length;
  const totalCobros = (cobrosHoy ?? []).reduce((acc: number, c: any) => acc + (c.monto ?? 0), 0);

  // Vendedor summary
  const vendedorSummary = useMemo(() => {
    const map = new Map<string, { nombre: string; scheduled: number; visited: number; sold: number; salesTotal: number }>();
    visits.forEach(v => {
      if (!v.vendedor_id) return;
      const prev = map.get(v.vendedor_id) ?? { nombre: v.vendedorNombre ?? '—', scheduled: 0, visited: 0, sold: 0, salesTotal: 0 };
      prev.scheduled++;
      if (v.status === 'sold' || v.status === 'delivered') prev.visited++;
      if (v.status === 'sold') { prev.sold++; prev.salesTotal += v.ventaTotal ?? 0; }
      map.set(v.vendedor_id, prev);
    });
    return Array.from(map.entries()).map(([id, d]) => ({ id, ...d }));
  }, [visits]);

  // Auto-zoom to fit markers when filter changes
  const fitBounds = useCallback(() => {
    if (mapRef.current && withGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      withGps.forEach(c => bounds.extend({ lat: c.gps_lat!, lng: c.gps_lng! }));
      mapRef.current.fitBounds(bounds, 60);
    }
  }, [withGps]);

  useEffect(() => {
    fitBounds();
  }, [fitBounds]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    fitBounds();
  }, [fitBounds]);

  const statusColor = (s: VisitStatus) => {
    switch (s) {
      case 'sold': return '#22c55e';
      case 'delivered': return '#3b82f6';
      case 'en_ruta': return '#f59e0b';
      case 'pending': return '#ef4444';
      default: return '#94a3b8';
    }
  };

  const statusLabel = (s: VisitStatus) => {
    switch (s) {
      case 'sold': return 'Vendido';
      case 'delivered': return 'Entregado';
      case 'en_ruta': return 'En ruta';
      case 'pending': return 'Pendiente';
      default: return '—';
    }
  };

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Monitor de productividad</h1>
          </div>
          <Badge variant="secondary" className="text-[11px]">{diaLabel}</Badge>

          {/* Date picker */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <CalendarIcon className="h-3.5 w-3.5" />
                {format(selectedDate, "dd MMM yyyy", { locale: es })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(d) => d && setSelectedDate(d)}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>

          {/* Vendedor multi-select */}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Filter className="h-3.5 w-3.5" />
                {vendedorFilters.length === 0 ? 'Todos los vendedores' : `${vendedorFilters.length} vendedor(es)`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 pointer-events-auto" align="start">
              <div className="space-y-1 max-h-60 overflow-auto">
                {(vendedores ?? []).map(v => (
                  <label key={v.id} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-xs">
                    <Checkbox
                      checked={vendedorFilters.includes(v.id)}
                      onCheckedChange={() => toggleVendedor(v.id)}
                    />
                    <span className="truncate">{v.nombre}</span>
                  </label>
                ))}
              </div>
              {vendedorFilters.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full mt-1 text-xs h-7" onClick={() => setVendedorFilters([])}>
                  Limpiar filtros
                </Button>
              )}
            </PopoverContent>
          </Popover>

          <div className="flex items-center gap-1 ml-auto">
            <button onClick={() => setView('map')} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", view === 'map' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <MapPin className="h-3.5 w-3.5 inline mr-1" />Mapa
            </button>
            <button onClick={() => setView('table')} className={cn("px-3 py-1.5 rounded-lg text-xs font-medium transition-colors", view === 'table' ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}>
              <BarChart3 className="h-3.5 w-3.5 inline mr-1" />Tabla
            </button>
          </div>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          <KpiCard icon={Users} label="Programados" value={fmt(totalScheduled)} color="text-foreground" />
          <KpiCard icon={CheckCircle2} label="Visitados" value={fmt(totalVisited)} subtitle={`${visitRate}%`} color="text-emerald-600" />
          <KpiCard icon={Clock} label="Pendientes" value={fmt(totalPending)} color="text-destructive" />
          <KpiCard icon={ShoppingCart} label="Con venta" value={fmt(totalSold)} color="text-primary" />
          <KpiCard icon={Truck} label="Entregas hechas" value={`${totalEntregasDone}/${totalEntregasDone + totalEntregasPending}`} color="text-blue-600" />
          <KpiCard icon={TrendingUp} label="Venta del día" value={fmtMoney(totalSalesAmount)} color="text-emerald-600" />
          <KpiCard icon={Package} label="Cobranza" value={fmtMoney(totalCobros)} color="text-amber-600" />
          <KpiCard icon={Activity} label="Efectividad" value={`${visitRate}%`} color="text-primary" highlight={visitRate >= 80} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {view === 'map' ? (
          <>
            {/* Left panel with Tabs */}
            <div className="w-80 lg:w-96 border-r border-border bg-card flex flex-col shrink-0">
              <Tabs defaultValue="visitas" className="flex flex-col h-full">
                <TabsList className="w-full rounded-none border-b border-border bg-muted/50 h-10 shrink-0">
                  <TabsTrigger value="visitas" className="flex-1 text-xs gap-1.5 data-[state=active]:bg-background">
                    <Eye className="h-3.5 w-3.5" /> Visitas
                    <Badge variant="secondary" className="text-[9px] ml-1 px-1.5">{filtered.length}</Badge>
                  </TabsTrigger>
                  <TabsTrigger value="entregas" className="flex-1 text-xs gap-1.5 data-[state=active]:bg-background">
                    <Truck className="h-3.5 w-3.5" /> Entregas
                    <Badge variant="secondary" className="text-[9px] ml-1 px-1.5">{(entregasHoy ?? []).length}</Badge>
                  </TabsTrigger>
                </TabsList>

                {/* Visitas Tab */}
                <TabsContent value="visitas" className="flex-1 m-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card z-[1]">
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground">#</th>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground">Cliente</th>
                          <th className="text-center px-2 py-2 text-[10px] font-semibold text-muted-foreground">Estado</th>
                          <th className="text-right px-3 py-2 text-[10px] font-semibold text-muted-foreground">Venta</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.map((v, idx) => (
                          <tr
                            key={v.id}
                            className={cn(
                              "border-t border-border/30 hover:bg-muted/40 cursor-pointer transition-colors",
                              selectedClient?.id === v.id && "bg-primary/5"
                            )}
                            onClick={() => setSelectedClient(v)}
                          >
                            <td className="px-3 py-2">
                              {v.ordenEntrega && v.ordenEntrega > 0 ? (
                                <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground"
                                  style={{ backgroundColor: statusColor(v.status) }}>
                                  {v.ordenEntrega}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{idx + 1}</span>
                              )}
                            </td>
                            <td className="px-2 py-2">
                              <p className="font-medium text-foreground truncate max-w-[140px]">{v.nombre}</p>
                              <p className="text-[10px] text-muted-foreground truncate max-w-[140px]">{v.vendedorNombre ?? '—'}</p>
                            </td>
                            <td className="text-center px-2 py-2">
                              <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                style={{ backgroundColor: statusColor(v.status) + '15', color: statusColor(v.status) }}>
                                {v.status === 'sold' && <CheckCircle2 className="h-2.5 w-2.5" />}
                                {v.status === 'delivered' && <Truck className="h-2.5 w-2.5" />}
                                {v.status === 'en_ruta' && <Navigation className="h-2.5 w-2.5" />}
                                {v.status === 'pending' && <Clock className="h-2.5 w-2.5" />}
                                {statusLabel(v.status)}
                              </span>
                            </td>
                            <td className="text-right px-3 py-2 font-semibold text-xs" style={{ color: v.ventaTotal ? '#22c55e' : undefined }}>
                              {v.ventaTotal ? fmtMoney(v.ventaTotal) : '—'}
                            </td>
                          </tr>
                        ))}
                        {filtered.length === 0 && (
                          <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-xs">Sin visitas programadas</td></tr>
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
                </TabsContent>

                {/* Entregas Tab */}
                <TabsContent value="entregas" className="flex-1 m-0 overflow-hidden">
                  <ScrollArea className="h-full">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-card z-[1]">
                        <tr className="bg-muted/50">
                          <th className="text-left px-3 py-2 text-[10px] font-semibold text-muted-foreground">#</th>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground">Cliente</th>
                          <th className="text-left px-2 py-2 text-[10px] font-semibold text-muted-foreground">Folio</th>
                          <th className="text-center px-3 py-2 text-[10px] font-semibold text-muted-foreground">Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(entregasHoy ?? []).map((e: any, idx: number) => {
                          const cli = e.clientes;
                          const isDone = e.status === 'hecho';
                          const isEnRuta = ['cargado', 'asignado', 'surtido'].includes(e.status);
                          return (
                            <tr
                              key={e.id}
                              className="border-t border-border/30 hover:bg-muted/40 cursor-pointer transition-colors"
                              onClick={() => {
                                if (cli?.gps_lat) {
                                  setSelectedClient({
                                    id: cli.id,
                                    nombre: cli.nombre,
                                    codigo: cli.codigo,
                                    direccion: cli.direccion,
                                    gps_lat: cli.gps_lat,
                                    gps_lng: cli.gps_lng,
                                    vendedorNombre: cli.vendedores?.nombre,
                                    status: isDone ? 'delivered' : isEnRuta ? 'en_ruta' : 'pending',
                                    entregaFolio: e.folio,
                                    ordenEntrega: e.orden_entrega,
                                  });
                                }
                              }}
                            >
                              <td className="px-3 py-2">
                                {e.orden_entrega ? (
                                  <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-primary-foreground"
                                    style={{ backgroundColor: isDone ? '#3b82f6' : isEnRuta ? '#f59e0b' : '#ef4444' }}>
                                    {e.orden_entrega}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">{idx + 1}</span>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                <p className="font-medium text-foreground truncate max-w-[120px]">{cli?.nombre ?? '—'}</p>
                                <p className="text-[10px] text-muted-foreground truncate max-w-[120px]">{cli?.direccion ?? ''}</p>
                              </td>
                              <td className="px-2 py-2 text-muted-foreground font-mono">{e.folio ?? '—'}</td>
                              <td className="text-center px-3 py-2">
                                <span className={cn(
                                  "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                                  isDone ? "bg-blue-500/15 text-blue-600" : isEnRuta ? "bg-amber-500/15 text-amber-600" : "bg-red-500/15 text-red-600"
                                )}>
                                  {isDone ? 'Entregado' : isEnRuta ? 'En ruta' : e.status}
                                </span>
                              </td>
                            </tr>
                          );
                        })}
                        {(entregasHoy ?? []).length === 0 && (
                          <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-xs">Sin entregas</td></tr>
                        )}
                      </tbody>
                    </table>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            </div>

            {/* Map */}
            <div className="flex-1 relative" style={{ minHeight: 300 }}>
              {isLoaded ? (
                <GoogleMap
                  onLoad={onMapLoad}
                  mapContainerStyle={{ width: '100%', height: '100%' }}
                  zoom={6}
                  center={{ lat: 23.6345, lng: -102.5528 }}
                  options={{
                    disableDefaultUI: true,
                    zoomControl: true,
                    gestureHandling: 'greedy',
                    styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
                  }}
                >
                  {withGps.map(c => {
                    const markerText = c.ordenEntrega && c.ordenEntrega > 0
                      ? String(c.ordenEntrega)
                      : c.status === 'sold' ? '$' : c.status === 'delivered' ? '✓' : '•';
                    return (
                      <MarkerF
                        key={c.id + c.status}
                        position={{ lat: c.gps_lat!, lng: c.gps_lng! }}
                        icon={{
                          path: google.maps.SymbolPath.CIRCLE,
                          fillColor: statusColor(c.status),
                          fillOpacity: 1,
                          strokeColor: '#fff',
                          strokeWeight: 2,
                          scale: c.ordenEntrega && c.ordenEntrega > 0 ? 14 : 10,
                        }}
                        label={{
                          text: markerText,
                          color: '#fff',
                          fontSize: c.ordenEntrega && c.ordenEntrega > 0 ? '11px' : '10px',
                          fontWeight: '700',
                        }}
                        onClick={() => setSelectedClient(c)}
                      />
                    );
                  })}

                  {selectedClient && selectedClient.gps_lat && (
                    <InfoWindow
                      position={{ lat: selectedClient.gps_lat, lng: selectedClient.gps_lng! }}
                      onCloseClick={() => setSelectedClient(null)}
                    >
                      <div className="min-w-[200px] p-1 space-y-1">
                        <div className="flex items-center gap-2">
                          {selectedClient.ordenEntrega ? (
                            <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: statusColor(selectedClient.status) }}>
                              {selectedClient.ordenEntrega}
                            </span>
                          ) : (
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: statusColor(selectedClient.status) }} />
                          )}
                          <span className="font-bold text-sm">{selectedClient.nombre}</span>
                        </div>
                        {selectedClient.codigo && <p className="text-xs text-gray-500 font-mono">{selectedClient.codigo}</p>}
                        {selectedClient.direccion && <p className="text-xs text-gray-600">{selectedClient.direccion}</p>}
                        <p className="text-xs font-medium">Vendedor: {selectedClient.vendedorNombre ?? '—'}</p>
                        {selectedClient.entregaFolio && <p className="text-xs text-gray-500">Entrega: {selectedClient.entregaFolio}</p>}
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                            style={{ backgroundColor: statusColor(selectedClient.status) + '20', color: statusColor(selectedClient.status) }}>
                            {statusLabel(selectedClient.status)}
                          </span>
                          {selectedClient.ventaTotal && (
                            <span className="text-xs font-bold text-green-600">{fmtMoney(selectedClient.ventaTotal)}</span>
                          )}
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
                </div>
              )}

              {/* Map legend */}
              <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-md border border-border rounded-xl px-3 py-2.5 shadow-lg">
                <div className="flex items-center gap-4 text-[11px]">
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Vendido</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Entregado</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> En ruta</span>
                  <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-destructive" /> Pendiente</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* TABLE VIEW */
          <div className="flex-1 overflow-auto">
            {/* Vendedor performance table */}
            <div className="p-5 space-y-5">
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">Productividad por vendedor</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Vendedor</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Programados</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Visitados</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Ventas</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Monto</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Efectividad</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vendedorSummary.map(vs => {
                        const rate = vs.scheduled > 0 ? Math.round((vs.visited / vs.scheduled) * 100) : 0;
                        return (
                          <tr key={vs.id} className="border-t border-border/30 hover:bg-muted/30">
                            <td className="px-4 py-2.5 font-medium text-foreground">{vs.nombre}</td>
                            <td className="text-center px-3 py-2.5 text-muted-foreground">{vs.scheduled}</td>
                            <td className="text-center px-3 py-2.5">
                              <span className={cn("font-medium", vs.visited === vs.scheduled ? "text-emerald-600" : "text-foreground")}>
                                {vs.visited}
                              </span>
                            </td>
                            <td className="text-center px-3 py-2.5 font-medium text-primary">{vs.sold}</td>
                            <td className="text-right px-4 py-2.5 font-semibold text-emerald-600">{fmtMoney(vs.salesTotal)}</td>
                            <td className="text-center px-3 py-2.5">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 h-2 rounded-full bg-muted">
                                  <div className="h-full rounded-full" style={{
                                    width: `${rate}%`,
                                    backgroundColor: rate >= 80 ? '#22c55e' : rate >= 50 ? '#f59e0b' : '#ef4444'
                                  }} />
                                </div>
                                <span className={cn(
                                  "text-xs font-bold min-w-[30px]",
                                  rate >= 80 ? "text-emerald-600" : rate >= 50 ? "text-amber-600" : "text-destructive"
                                )}>{rate}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Client visit detail table */}
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-border flex items-center gap-2">
                  <Eye className="h-4 w-4 text-primary" />
                  <h2 className="text-sm font-bold text-foreground">Detalle de visitas — {diaLabel}</h2>
                  <Badge variant="secondary" className="ml-auto text-[10px]">{filtered.length} clientes</Badge>
                </div>
                <div className="overflow-x-auto max-h-[50vh]">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-card z-[1]">
                      <tr className="bg-muted/50">
                        <th className="text-left px-4 py-2.5 text-xs font-semibold text-muted-foreground">Cliente</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Vendedor</th>
                        <th className="text-left px-3 py-2.5 text-xs font-semibold text-muted-foreground">Dirección</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">Estado</th>
                        <th className="text-right px-4 py-2.5 text-xs font-semibold text-muted-foreground">Venta</th>
                        <th className="text-center px-3 py-2.5 text-xs font-semibold text-muted-foreground">GPS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(v => (
                        <tr key={v.id} className="border-t border-border/30 hover:bg-muted/30">
                          <td className="px-4 py-2.5">
                            <p className="font-medium text-foreground text-sm">{v.nombre}</p>
                            {v.codigo && <p className="text-[10px] font-mono text-muted-foreground">{v.codigo}</p>}
                          </td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs">{v.vendedorNombre ?? '—'}</td>
                          <td className="px-3 py-2.5 text-muted-foreground text-xs max-w-[200px] truncate">
                            {[v.direccion, v.colonia].filter(Boolean).join(', ') || '—'}
                          </td>
                          <td className="text-center px-3 py-2.5">
                            <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full"
                              style={{ backgroundColor: statusColor(v.status) + '15', color: statusColor(v.status) }}>
                              {v.status === 'sold' && <CheckCircle2 className="h-3 w-3" />}
                              {v.status === 'delivered' && <Truck className="h-3 w-3" />}
                              {v.status === 'en_ruta' && <Navigation className="h-3 w-3" />}
                              {v.status === 'pending' && <Clock className="h-3 w-3" />}
                              {statusLabel(v.status)}
                            </span>
                          </td>
                          <td className="text-right px-4 py-2.5 font-semibold text-emerald-600 text-xs">
                            {v.ventaTotal ? fmtMoney(v.ventaTotal) : '—'}
                          </td>
                          <td className="text-center px-3 py-2.5">
                            {v.gps_lat ? (
                              <MapPin className="h-3.5 w-3.5 text-primary mx-auto" />
                            ) : (
                              <XCircle className="h-3.5 w-3.5 text-muted-foreground/30 mx-auto" />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, subtitle, color, highlight }: {
  icon: React.ElementType; label: string; value: string; subtitle?: string; color: string; highlight?: boolean;
}) {
  return (
    <div className={cn(
      "bg-background border border-border rounded-xl px-3 py-2.5 flex items-center gap-2.5",
      highlight && "ring-2 ring-emerald-500/30"
    )}>
      <Icon className={cn("h-4 w-4 shrink-0", color)} />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">{label}</p>
        <div className="flex items-baseline gap-1">
          <p className={cn("text-base font-bold", color)}>{value}</p>
          {subtitle && <span className="text-[10px] text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}

export default function MonitorRutasPage() {
  return (
    <GoogleMapsProvider blocking>
      <MonitorContent />
    </GoogleMapsProvider>
  );
}
