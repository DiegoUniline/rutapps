import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import { refreshAppVersion } from '@/lib/appUpdate';

/**
 * Banner global de "Hay una versión nueva disponible".
 *
 * Escucha el evento `uniline:sw-update-available` que dispara el wrapper de
 * registro del SW (src/pwa/registerSW.ts) cuando vite-plugin-pwa detecta una
 * nueva versión publicada. No recarga automáticamente: el usuario decide
 * cuándo aplicar la actualización para no cortar capturas en curso.
 */
export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    const handler = () => setNeedRefresh(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  if (!needRefresh) return null;

  const apply = async () => {
    setApplying(true);
    try {
      await refreshAppVersion();
    } catch {
      setTimeout(() => window.location.reload(), 400);
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md"
    >
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-background shadow-2xl shadow-primary/10 px-4 py-3 animate-in slide-in-from-bottom-4 fade-in">
        <div className="shrink-0 h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Sparkles className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">
            Hay una versión nueva disponible
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Actualiza para obtener las mejoras más recientes.
          </p>
        </div>
        <Button
          size="sm"
          onClick={apply}
          disabled={applying}
          className="shrink-0"
        >
          {applying ? 'Actualizando…' : 'Actualizar'}
        </Button>
        <button
          type="button"
          onClick={() => setNeedRefresh(false)}
          aria-label="Después"
          className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
