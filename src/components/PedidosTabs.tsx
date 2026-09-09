import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';
import { BarChart3, List, SlidersHorizontal } from 'lucide-react';
import '@/styles/pedidos-workspace.css';

const TABS = [
  { label: 'Pendientes', path: '/logistica/pedidos' },
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

export function PedidosTabs() {
  const { pathname } = useLocation();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [mode, setMode] = useState<WorkspaceMode>('list');

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
  }, [pathname]);

  useEffect(() => {
    if (!filtersOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtersOpen]);

  // Presentation-only state shared by the three logistics pages. It never touches page data.
  useEffect(() => {
    document.body.dataset.pedidosPage = page;
    document.body.dataset.pedidosMode = mode;
    document.body.dataset.pedidosFilters = filtersOpen ? 'open' : 'closed';

    return () => {
      delete document.body.dataset.pedidosPage;
      delete document.body.dataset.pedidosMode;
      delete document.body.dataset.pedidosFilters;
    };
  }, [page, mode, filtersOpen]);

  return (
    <>
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
            <button
              type="button"
              className="pedidos-view-button border border-border bg-background"
              data-active={filtersOpen ? 'true' : 'false'}
              aria-pressed={filtersOpen}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen(v => !v)}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Filtros</span>
            </button>

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
      </div>
    </>
  );
}

export default PedidosTabs;
