import { useEffect, useState } from 'react';
import { Marker } from 'react-map-gl/maplibre';
import { locationService, type LatLng } from '@/lib/locationService';

/**
 * MapLibre version: "you are here" blue dot. Place inside <MapGL> tree.
 */
export default function MyLocationMarkerML() {
  const [pos, setPos] = useState<LatLng | null>(() => locationService.getLastKnownLocation());

  useEffect(() => {
    const unsub = locationService.onUpdate((loc) => setPos(loc));
    return unsub;
  }, []);

  if (!pos) return null;

  return (
    <Marker longitude={pos.lng} latitude={pos.lat} anchor="center">
      <div className="relative flex items-center justify-center pointer-events-none">
        {/* Halo */}
        <div
          className="absolute rounded-full"
          style={{
            width: 44,
            height: 44,
            backgroundColor: 'rgba(66,133,244,0.2)',
            border: '1px solid rgba(66,133,244,0.3)',
          }}
        />
        {/* Dot */}
        <div
          className="rounded-full"
          style={{
            width: 16,
            height: 16,
            backgroundColor: '#4285F4',
            border: '3px solid #fff',
            boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
          }}
          title="Mi ubicación"
        />
      </div>
    </Marker>
  );
}
