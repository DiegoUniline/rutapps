/**
 * Singleton GPS location service.
 * - Auto-starts on first getLastKnownLocation() call
 * - Caches position in localStorage so it persists between sessions
 * - Uses watchPosition so the browser only prompts once
 * - Consumers call getLastKnownLocation() for instant cached coords
 */

export interface LatLng {
  lat: number;
  lng: number;
}

const STORAGE_KEY = 'gps_last_known';

class LocationService {
  private watchId: number | null = null;
  private lastLocation: LatLng | null = null;
  private listeners: Set<(loc: LatLng) => void> = new Set();
  private started = false;

  constructor() {
    // Restore from localStorage on init
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.lat && parsed?.lng) {
          this.lastLocation = { lat: parsed.lat, lng: parsed.lng };
        }
      }
    } catch { /* ignore */ }
  }

  /** Start background GPS watching (idempotent, safe to call many times) */
  startWatching() {
    if (this.started) return;
    this.started = true;
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        // Persist to localStorage
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(this.lastLocation));
        } catch { /* quota exceeded, ignore */ }
        this.listeners.forEach(fn => fn(this.lastLocation!));
      },
      () => { /* silently ignore errors – location just stays cached */ },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  /** Stop watching (call on layout unmount) */
  stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
    this.started = false;
  }

  /** Returns cached location instantly – no browser prompt. Auto-starts if needed. */
  getLastKnownLocation(): LatLng | null {
    // Auto-start watching if not already
    if (!this.started) {
      this.startWatching();
    }
    return this.lastLocation;
  }

  /** Subscribe to location updates */
  onUpdate(fn: (loc: LatLng) => void) {
    this.listeners.add(fn);
    // Auto-start if not already watching
    if (!this.started) {
      this.startWatching();
    }
    return () => { this.listeners.delete(fn); };
  }
}

export const locationService = new LocationService();
