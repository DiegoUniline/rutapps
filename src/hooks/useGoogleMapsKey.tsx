import { useState, useEffect, createContext, useContext, ReactNode } from 'react';
import { useJsApiLoader } from '@react-google-maps/api';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

let cachedKey: string | null = null;

export function useGoogleMapsKey() {
  const [apiKey, setApiKey] = useState<string | null>(cachedKey);
  const [loading, setLoading] = useState(!cachedKey);

  useEffect(() => {
    if (cachedKey) return;
    
    (async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session?.session?.access_token;
        const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
        
        const res = await fetch(`https://${projectId}.supabase.co/functions/v1/get-maps-key`, {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
        
        if (res.ok) {
          const { key } = await res.json();
          cachedKey = key;
          setApiKey(key);
        }
      } catch (e) {
        console.error('Failed to load Google Maps key:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return { apiKey, loading };
}

const GoogleMapsContext = createContext<{ isLoaded: boolean }>({ isLoaded: false });

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

function GoogleMapsLoaderInner({ apiKey, children }: { apiKey: string; children: ReactNode }) {
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    id: 'google-map-shared',
  });

  return (
    <GoogleMapsContext.Provider value={{ isLoaded }}>
      {children}
    </GoogleMapsContext.Provider>
  );
}

export function GoogleMapsProvider({ children }: { children: ReactNode }) {
  const { apiKey, loading } = useGoogleMapsKey();

  if (loading || !apiKey) {
    return (
      <div className="h-[calc(100vh-theme(spacing.9))] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <GoogleMapsLoaderInner apiKey={apiKey}>
      {children}
    </GoogleMapsLoaderInner>
  );
}
