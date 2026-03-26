/**
 * Singleton GPS location service.
 * Calls watchPosition once so the browser only asks for permission a single time.
 * Consumers call getLastKnownLocation() to read cached coords instantly.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

class LocationService {
  private watchId: number | null = null;
  private lastLocation: LatLng | null = null;
  private listeners: Set<(loc: LatLng) => void> = new Set();

  /** Start background GPS watching (call once on layout mount) */
  startWatching() {
    if (this.watchId !== null) return;           // already watching
    if (!navigator.geolocation) return;

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.lastLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.listeners.forEach(fn => fn(this.lastLocation!));
      },
      () => { /* silently ignore errors – location just stays null */ },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 },
    );
  }

  /** Stop watching (call on layout unmount) */
  stopWatching() {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }

  /** Returns cached location instantly – no browser prompt */
  getLastKnownLocation(): LatLng | null {
    return this.lastLocation;
  }

  /** Subscribe to location updates */
  onUpdate(fn: (loc: LatLng) => void) {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
}

export const locationService = new LocationService();
