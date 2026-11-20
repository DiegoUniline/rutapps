import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, List, Search, SlidersHorizontal } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { Loader2 } from 'lucide-react';
import '@/styles/pedidos-workspace.css';
import '@/styles/pedidos-workspace-compact.css';

const TABS = [
  { label: 'Pedidos', path: '/logistica/pedidos' },
  { label: 'Entregas', path: '/logistica/entregas' },
  { label: 'Concentrado a surtir', path: '/logistica/concentrado' },
];

// Prefetch sibling chunks so tab switches are instant
const prefetchTabs = () => {
  import('@/pages/DemandaPage');
  import('@/pages/EntregaListPage');
  import('@/pages/logistica/ConcentradoSurtidoPage');
};

type WorkspaceMode = 'list' | 'stats';
type WorkspacePage = 'pendientes' | 'entregas' | 'concentrado';

const normalizeSearchText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

interface PedidosTabsProps {
  /** Rango de fechas de la página: se dibuja dentro de la barra, a la izquierda del buscador. */
  fechas?: { desde: string; hasta: string; onChange: (desde: string, hasta: string) => void; headerContent?: React.ReactNode };
  /** Búsqueda real de la página (en el servidor). Sin ella, la barra filtra lo ya cargado. */
  busqueda?: { value: string; onChange: (v: string) => void; pendiente?: boolean; placeholder?: string };
}

export function PedidosTabs({ fechas, busqueda }: PedidosTabsProps = {}) {
  const { pathname } = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>('list');
  const [universalSearchLocal, setUniversalSearchLocal] = useState('');
  const universalSearch = busqueda ? '' : universalSearchLocal;
  const setUniversalSearch = setUniversalSearchLocal;

  const page = useMemo<WorkspacePage>(() => {
    if (pathname.startsWith('/logistica/entregas')) return 'entregas';
    if (pathname.startsWith('/logistica/concentrado')) return 'concentrado';
    return 'pendientes';
  }, [pathname]);

  useEffect(() => { prefetchTabs(); }, []);

  // Each section opens in its operational list; filters are intentionally on demand.
  useEffect(() => {
    setFiltersOpen(false);
    setMode('list');
    setUniversalSearch('');
  }, [pathname]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtersOpen]);

  // Universal search is presentation-only: it filters the rows already loaded by
  // each workspace, so it never alters business queries, calculations or mutations.
  useEffect(() => {
    const tabs = document.querySelector<HTMLElement>('[data-pedidos-tabs]');
    const root = tabs?.closest<HTMLElement>('[data-listpage]') ?? tabs?.parentElement;
    if (!root) return;

    const terms = normalizeSearchText(universalSearch)
      .split(/\s+/)
      .filter(Boolean);

    const applySearch = () => {
      const rows = root.querySelectorAll<HTMLElement>('tbody > tr, [data-lista-tarjetas] > *');
      rows.forEach((row) => {
        if (terms.length === 0) {
          row.style.removeProperty('display');
          return;
        }
        const text = normalizeSearchText(row.textContent ?? '');
        const matches = terms.every(term => text.includes(term));
        row.style.display = matches ? '' : 'none';
      });
    };

    applySearch();
    const observer = new MutationObserver(() => window.requestAnimationFrame(applySearch));
    observer.observe(root, { childList: true, subtree: true, characterData: true });

    return () => {
      observer.disconnect();
      root.querySelectorAll<HTMLElement>('tbody > tr, [data-lista-tarjetas] > *').forEach(row => row.style.removeProperty('display'));
    };
  }, [universalSearch, pathname, mode]);

  // Presentation-only state shared by the three logistics pages. It never touches page data.
  useEffect(() => {
    document.body.dataset.pedidosPage = page;
    document.body.dataset.pedidosMode = mode;
    document.body.dataset.pedidosFilters = filtersOpen ? 'open' : 'closed';
    document.body.dataset.pedidosSearching = universalSearch.trim() ? 'true' : 'false';

    return () => {
      delete document.body.dataset.pedidosPage;
      delete document.body.dataset.pedidosMode;
      delete document.body.dataset.pedidosFilters;
      delete document.body.dataset.pedidosSearching;
    };
  }, [page, mode, filtersOpen, universalSearch]);

  return (
    <>
      <style>{`
        body[data-pedidos-page="entregas"] [data-listpage-sheet] > .flex.flex-wrap.items-end.gap-3 > button:not([class*="gap-1.5"]) {
          display: none !important;
        }
      `}</style>

      {filtersOpen && (
        <button
          type="button"
          className="pedidos-filter-backdrop"
          aria-label="Cerrar filtros"
          onClick={() => setFiltersOpen(false)}
        />
      )}

      <div data-pedidos-tabs className="overflow-x-auto">
        <div className="pedidos-workspace-row">
          <nav className="pedidos-primary-nav" aria-label="Logística de pedidos">
            {TABS.map((t) => (
              <NavLink
                key={t.path}
                to={t.path}
                end
                className="pedidos-primary-link"
                data-active={pathname === t.path ? 'true' : 'false'}
              >
                {t.label}
              </NavLink>
            ))}
          </nav>

          <div className="pedidos-workspace-tools">
            <div className="pedidos-view-switch" aria-label="Tipo de vista">
              <button
                type="button"
                className="pedidos-view-button"
                data-active={mode === 'list' ? 'true' : 'false'}
                aria-pressed={mode === 'list'}
                onClick={() => setMode('list')}
                title="Vista operativa"
              >
                <List className="h-3.5 w-3.5" />
                <span>Operación</span>
              </button>
              <button
                type="button"
                className="pedidos-view-button"
                data-active={mode === 'stats' ? 'true' : 'false'}
                aria-pressed={mode === 'stats'}
                onClick={() => setMode('stats')}
                title="Vista de estadísticas"
              >
                <BarChart3 className="h-3.5 w-3.5" />
                <span>Estadísticas</span>
              </button>
            </div>
          </div>
        </div>

        <div className="pedidos-toolbar-shell" aria-label="Herramientas de pedidos">
          {fechas ? (
            <div className="pedidos-date-reserved flex items-stretch min-w-0">
              <DateRangePicker segmento from={fechas.desde} to={fechas.hasta} onChange={fechas.onChange} headerContent={fechas.headerContent} className="w-full" />
            </div>
          ) : (
            <div className="pedidos-date-reserved" aria-hidden="true" />
          )}
          <div className="pedidos-universal-search">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Input
              value={busqueda ? busqueda.value : universalSearch}
              onChange={(event) => (busqueda ? busqueda.onChange(event.target.value) : setUniversalSearch(event.target.value))}
              placeholder={busqueda?.placeholder ?? 'Buscar por folio, cliente, vendedor, producto...'}
              className="h-full border-0 bg-transparent px-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
              aria-label="Buscar"
            />
            {busqueda?.pendiente && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" aria-label="Buscando" />}
            {(busqueda ? busqueda.value : universalSearch) && (
              <button
                type="button"
                className="pedidos-search-clear"
                onClick={() => (busqueda ? busqueda.onChange('') : setUniversalSearch(''))}
                aria-label="Limpiar búsqueda"
              >
                ×
              </button>
            )}
          </div>
          <button
            type="button"
            className="pedidos-filter-segment"
            data-pedidos-filter-trigger
            data-active={filtersOpen ? 'true' : 'false'}
            aria-pressed={filtersOpen}
            aria-expanded={filtersOpen}
            onClick={() => setFiltersOpen(v => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span>Filtros</span>
          </button>
        </div>
      </div>
    </>
  );
}

export default PedidosTabs;
