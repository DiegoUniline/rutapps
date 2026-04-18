import { useEffect, useRef, useState } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import SearchableSelect from '@/components/SearchableSelect';
import { MapPin, Crosshair, Warehouse, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OriginValue {
  lat: number;
  lng: number;
  label?: string;
}

interface Props {
  value: OriginValue | null;
  onChange: (v: OriginValue | null) => void;
  /** When user wants to pick origin by clicking the map */
  onPickFromMapRequest: () => void;
  pickingFromMap: boolean;
}

/**
 * Selector de punto de partida que permite:
 *  1. Elegir un almacén guardado en la empresa (si tiene gps)
 *  2. Buscar una dirección (Google Places Autocomplete)
 *  3. Click en el mapa
 *  4. Usar mi ubicación actual
 */
export default function OriginPicker({ value, onChange, onPickFromMapRequest, pickingFromMap }: Props) {
  const { empresa } = useAuth();
  const [mode, setMode] = useState<'almacen' | 'direccion'>('almacen');
  const [almacenId, setAlmacenId] = useState<string>('');
  const acRef = useRef<google.maps.places.Autocomplete | null>(null);

  const { data: almacenes = [] } = useQuery({
    queryKey: ['almacenes-origin', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase
        .from('almacenes') as any)
        .select('id, nombre, gps_lat, gps_lng, direccion')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('nombre');
      return (data ?? []) as { id: string; nombre: string; gps_lat: number | null; gps_lng: number | null; direccion: string | null }[];
    },
  });

  const almacenesConGps = almacenes.filter(a => a.gps_lat != null && a.gps_lng != null);

  const handleAlmacen = (id: string) => {
    setAlmacenId(id);
    const a = almacenes.find(x => x.id === id);
    if (a && a.gps_lat != null && a.gps_lng != null) {
      onChange({ lat: a.gps_lat, lng: a.gps_lng, label: a.nombre });
    }
  };

  const handlePlaceChanged = () => {
    const place = acRef.current?.getPlace();
    if (!place?.geometry?.location) return;
    onChange({
      lat: place.geometry.location.lat(),
      lng: place.geometry.location.lng(),
      label: place.formatted_address || place.name || 'Dirección',
    });
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, label: 'Mi ubicación' }),
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  };

  // Auto-pick first almacen with gps when mounting if value is empty
  useEffect(() => {
    if (!value && mode === 'almacen' && almacenesConGps.length > 0 && !almacenId) {
      const first = almacenesConGps[0];
      setAlmacenId(first.id);
      onChange({ lat: first.gps_lat!, lng: first.gps_lng!, label: first.nombre });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [almacenesConGps.length]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1 text-[10px] font-medium">
        <button
          type="button"
          onClick={() => setMode('almacen')}
          className={cn('flex items-center gap-1 px-2 py-1 rounded-md border transition-colors',
            mode === 'almacen' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground')}
        >
          <Warehouse className="h-3 w-3" /> Almacén
        </button>
        <button
          type="button"
          onClick={() => setMode('direccion')}
          className={cn('flex items-center gap-1 px-2 py-1 rounded-md border transition-colors',
            mode === 'direccion' ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border text-muted-foreground')}
        >
          <MapPin className="h-3 w-3" /> Dirección
        </button>
        <button
          type="button"
          onClick={handleMyLocation}
          className="flex items-center gap-1 px-2 py-1 rounded-md border bg-background border-border text-muted-foreground hover:text-foreground"
          title="Usar mi ubicación"
        >
          <Crosshair className="h-3 w-3" />
        </button>
        <button
          type="button"
          onClick={onPickFromMapRequest}
          className={cn('flex items-center gap-1 px-2 py-1 rounded-md border transition-colors',
            pickingFromMap ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 animate-pulse' : 'bg-background border-border text-muted-foreground')}
          title="Click en el mapa"
        >
          📍
        </button>
        {value && (
          <button
            type="button"
            onClick={() => { onChange(null); setAlmacenId(''); }}
            className="ml-auto text-destructive p-1"
            title="Limpiar"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>

      {mode === 'almacen' ? (
        <SearchableSelect
          options={almacenesConGps.length === 0
            ? [{ value: '', label: 'Ningún almacén tiene GPS configurado' }]
            : [{ value: '', label: 'Selecciona un almacén...' }, ...almacenesConGps.map(a => ({ value: a.id, label: a.nombre }))]}
          value={almacenId}
          onChange={handleAlmacen}
          placeholder="Almacén..."
        />
      ) : (
        <Autocomplete
          onLoad={(ac) => { acRef.current = ac; }}
          onPlaceChanged={handlePlaceChanged}
          options={{ fields: ['geometry', 'formatted_address', 'name'] }}
        >
          <input
            type="text"
            placeholder="Buscar dirección..."
            defaultValue={value?.label ?? ''}
            className="w-full bg-background border border-border rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Autocomplete>
      )}

      {value && (
        <div className="text-[10px] text-muted-foreground truncate">
          📍 {value.label ?? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`}
        </div>
      )}
    </div>
  );
}
