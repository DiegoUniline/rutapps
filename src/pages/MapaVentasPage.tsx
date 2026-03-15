import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useVendedores } from '@/hooks/useClientes';
import { Link } from 'react-router-dom';
import { Filter, ShoppingCart, X, Calendar, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import { useGoogleMapsKey } from '@/hooks/useGoogleMapsKey';

const mapContainerStyle = { width: '100%', height: '100%' };
const defaultCenter = { lat: 23.6345, lng: -102.5528 };
const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

export default function MapaVentasPage() {
  const { empresa } = useAuth();
  const { apiKey, loading: loadingKey } = useGoogleMapsKey();
  const [fechaDesde, setFechaDesde] = useState(weekAgo);
  const [fechaHasta, setFechaHasta] = useState(today);
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedVenta, setSelectedVenta] = useState<any | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey ?? '',
    id: 'google-map-ventas',
  });

  const { data: vendedores } = useVendedores();

  const { data: ventasData, isLoading } = useQuery({
    queryKey: ['mapa-ventas', empresa?.id, fechaDesde, fechaHasta, vendedorFilter, tipoFilter],
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('id, folio, fecha, total, tipo, status, condicion_pago, cliente_id, vendedor_id, clientes(id, nombre, codigo, gps_lat, gps_lng, direccion, colonia), vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fechaDesde)
        .lte('fecha', fechaHasta)
        .order('fecha', { ascending: false });
      if (vendedorFilter) q = q.eq('vendedor_id', vendedorFilter);
      if (tipoFilter) q = q.eq('tipo', tipoFilter as any);
      const { data, error } = await q;
      if (error) throw error;
      return data as any[];
    },
    enabled: !!empresa?.id,
  });

  const ventasConGps = useMemo(() => (ventasData ?? []).filter((v: any) => v.clientes?.gps_lat && v.clientes?.gps_lng), [ventasData]);

  const stats = useMemo(() => {
    const all = ventasData ?? [];
    return {
      total: all.length,
      conGps: ventasConGps.length,
      sinGps: all.length - ventasConGps.length,
      montoTotal: all.reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    };
  }, [ventasData, ventasConGps]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  useEffect(() => {
    if (mapRef.current && ventasConGps.length > 0) {
      const bounds = new google.maps.LatLngBounds();
      ventasConGps.forEach((v: any) => bounds.extend({ lat: v.clientes.gps_lat, lng: v.clientes.gps_lng }));
      mapRef.current.fitBounds(bounds, 50);
    }
  }, [ventasConGps]);

  const getSaleIcon = (total: number) => {
    const color = total >= 5000 ? '#22c55e' : total >= 1000 ? '#3b82f6' : '#714BF4';
    const scale = Math.min(14, Math.max(8, 7 + Math.log10(Math.max(total, 1)) * 2));
    return {
      path: google.maps.SymbolPath.CIRCLE,
      fillColor: color,
      fillOpacity: 0.9,
      strokeColor: '#fff',
      strokeWeight: 2,
      scale,
    };
  };

  const activeFiltersCount = [vendedorFilter, tipoFilter].filter(Boolean).length;

  if (loadingKey || !apiKey) {
    return (
      <div className="h-[calc(100vh-theme(spacing.9))] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Mapa de pedidos</h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <OdooDatePicker value={fechaDesde} onChange={setFechaDesde} />
              <span className="text-muted-foreground">—</span>
              <OdooDatePicker value={fechaHasta} onChange={setFechaHasta} />
            </div>
          </div>
          <button onClick={() => setShowFilters(!showFilters)}
            className={cn("flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              showFilters || activeFiltersCount > 0 ? "bg-primary/10 border-primary/30 text-primary" : "bg-background border-border text-muted-foreground hover:text-foreground")}>
            <Filter className="h-4 w-4" />Filtros
            {activeFiltersCount > 0 && <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFiltersCount}</Badge>}
          </button>
          <div className="flex-1" />
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-primary">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Pedidos</div>
            </div>
            <div className="bg-accent rounded-lg px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-foreground">${stats.montoTotal.toLocaleString('es-MX', { minimumFractionDigits: 0 })}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Total</div>
            </div>
            <div className="flex flex-col text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-primary" />{stats.conGps} en mapa</span>
              <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-muted-foreground/40" />{stats.sinGps} sin GPS</span>
            </div>
          </div>
        </div>

        {showFilters && (
          <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-border">
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Vendedor</label>
              <select value={vendedorFilter} onChange={e => setVendedorFilter(e.target.value)}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                {vendedores?.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Tipo</label>
              <select value={tipoFilter} onChange={e => setTipoFilter(e.target.value)}
                className="bg-background border border-border rounded-md px-2.5 py-1.5 text-sm min-w-[140px]">
                <option value="">Todos</option>
                <option value="pedido">Pedido</option>
                <option value="venta_directa">Venta directa</option>
              </select>
            </div>
            {activeFiltersCount > 0 && (
              <button onClick={() => { setVendedorFilter(''); setTipoFilter(''); }}
                className="self-end flex items-center gap-1 text-xs text-destructive hover:underline py-1.5">
                <X className="h-3 w-3" /> Limpiar filtros
              </button>
            )}
          </div>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        {(isLoading || !isLoaded) && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        )}
        {isLoaded && (
          <GoogleMap
            mapContainerStyle={mapContainerStyle}
            center={ventasConGps.length > 0 ? { lat: ventasConGps[0].clientes.gps_lat, lng: ventasConGps[0].clientes.gps_lng } : defaultCenter}
            zoom={6}
            onLoad={onMapLoad}
            options={{
              styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
            }}
          >
            {ventasConGps.map((v: any) => (
              <Marker
                key={v.id}
                position={{ lat: v.clientes.gps_lat, lng: v.clientes.gps_lng }}
                icon={getSaleIcon(v.total ?? 0)}
                onClick={() => setSelectedVenta(v)}
                title={v.folio || 'Sin folio'}
              />
            ))}

            {selectedVenta && (
              <InfoWindow
                position={{ lat: selectedVenta.clientes.gps_lat, lng: selectedVenta.clientes.gps_lng }}
                onCloseClick={() => setSelectedVenta(null)}
              >
                <div className="min-w-[220px] p-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">{selectedVenta.folio || 'Sin folio'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      selectedVenta.tipo === 'pedido' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                    }`}>{selectedVenta.tipo === 'pedido' ? 'Pedido' : 'Venta'}</span>
                  </div>
                  <div className="text-xs text-gray-600 mb-0.5">{selectedVenta.clientes?.nombre}</div>
                  <div className="text-xs text-gray-500 mb-1">{selectedVenta.clientes?.direccion ?? ''}</div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs text-gray-500">{new Date(selectedVenta.fecha).toLocaleDateString('es-MX')}</span>
                    <span className="text-sm font-bold text-green-600">${(selectedVenta.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                  </div>
                  {selectedVenta.vendedores?.nombre && <div className="text-[10px] text-gray-400">Vendedor: {selectedVenta.vendedores.nombre}</div>}
                  <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
                    <Link to={`/ventas/${selectedVenta.id}`} className="text-xs text-blue-600 hover:underline">Ver venta</Link>
                    <Link to={`/clientes/${selectedVenta.cliente_id}`} className="text-xs text-blue-600 hover:underline">Ver cliente</Link>
                  </div>
                </div>
              </InfoWindow>
            )}
          </GoogleMap>
        )}
      </div>
    </div>
  );
}
