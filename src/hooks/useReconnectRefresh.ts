import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Etapa 2 — Reconexión inteligente.
 *
 * Cuando el dispositivo vuelve de offline o el usuario regresa a la pestaña,
 * invalida SOLO las queries que están actualmente montadas (active) para que
 * se refresquen los datos perdidos durante la desconexión.
 *
 * Diseño anti-costo:
 * - No hace polling (no consume servidor mientras todo va bien).
 * - Sólo invalida queries `active` (las que hay en pantalla), no toda la cache.
 * - Throttle de 5s para evitar ráfagas si visibilitychange/online disparan juntos.
 * - No recarga la página: React Query refetch en background, el usuario no pierde
 *   estado de formularios, modales ni datos sin guardar.
 */
export function useReconnectRefresh() {
  const qc = useQueryClient();

  useEffect(() => {
    let lastRun = 0;
    const MIN_INTERVAL_MS = 5000;

    const refresh = (reason: string) => {
      const now = Date.now();
      if (now - lastRun < MIN_INTERVAL_MS) return;
      lastRun = now;
      // Solo queries activas (montadas). Las inactivas se refrescarán
      // cuando un componente las vuelva a usar (lazy).
      qc.invalidateQueries({ type: "active" });
      if (typeof console !== "undefined") {
        console.debug(`[reconnect-refresh] invalidate active queries: ${reason}`);
      }
    };

    const onOnline = () => refresh("online");
    const onVisibility = () => {
      if (document.visibilityState === "visible" && navigator.onLine) {
        refresh("visible");
      }
    };
    const onFocus = () => {
      if (navigator.onLine) refresh("focus");
    };

    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
    };
  }, [qc]);
}
