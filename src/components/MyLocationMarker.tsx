import { useEffect, useState } from 'react';
import { Marker } from '@react-google-maps/api';
import { locationService, type LatLng } from '@/lib/locationService';

/**
 * Renders a Google-Maps style "you are here" blue dot using the shared
 * locationService. Place inside any <GoogleMap> child tree.
 */
export default function MyLocationMarker() {
  const [pos, setPos] = useState<LatLng | null>(() => locationService.getLastKnownLocation());

  useEffect(() => {
    const unsub = locationService.onUpdate((loc) => setPos(loc));
    return unsub;
  }, []);

  if (!pos || typeof google === 'undefined') return null;

  return (
    <>
      {/* Outer translucent halo */}
      <Marker
        position={pos}
        zIndex={9998}
        clickable={false}
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#4285F4',
          fillOpacity: 0.2,
          strokeColor: '#4285F4',
          strokeOpacity: 0.3,
          strokeWeight: 1,
          scale: 22,
        }}
      />
      {/* Inner solid dot with white ring (Google "blue dot" style) */}
      <Marker
        position={pos}
        zIndex={9999}
        title="Mi ubicación"
        icon={{
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#4285F4',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
          scale: 8,
        }}
      />
    </>
  );
}
