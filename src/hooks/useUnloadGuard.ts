import { useEffect } from 'react';

/**
 * Muestra el prompt nativo del navegador "¿Salir del sitio? Hay cambios sin
 * guardar..." cuando hay items pendientes en la cola de sincronización.
 *
 * No bloquea — solo evita cierres accidentales. Los datos quedan persistidos
 * en IndexedDB + respaldo en localStorage de todas formas.
 */
export function useUnloadGuard(pendingCount: number) {
  useEffect(() => {
    if (pendingCount <= 0) return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // El mensaje custom ya no se muestra en navegadores modernos,
      // pero el solo hecho de setear returnValue dispara el diálogo nativo.
      e.returnValue = '';
      return '';
    };

    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [pendingCount]);
}
