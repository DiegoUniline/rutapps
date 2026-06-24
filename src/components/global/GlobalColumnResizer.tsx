import { useEffect } from "react";

/**
 * GlobalColumnResizer
 * Permite redimensionar columnas en CUALQUIER <table> del proyecto arrastrando
 * el borde derecho del <th>. Persiste el ancho en localStorage por:
 *   pathname + tableId(o hash thead) + índice de columna
 *
 * Para excluir una tabla, agregar atributo data-no-resize en el <table>.
 */

const STORAGE_KEY = "umo-col-width-v1";
const TABLE_KEY_ATTR = "data-umo-table-key";
const ENHANCED_ATTR = "data-umo-resize-enhanced";

function hash(str: string): string {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

function getTableKey(table: HTMLTableElement): string {
  let cached = table.getAttribute(TABLE_KEY_ATTR);
  if (cached) return cached;
  const id = table.id || table.getAttribute("data-table-id");
  let key: string;
  if (id) {
    key = id;
  } else {
    const firstHeadText =
      table.tHead?.textContent?.trim().slice(0, 200) ||
      table.querySelector("thead")?.textContent?.trim().slice(0, 200) ||
      "";
    key = `h_${hash(firstHeadText)}`;
  }
  const full = `${window.location.pathname}::${key}`;
  table.setAttribute(TABLE_KEY_ATTR, full);
  return full;
}

function readWidths(): Record<string, Record<string, number>> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeWidths(data: Record<string, Record<string, number>>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function applyStoredWidths(table: HTMLTableElement) {
  const key = getTableKey(table);
  const all = readWidths();
  const widths = all[key];
  if (!widths) return;
  const ths = table.querySelectorAll<HTMLTableCellElement>("thead th");
  ths.forEach((th, idx) => {
    const w = widths[String(idx)];
    if (typeof w === "number" && w > 20) {
      th.style.width = `${w}px`;
      th.style.minWidth = `${w}px`;
    }
  });
}

function attachResize(table: HTMLTableElement) {
  if (table.getAttribute(ENHANCED_ATTR) === "1") return;
  if (table.hasAttribute("data-no-resize")) return;
  table.setAttribute(ENHANCED_ATTR, "1");

  applyStoredWidths(table);

  const onMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    const th = target.closest("th") as HTMLTableCellElement | null;
    if (!th || !table.contains(th)) return;
    const rect = th.getBoundingClientRect();
    // sólo zona de 8px del borde derecho
    if (e.clientX < rect.right - 8) return;
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const startWidth = rect.width;
    const ths = Array.from(
      table.querySelectorAll<HTMLTableCellElement>("thead th"),
    );
    const idx = ths.indexOf(th);
    if (idx < 0) return;

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    const onMove = (ev: MouseEvent) => {
      const newW = Math.max(40, startWidth + (ev.clientX - startX));
      th.style.width = `${newW}px`;
      th.style.minWidth = `${newW}px`;
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      const finalW = th.getBoundingClientRect().width;
      const key = getTableKey(table);
      const all = readWidths();
      all[key] = { ...(all[key] || {}), [String(idx)]: Math.round(finalW) };
      writeWidths(all);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  table.addEventListener("mousedown", onMouseDown);
}

function scan() {
  const tables = document.querySelectorAll<HTMLTableElement>("table");
  tables.forEach((t) => attachResize(t));
}

export default function GlobalColumnResizer() {
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        scan();
      });
    };
    schedule();
    const obs = new MutationObserver(schedule);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => {
      obs.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return null;
}
