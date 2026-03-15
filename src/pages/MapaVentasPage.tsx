import { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, CircleMarker } from 'react-leaflet';
import L from 'leaflet';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useQuery } from '@tanstack/react-query';
import { useVendedores } from '@/hooks/useClientes';
import { Link } from 'react-router-dom';
import { Search, Filter, ShoppingCart, X, Calendar, TrendingUp, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { OdooDatePicker } from '@/components/OdooDatePicker';
import 'leaflet/dist/leaflet.css';

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function createSaleIcon(total: number) {
  const size = Math.min(36, Math.max(22, 18 + Math.log10(Math.max(total, 1)) * 4));
  const color = total >= 5000 ? '#22c55e' : total >= 1000 ? '#3b82f6' : '#714BF4';
  return L.divIcon({
    className: '',
    html: `<div style="
      width: ${size}px; height: ${size}px; border-radius: 50%;
      background: ${color}; border: 3px solid white;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex; align-items: center; justify-content: center;
      color: white; font-size: 9px; font-weight: 700;
    ">$</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function FitBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 0) {
      const bounds = L.latLngBounds(positions.map(p => L.latLng(p[0], p[1])));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [positions, map]);
  return null;
}

const today = new Date().toISOString().split('T')[0];
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

export default function MapaVentasPage() {
  const { empresa } = useAuth();
  const [fechaDesde, setFechaDesde] = useState(weekAgo);
  const [fechaHasta, setFechaHasta] = useState(today);
  const [vendedorFilter, setVendedorFilter] = useState('');
  const [tipoFilter, setTipoFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);

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

  const ventasConGps = useMemo(() => {
    return (ventasData ?? []).filter((v: any) => v.clientes?.gps_lat && v.clientes?.gps_lng);
  }, [ventasData]);

  const positions = useMemo<[number, number][]>(
    () => ventasConGps.map((v: any) => [v.clientes.gps_lat, v.clientes.gps_lng]),
    [ventasConGps]
  );

  const stats = useMemo(() => {
    const all = ventasData ?? [];
    return {
      total: all.length,
      conGps: ventasConGps.length,
      sinGps: all.length - ventasConGps.length,
      montoTotal: all.reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    };
  }, [ventasData, ventasConGps]);

  const defaultCenter: [number, number] = positions.length > 0
    ? [positions.reduce((s, p) => s + p[0], 0) / positions.length, positions.reduce((s, p) => s + p[1], 0) / positions.length]
    : [23.6345, -102.5528];

  const activeFiltersCount = [vendedorFilter, tipoFilter].filter(Boolean).length;

  return (
    <div className="h-[calc(100vh-theme(spacing.9))] flex flex-col">
      {/* Header */}
      <div className="bg-card border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold text-foreground">Mapa de ventas</h1>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <OdooDatePicker value={fechaDesde} onChange={setFechaDesde} />
              <span className="text-muted-foreground">—</span>
              <OdooDatePicker value={fechaHasta} onChange={setFechaHasta} />
            </div>
          </div>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium border transition-colors",
              showFilters || activeFiltersCount > 0
                ? "bg-primary/10 border-primary/30 text-primary"
                : "bg-background border-border text-muted-foreground hover:text-foreground"
            )}
          >
            <Filter className="h-4 w-4" />
            Filtros
            {activeFiltersCount > 0 && (
              <Badge className="ml-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">{activeFiltersCount}</Badge>
            )}
          </button>

          <div className="flex-1" />

          {/* Stats cards */}
          <div className="flex items-center gap-3">
            <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-center">
              <div className="text-lg font-bold text-primary">{stats.total}</div>
              <div className="text-[10px] text-muted-foreground font-medium">Ventas</div>
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
        {isLoading && (
          <div className="absolute inset-0 z-[1000] bg-background/60 flex items-center justify-center">
            <p className="text-muted-foreground text-sm">Cargando ventas...</p>
          </div>
        )}
        <MapContainer
          center={defaultCenter}
          zoom={6}
          className="h-full w-full z-0"
          style={{ background: 'hsl(var(--background))' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {positions.length > 0 && <FitBounds positions={positions} />}
          {ventasConGps.map((v: any) => {
            const icon = createSaleIcon(v.total ?? 0);
            return (
              <Marker key={v.id} position={[v.clientes.gps_lat, v.clientes.gps_lng]} icon={icon}>
                <Popup>
                  <div className="min-w-[220px]">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-sm">{v.folio || 'Sin folio'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        v.tipo === 'pedido' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                      }`}>{v.tipo === 'pedido' ? 'Pedido' : 'Venta'}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-0.5">{v.clientes?.nombre}</div>
                    <div className="text-xs text-gray-500 mb-1">{v.clientes?.direccion ?? ''}</div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs text-gray-500">{new Date(v.fecha).toLocaleDateString('es-MX')}</span>
                      <span className="text-sm font-bold text-green-600">${(v.total ?? 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
                    </div>
                    {v.vendedores?.nombre && <div className="text-[10px] text-gray-400">Vendedor: {v.vendedores.nombre}</div>}
                    <div className="flex gap-2 mt-1.5 pt-1.5 border-t border-gray-100">
                      <Link to={`/ventas/${v.id}`} className="text-xs text-blue-600 hover:underline">Ver venta</Link>
                      <Link to={`/clientes/${v.cliente_id}`} className="text-xs text-blue-600 hover:underline">Ver cliente</Link>
                    </div>
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
      </div>
    </div>
  );
}
