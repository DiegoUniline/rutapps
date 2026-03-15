import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

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
