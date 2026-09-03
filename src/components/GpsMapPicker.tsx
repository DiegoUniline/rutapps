import { useEffect, useRef, useState } from 'react';
import { Map as MapGL, Marker, NavigationControl, type MapRef } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Check, MapPin, X } from 'lucide-react';

interface GpsMapPickerProps {
  lat: number | null | undefined;
  lng: number | null | undefined;
  onChange: (lat: number, lng: number) => void;
}

interface GpsMapPreviewProps {
  lat: number;
  lng: number;
}

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/bright';
const DEFAULT_CENTER = { lat: 23.6345, lng: -102.5528 };

function LocationMarker({ lat, lng, draggable = false, onDragEnd }: {
  lat: number;
  lng: number;
  draggable?: boolean;
  onDragEnd?: (lat: number, lng: number) => void;
}) {
  return (
    <Marker
      longitude={lng}
      latitude={lat}
      anchor="center"
      draggable={draggable}
      onDragEnd={event => onDragEnd?.(event.lngLat.lat, event.lngLat.lng)}
    >
      <div className="h-7 w-7 rounded-full border-[3px] border-white bg-primary shadow-lg ring-1 ring-black/15" />
    </Marker>
  );
}

export function GpsMapPreview({ lat, lng }: GpsMapPreviewProps) {
  return (
    <MapGL
      mapStyle={MAP_STYLE}
      initialViewState={{ longitude: lng, latitude: lat, zoom: 16 }}
      style={{ width: '100%', height: '100%' }}
      attributionControl={{ compact: true }}
      reuseMaps
    >
      <NavigationControl position="top-right" showCompass={false} />
      <LocationMarker lat={lat} lng={lng} />
    </MapGL>
  );
}

export default function GpsMapPicker({ lat, lng, onChange }: GpsMapPickerProps) {
  const [open, setOpen] = useState(false);
  const [tempPos, setTempPos] = useState<{ lat: number; lng: number } | null>(null);
  const [coordInput, setCoordInput] = useState('');
  const mapRef = useRef<MapRef | null>(null);
  const hasCurrentPos = lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng);
  const currentPos = hasCurrentPos ? { lat: Number(lat), lng: Number(lng) } : null;

  useEffect(() => {
    if (!open) return;

    const nextCurrentPos =
      lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng)
        ? { lat: Number(lat), lng: Number(lng) }
        : null;
    setTempPos(nextCurrentPos);
    setCoordInput(nextCurrentPos ? `${nextCurrentPos.lat.toFixed(6)}, ${nextCurrentPos.lng.toFixed(6)}` : '');
  }, [open, lat, lng]);

  const moveMapTo = (nextLat: number, nextLng: number) => {
    setTempPos({ lat: nextLat, lng: nextLng });
    setCoordInput(`${nextLat.toFixed(6)}, ${nextLng.toFixed(6)}`);
    mapRef.current?.flyTo({ center: [nextLng, nextLat], zoom: 16, duration: 350 });
  };

  const handleConfirm = () => {
    if (tempPos) onChange(tempPos.lat, tempPos.lng);
    setOpen(false);
  };

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-border bg-card shadow-2xl" onClick={event => event.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <MapPin className="h-4 w-4 text-primary" />
                Selecciona la ubicación del cliente
              </h3>
              <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="relative h-[min(56vh,430px)] min-h-[280px]">
              <MapGL
                ref={mapRef}
                mapStyle={MAP_STYLE}
                initialViewState={{
                  longitude: currentPos?.lng ?? DEFAULT_CENTER.lng,
                  latitude: currentPos?.lat ?? DEFAULT_CENTER.lat,
                  zoom: currentPos ? 16 : 5,
                }}
                style={{ width: '100%', height: '100%', cursor: 'crosshair' }}
                attributionControl={{ compact: true }}
                onClick={event => moveMapTo(event.lngLat.lat, event.lngLat.lng)}
              >
                <NavigationControl position="top-right" showCompass={false} />
                {tempPos && (
                  <LocationMarker
                    lat={tempPos.lat}
                    lng={tempPos.lng}
                    draggable
                    onDragEnd={moveMapTo}
                  />
                )}
              </MapGL>
              {!tempPos && (
                <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-primary px-4 py-2 text-xs font-medium text-primary-foreground shadow-lg">
                  Toca el mapa para colocar la ubicación
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-1.5">
                <label className="text-[10px] font-medium text-muted-foreground">Coords</label>
                <input
                  type="text"
                  value={coordInput}
                  onChange={event => {
                    const raw = event.target.value;
                    setCoordInput(raw);
                    const [rawLat, rawLng] = raw.split(',').map(value => value.trim());
                    const nextLat = Number(rawLat);
                    const nextLng = Number(rawLng);
                    if (Number.isFinite(nextLat) && Number.isFinite(nextLng)) {
                      setTempPos({ lat: nextLat, lng: nextLng });
                      mapRef.current?.flyTo({ center: [nextLng, nextLat], zoom: 16, duration: 350 });
                    }
                    if (raw === '') setTempPos(null);
                  }}
                  className="h-8 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-[11px] focus:outline-none focus:ring-2 focus:ring-ring sm:w-[250px]"
                  placeholder="19.763610, -104.355636"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-border px-3 py-1.5 text-[12px] text-muted-foreground hover:bg-accent">
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={!tempPos}
                  className="flex items-center gap-1.5 rounded-md bg-primary px-4 py-1.5 text-[12px] font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
