import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Sparkles, X } from 'lucide-react';
import { refreshAppVersion } from '@/lib/appUpdate';
import { getUnsavedChanges, hasUnsavedChanges, subscribeUnsavedChanges } from '@/lib/unsavedChanges';

/**
 * Banner global de "Hay una versión nueva disponible".
 *
 * La actualización nunca debe recargar por sí sola. Además, si alguna pantalla
 * registra cambios sin guardar, se bloquea la recarga hasta que el usuario
 * guarde o descarte esos cambios.
 */
export default function PWAUpdatePrompt() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [applying, setApplying] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState('');

  useEffect(() => {
    const handler = () => setNeedRefresh(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  useEffect(() => subscribeUnsavedChanges(() => {
    if (!hasUnsavedChanges()) setBlockedMessage('');
  }), []);

  if (!needRefresh) return null;

  const apply = () => {
    if (hasUnsavedChanges()) {
      const pending = getUnsavedChanges();
      const label = pending[0]?.label;
      setBlockedMessage(label
        ? `Tienes cambios sin guardar en ${label}. Guárdalos o descártalos antes de actualizar.`
        : 'Tienes cambios sin guardar. Guárdalos o descártalos antes de actualizar.');
      return;
    }

    setBlockedMessage('');
    setApplying(true);

    // Respaldo SIEMPRE armado ANTES de esperar: updateSW(true) devuelve una
    // promesa que puede no resolverse nunca (espera la recarga del SW), así que
    // no se puede depender de su `await` para programar el fallback.
    const fallback = window.setTimeout(() => {
      void refreshAppVersion().catch(() => window.location.reload());
    }, 4000);

    try {
      const fast = (window as unknown as { __applySWUpdate?: () => Promise<void> | undefined })
        .__applySWUpdate;
      if (fast) {
        Promise.resolve(fast()).catch(() => {
          window.clearTimeout(fallback);
          void refreshAppVersion().catch(() => window.location.reload());
        });
        return;
      }
    } catch {
      // cae al respaldo
    }

    window.clearTimeout(fallback);
    void refreshAppVersion().catch(() => {
      setTimeout(() => window.location.reload(), 400);
    });
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed left-1/2 -translate-x-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)' }}
    >
      <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-background shadow-2xl shadow-primary/10 px-4 py-3 animate-in slide-in-from-bottom-4 fade-in">
        <div className={`shrink-0 h-9 w-9 rounded-full flex items-center justify-center ${blockedMessage ? 'bg-amber-500/10 text-amber-600' : 'bg-primary/10 text-primary'}`}>
          {blockedMessage ? <AlertTriangle className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-foreground leading-tight">
            {blockedMessage ? 'Primero guarda tu trabajo' : 'Hay una versión nueva disponible'}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {blockedMessage || 'Actualiza cuando termines tu captura actual.'}
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
