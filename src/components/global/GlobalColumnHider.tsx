import { useEffect, useRef, useState } from "react";

/**
 * GlobalColumnHider
 * Click derecho sobre cualquier <th> abre un menú "Ocultar columna" / "Mostrar todas".
 * Persiste estado en localStorage por pathname + tableId + índice.
 *
 * Para excluir una tabla, agregar atributo data-no-hide en el <table>.
 */

const STORAGE_KEY = "umo-col-hidden-v1";
const TABLE_KEY_ATTR = "data-umo-table-key";
const ENHANCED_ATTR = "data-umo-hide-enhanced";
const HIDE_CLASS = "umo-col-hidden";

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

function readHidden(): Record<string, number[]> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function writeHidden(data: Record<string, number[]>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore */
  }
}

function applyHiddenToTable(table: HTMLTableElement) {
  const key = getTableKey(table);
  const all = readHidden();
  const hidden = new Set(all[key] || []);
  // limpiar previos
  table
    .querySelectorAll<HTMLElement>(`.${HIDE_CLASS}`)
    .forEach((el) => el.classList.remove(HIDE_CLASS));
  if (hidden.size === 0) return;

  const ths = table.querySelectorAll<HTMLTableCellElement>("thead th");
  ths.forEach((th, idx) => {
    if (hidden.has(idx)) th.classList.add(HIDE_CLASS);
  });
  const rows = table.querySelectorAll<HTMLTableRowElement>("tbody tr");
  rows.forEach((tr) => {
    const cells = tr.children;
    hidden.forEach((idx) => {
      const cell = cells[idx] as HTMLElement | undefined;
      if (cell) cell.classList.add(HIDE_CLASS);
    });
  });
}

function attachHider(
  table: HTMLTableElement,
  openMenu: (
    x: number,
    y: number,
    table: HTMLTableElement,
    colIdx: number,
  ) => void,
) {
  if (table.getAttribute(ENHANCED_ATTR) === "1") return;
  if (table.hasAttribute("data-no-hide")) return;
  table.setAttribute(ENHANCED_ATTR, "1");

  applyHiddenToTable(table);

  table.addEventListener("contextmenu", (e) => {
    const target = e.target as HTMLElement;
    const th = target.closest("th") as HTMLTableCellElement | null;
    if (!th || !table.contains(th)) return;
    const ths = Array.from(
      table.querySelectorAll<HTMLTableCellElement>("thead th"),
    );
    const idx = ths.indexOf(th);
    if (idx < 0) return;
    e.preventDefault();
    openMenu(e.clientX, e.clientY, table, idx);
  });
}

interface MenuState {
  x: number;
  y: number;
  table: HTMLTableElement;
  colIdx: number;
}

export default function GlobalColumnHider() {
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let raf = 0;
    const openMenu = (
      x: number,
      y: number,
      table: HTMLTableElement,
      colIdx: number,
    ) => {
      setMenu({ x, y, table, colIdx });
    };
    const scan = () => {
      document
        .querySelectorAll<HTMLTableElement>("table")
        .forEach((t) => attachHider(t, openMenu));
    };
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

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  if (!menu) return null;

  const tableKey = menu.table.getAttribute("data-umo-table-key") || "";
  const all = readHidden();
  const hidden = all[tableKey] || [];
  const hasHidden = hidden.length > 0;

  const hideCol = () => {
    const next = Array.from(new Set([...(hidden || []), menu.colIdx]));
    all[tableKey] = next;
    writeHidden(all);
    applyHiddenToTable(menu.table);
    setMenu(null);
  };

  const showAll = () => {
    delete all[tableKey];
    writeHidden(all);
    applyHiddenToTable(menu.table);
    setMenu(null);
  };

  // posicionar dentro del viewport
  const maxX = window.innerWidth - 200;
  const maxY = window.innerHeight - 120;
  const x = Math.min(menu.x, maxX);
  const y = Math.min(menu.y, maxY);

  return (
    <div
      ref={menuRef}
      className="lov-col-menu"
      style={{ left: x, top: y }}
      role="menu"
    >
      <div className="lov-col-menu-item" onClick={hideCol} role="menuitem">
        Ocultar columna
      </div>
      {hasHidden && (
        <div className="lov-col-menu-item" onClick={showAll} role="menuitem">
          Mostrar todas las columnas
        </div>
      )}
    </div>
  );
}
