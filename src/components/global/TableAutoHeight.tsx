import { useEffect } from "react";

/**
 * TableAutoHeight
 * Hace que CADA contenedor que envuelve una <table> se estire justo hasta el
 * borde inferior de la pantalla y scrollee ADENTRO. Así la barra horizontal
 * queda siempre visible "al nivel del monitor" (no hay que bajar al último
 * registro para usarla) y NO se pierde espacio: la tabla usa todo el alto real
 * disponible, medido según dónde empieza cada tabla.
 *
 * - Solo actúa en pantallas de monitor (>=768px). El app móvil NO se toca.
 * - Excluir una tabla con el atributo data-no-scroll en el <table>.
 * - El fondo del encabezado y su "pegado" (sticky) se manejan en index.css.
 */

const MIN_HEIGHT = 180; // px mínimos para que una tabla siempre sea usable
const BOTTOM_GAP = 12;  // respiro contra el borde inferior
const DESKTOP_MIN_WIDTH = 768;

export function TableAutoHeight() {
  useEffect(() => {
    let raf = 0;

    const run = () => {
      raf = 0;
      const desktop = window.innerWidth >= DESKTOP_MIN_WIDTH;

      // Contenedores directos de una <table> (evita duplicados).
      const wraps = new Set<HTMLElement>();
      document.querySelectorAll("table").forEach((t) => {
        if (t.hasAttribute("data-no-scroll")) return;
        const w = t.parentElement;
        if (w instanceof HTMLElement) wraps.add(w);
      });

      wraps.forEach((w) => {
        if (!desktop) {
          // En móvil, limpiar cualquier ajuste que hayamos puesto antes.
          if (w.dataset.autoTableScroll) {
            w.style.maxHeight = "";
            w.style.overflow = "";
            delete w.dataset.autoTableScroll;
          }
          return;
        }
        const top = w.getBoundingClientRect().top;
        const h = Math.max(MIN_HEIGHT, Math.round(window.innerHeight - top - BOTTOM_GAP));
        w.style.maxHeight = `${h}px`;
        w.style.overflow = "auto";
        w.dataset.autoTableScroll = "1";
      });
    };

    // rAF-debounce: coalesce ráfagas de cambios del DOM en un solo recálculo.
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(run);
    };

    schedule();
    // Reintentos tras montar para atrapar datos que cargan async.
    const t1 = window.setTimeout(schedule, 150);
    const t2 = window.setTimeout(schedule, 500);

    window.addEventListener("resize", schedule);
    // Solo childList/subtree: nuestras escrituras de style/atributo NO disparan
    // esto, así que no hay bucle infinito.
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("resize", schedule);
      mo.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, []);

  return null;
}
