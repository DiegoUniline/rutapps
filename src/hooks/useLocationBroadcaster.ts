import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { locationService } from '@/lib/locationService';

/**
 * Broadcasts the current user's GPS position to `vendedor_ubicaciones`.
 *
 * Optimizations to minimize data + battery:
 * - Pushes only every HEARTBEAT_MS (60s) by default.
 * - Skips push if the user moved less than MIN_DISTANCE_M (25m) AND last push <STALE_MS ago.
 * - Pauses while the document is hidden (background tab / app minimized).
 * - Uses UPSERT so the table never grows beyond N rows (one per seller).
 * - Reads from the shared locationService (no extra GPS subscription).
 */

const HEARTBEAT_MS = 60_000;        // máx 1 push / minuto
const MIN_DISTANCE_M = 25;          // si no se movió ≥25m, no enviamos
const STALE_MS = 5 * 60_000;        // …salvo que ya pasaron 5 min sin avisar
const FIRST_PUSH_DELAY_MS = 4_000;  // pequeño delay al arrancar

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

async function getBatteryLevel(): Promise<number | null> {
  try {
    const nav = navigator as any;
    if (typeof nav.getBattery === 'function') {
      const b = await nav.getBattery();
      return Math.round((b.level ?? 0) * 100);
    }
  } catch { /* ignore */ }
  return null;
}

export function useLocationBroadcaster(enabled: boolean = true) {
  const { user, empresa } = useAuth();
  const lastSentRef = useRef<{ lat: number; lng: number; ts: number } | null>(null);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled || !user?.id || !empresa?.id) return;

    let stopped = false;
    let intervalId: number | null = null;

    // Ensure GPS watch is active even if no other module on this screen requested it.
    locationService.startWatching();

    const pushNow = async (force = false) => {
      if (stopped || inFlightRef.current) return;
      if (document.hidden) return; // pausa en background

      const pos = locationService.getLastKnownLocation();
      if (!pos) return;

      const now = Date.now();
      const last = lastSentRef.current;

      if (!force && last) {
        const moved = haversineMeters(last, pos);
        const elapsed = now - last.ts;
        // Skip if barely moved and not stale yet
        if (moved < MIN_DISTANCE_M && elapsed < STALE_MS) return;
      }

      inFlightRef.current = true;
      try {
        const battery = await getBatteryLevel();
        const { error } = await supabase
          .from('vendedor_ubicaciones' as any)
          .upsert({
            user_id: user.id,
            empresa_id: empresa.id,
            lat: pos.lat,
            lng: pos.lng,
            battery_level: battery,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'user_id' });

        if (!error) {
          lastSentRef.current = { lat: pos.lat, lng: pos.lng, ts: now };
        }
      } catch { /* silent */ }
      finally {
        inFlightRef.current = false;
      }
    };

    // Initial delayed push
    const firstId = window.setTimeout(() => pushNow(true), FIRST_PUSH_DELAY_MS);

    // Periodic heartbeat
    intervalId = window.setInterval(() => pushNow(false), HEARTBEAT_MS);

    // Push immediately when tab becomes visible again
    const onVisibility = () => { if (!document.hidden) pushNow(false); };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      stopped = true;
      window.clearTimeout(firstId);
      if (intervalId) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [enabled, user?.id, empresa?.id]);
}
