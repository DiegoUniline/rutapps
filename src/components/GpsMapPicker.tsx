import { useState, useCallback, useRef, useEffect } from 'react';
import { GoogleMap, Marker } from '@react-google-maps/api';
import { MapPin, X, Check } from 'lucide-react';

interface GpsMapPickerProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  onChange: (lat: number, lng: number) => void;
  isLoaded: boolean;
}

const containerStyle = { width: '100%', height: '250px' };
const defaultCenter = { lat: 23.6345, lng: -102.5528 };

export default function GpsMapPicker({ lat, lng, onChange, isLoaded }: GpsMapPickerProps) {
  const [open, setOpen] = useState(false);
  const [tempPos, setTempPos] = useState<{ lat: number; lng: number } | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const currentPos = lat && lng ? { lat, lng } : null;

  useEffect(() => {
    if (open) {
      setTempPos(currentPos ?? null);
    }
  }, [open]);

  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    const pos = currentPos ?? defaultCenter;
    map.setCenter(pos);
    map.setZoom(currentPos ? 16 : 6);
  }, [currentPos]);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setTempPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, []);

  const handleDragEnd = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setTempPos({ lat: e.latLng.lat(), lng: e.latLng.lng() });
    }
  }, []);

  const handleConfirm = () => {
    if (tempPos) {
      onChange(tempPos.lat, tempPos.lng);
    }
    setOpen(false);
  };

  if (!isLoaded) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border bg-background text-[12px] font-medium text-foreground hover:bg-accent active:scale-95 transition-all"
      >
        <MapPin className="h-3.5 w-3.5 text-primary" />
        {currentPos ? 'Mover en mapa' : 'Elegir en mapa'}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" />
                Selecciona la ubicación del cliente
              </h3>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative">
              <GoogleMap
                mapContainerStyle={containerStyle}
                center={currentPos ?? defaultCenter}
                zoom={currentPos ? 16 : 6}
                onLoad={onMapLoad}
                onClick={handleMapClick}
                options={{
                  styles: [{ featureType: 'poi', stylers: [{ visibility: 'off' }] }],
                  mapTypeControl: false,
                  streetViewControl: false,
                  fullscreenControl: false,
                  draggableCursor: 'crosshair',
                }}
              >
                {tempPos && (
                  <Marker
                    position={tempPos}
                    draggable
                    onDragEnd={handleDragEnd}
                    icon={{
                      path: google.maps.SymbolPath.CIRCLE,
                      fillColor: '#6366f1',
                      fillOpacity: 1,
                      strokeColor: '#fff',
                      strokeWeight: 3,
                      scale: 12,
                    }}
                  />
                )}
              </GoogleMap>
              {!tempPos && (
                <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 bg-primary text-primary-foreground px-4 py-2 rounded-full text-xs font-medium shadow-lg animate-pulse">
                  Haz click en el mapa para posicionar
                </div>
              )}
            </div>

            <div className="flex items-center justify-between px-4 py-3 border-t border-border">
              <div className="text-[11px] text-muted-foreground">
                {tempPos ? `${tempPos.lat.toFixed(6)}, ${tempPos.lng.toFixed(6)}` : 'Sin posición seleccionada'}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-md border border-border text-[12px] text-muted-foreground hover:bg-accent">
                  Cancelar
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!tempPos}
                  className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-[12px] font-medium hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  Confirmar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
