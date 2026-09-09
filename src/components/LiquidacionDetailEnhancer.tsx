import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BadgeDollarSign, Boxes, CreditCard, LayoutDashboard, PackageCheck,
  ReceiptText, RotateCcw, ShoppingCart, TrendingDown, Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey =
  | 'todo'
  | 'resumen'
  | 'ventas'
  | 'productos'
  | 'cobros'
  | 'entregas'
  | 'gastos'
  | 'devoluciones'
  | 'inventario';

type SectionKey = Exclude<TabKey, 'todo'> | 'summary' | 'supervision' | 'other';

type DetailDom = {
  panel: HTMLElement;
  overlay: HTMLElement;
  header: HTMLElement;
  navHost: HTMLElement;
  main: HTMLElement;
  pageRoot: HTMLElement;
};

const TABS: Array<{ key: TabKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'todo', label: 'Todo', icon: LayoutDashboard },
  { key: 'resumen', label: 'Resumen', icon: BadgeDollarSign },
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { key: 'productos', label: 'Productos', icon: PackageCheck },
  { key: 'cobros', label: 'Cobros', icon: CreditCard },
  { key: 'entregas', label: 'Entregas', icon: Truck },
  { key: 'gastos', label: 'Gastos', icon: TrendingDown },
  { key: 'devoluciones', label: 'Devoluciones', icon: RotateCcw },
  { key: 'inventario', label: 'Inventario / carga', icon: Boxes },
];

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function rememberStyle(element: HTMLElement) {
  if (element.dataset.liqStyleSaved === 'true') return;
  element.dataset.liqStyleSaved = 'true';
  element.dataset.liqOriginalStyle = element.getAttribute('style') ?? '';
}

function restoreStyle(element: HTMLElement) {
  if (element.dataset.liqStyleSaved !== 'true') return;
  const original = element.dataset.liqOriginalStyle ?? '';
  if (original) element.setAttribute('style', original);
  else element.removeAttribute('style');
  delete element.dataset.liqStyleSaved;
  delete element.dataset.liqOriginalStyle;
  delete element.dataset.liqSection;
}

function setStyle(element: HTMLElement, property: string, value: string, important = false) {
  rememberStyle(element);
  element.style.setProperty(property, value, important ? 'important' : '');
}

function findDetail(): DetailDom | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3'));
  const title = headings.find(node => normalize(node.textContent || '').includes('revision completa de liquidacion'));
  if (!title) return null;

  const header = title.closest<HTMLElement>('.sticky') ?? title.parentElement?.parentElement ?? null;
  if (!header) return null;

  const panel = header.parentElement;
  const overlay = panel?.parentElement;
  const main = overlay?.closest<HTMLElement>('main');
  const pageRoot = overlay?.parentElement;
  if (!(panel instanceof HTMLElement) || !(overlay instanceof HTMLElement) || !(main instanceof HTMLElement) || !(pageRoot instanceof HTMLElement)) return null;

  let navHost = panel.querySelector<HTMLElement>('[data-liquidacion-detail-nav="true"]');
  if (!navHost) {
    navHost = document.createElement('div');
    navHost.dataset.liquidacionDetailNav = 'true';
    header.insertAdjacentElement('afterend', navHost);
  }

  return { panel, overlay, header, navHost, main, pageRoot };
}

function classifySection(element: HTMLElement): SectionKey {
  if (element.dataset.liquidacionDetailNav === 'true') return 'other';

  const heading = element.querySelector<HTMLElement>('h3');
  const headingText = normalize(heading?.textContent || '');
  const allText = normalize(element.textContent || '');

  if (!heading && allText.includes('ventas contado') && allText.includes('cobros recibidos') && allText.includes('devoluciones')) return 'summary';
  if (headingText.includes('cuadre de efectivo')) return 'resumen';
  if (headingText.includes('ventas del periodo')) return 'ventas';
  if (headingText.includes('productos vendidos')) return 'productos';
  if (headingText.includes('cobros recibidos') || headingText.includes('abonos por cliente')) return 'cobros';
  if (headingText.includes('entregas realizadas')) return 'entregas';
  if (headingText.startsWith('gastos')) return 'gastos';
  if (headingText.includes('devoluciones')) return 'devoluciones';
  if (headingText.startsWith('stock') || headingText.includes('cuadre de productos')) return 'inventario';
  if (allText.includes('aprobar liquidacion') || allText.includes('rechazar con nota') || allText.includes('notas del administrador')) return 'supervision';
  return 'other';
}

function directContent(dom: DetailDom) {
  return Array.from(dom.panel.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child !== dom.header && child !== dom.navHost
  );
}

function pageSiblings(dom: DetailDom) {
  return Array.from(dom.pageRoot.children).filter((child): child is HTMLElement =>
    child instanceof HTMLElement && child !== dom.overlay
  );
}

function cardify(element: HTMLElement) {
  setStyle(element, 'min-width', '0');
  setStyle(element, 'background', 'hsl(var(--card))', true);
  setStyle(element, 'border', '1px solid hsl(var(--border))', true);
  setStyle(element, 'border-radius', '14px', true);
  setStyle(element, 'box-shadow', '0 1px 2px rgb(0 0 0 / 0.035)');

  element.querySelectorAll<HTMLElement>('table').forEach(table => {
    setStyle(table, 'width', '100%');
    setStyle(table, 'border-collapse', 'collapse');
  });
}

/**
 * Convierte el modal original en una vista real dentro del área central de RutApp.
 * La lista queda desmontada visualmente mientras existe el detalle, pero el sidebar,
 * selector de empresa, buscador y breadcrumb permanecen visibles.
 */
function applyInlineShell(dom: DetailDom) {
  const { overlay, panel, header, navHost, pageRoot } = dom;

  pageSiblings(dom).forEach(sibling => setStyle(sibling, 'display', 'none', true));

  setStyle(pageRoot, 'padding', '0', true);
  setStyle(pageRoot, 'margin', '0', true);
  setStyle(pageRoot, 'max-width', 'none', true);
  setStyle(pageRoot, 'background', 'hsl(var(--background))', true);

  overlay.dataset.liquidacionEnhanced = 'true';
  setStyle(overlay, 'position', 'relative', true);
  setStyle(overlay, 'inset', 'auto', true);
  setStyle(overlay, 'display', 'block', true);
  setStyle(overlay, 'width', '100%', true);
  setStyle(overlay, 'height', 'auto', true);
  setStyle(overlay, 'min-height', '100%', true);
  setStyle(overlay, 'padding', '0', true);
  setStyle(overlay, 'margin', '0', true);
  setStyle(overlay, 'background', 'hsl(var(--background))', true);
  setStyle(overlay, 'z-index', 'auto', true);

  setStyle(panel, 'width', '100%', true);
  setStyle(panel, 'max-width', 'none', true);
  setStyle(panel, 'height', 'auto', true);
  setStyle(panel, 'max-height', 'none', true);
  setStyle(panel, 'margin', '0', true);
  setStyle(panel, 'border-radius', '0', true);
  setStyle(panel, 'border', '0', true);
  setStyle(panel, 'overflow', 'visible', true);
  setStyle(panel, 'background', 'hsl(var(--background))', true);

  setStyle(header, 'position', 'sticky', true);
  setStyle(header, 'top', '0', true);
  setStyle(header, 'z-index', '30', true);
  setStyle(header, 'background', 'hsl(var(--card))', true);
  setStyle(header, 'box-shadow', '0 1px 0 hsl(var(--border))', true);
  setStyle(header, 'padding', '14px 20px', true);

  const headerHeight = Math.max(58, header.getBoundingClientRect().height);
  setStyle(navHost, 'position', 'sticky', true);
  setStyle(navHost, 'top', `${headerHeight}px`, true);
  setStyle(navHost, 'z-index', '25', true);
  setStyle(navHost, 'background', 'hsl(var(--background) / 0.98)', true);
  setStyle(navHost, 'backdrop-filter', 'blur(12px)', true);
  setStyle(navHost, 'border-bottom', '1px solid hsl(var(--border))', true);
}

function todoColumn(key: SectionKey, wide: boolean) {
  if (!wide) return '1 / -1';
  switch (key) {
    case 'summary':
    case 'resumen':
    case 'supervision':
    case 'other':
      return '1 / -1';
    case 'ventas':
    case 'cobros':
      return '1 / 7';
    case 'productos':
    case 'entregas':
      return '7 / -1';
    case 'gastos':
      return '1 / 5';
    case 'devoluciones':
      return '5 / 9';
    case 'inventario':
      return '9 / -1';
    default:
      return '1 / -1';
  }
}

function previewHeight(key: SectionKey) {
  switch (key) {
    case 'ventas':
    case 'productos':
    case 'cobros':
      return '285px';
    case 'entregas':
      return '340px';
    case 'gastos':
    case 'devoluciones':
    case 'inventario':
      return '250px';
    default:
      return 'none';
  }
}

function applyTodo(dom: DetailDom) {
  const wide = dom.main.getBoundingClientRect().width >= 1080;

  setStyle(dom.panel, 'display', 'grid', true);
  setStyle(dom.panel, 'grid-template-columns', wide ? 'repeat(12, minmax(0, 1fr))' : 'minmax(0, 1fr)', true);
  setStyle(dom.panel, 'column-gap', '14px', true);
  setStyle(dom.panel, 'row-gap', '14px', true);
  setStyle(dom.panel, 'align-content', 'start', true);
  setStyle(dom.panel, 'padding', '0 16px 24px', true);

  [dom.header, dom.navHost].forEach(element => {
    setStyle(element, 'grid-column', '1 / -1', true);
    setStyle(element, 'margin-left', '-16px', true);
    setStyle(element, 'margin-right', '-16px', true);
  });

  directContent(dom).forEach(element => {
    const key = classifySection(element);
    element.dataset.liqSection = key;
    element.style.setProperty('display', 'block', 'important');
    cardify(element);
    setStyle(element, 'grid-column', todoColumn(key, wide), true);
    setStyle(element, 'margin', '0', true);
    setStyle(element, 'width', 'auto', true);
    setStyle(element, 'max-width', 'none', true);

    const maxHeight = previewHeight(key);
    if (maxHeight !== 'none') {
      // Todo = vista ejecutiva. No crea scrolls internos: recorta el bloque y
      // la pestaña correspondiente muestra el detalle completo.
      setStyle(element, 'max-height', maxHeight, true);
      setStyle(element, 'overflow', 'hidden', true);
    } else {
      setStyle(element, 'max-height', 'none', true);
      setStyle(element, 'overflow', 'visible', true);
    }
  });
}

function tabMatches(tab: TabKey, section: SectionKey) {
  if (tab === 'resumen') return section === 'summary' || section === 'resumen' || section === 'supervision';
  if (tab === 'inventario') return section === 'inventario';
  return section === tab;
}

function applyFocusedTab(dom: DetailDom, tab: Exclude<TabKey, 'todo'>) {
  setStyle(dom.panel, 'display', 'block', true);
  setStyle(dom.panel, 'padding', '0 0 32px', true);
  setStyle(dom.header, 'margin-left', '0', true);
  setStyle(dom.header, 'margin-right', '0', true);
  setStyle(dom.navHost, 'margin-left', '0', true);
  setStyle(dom.navHost, 'margin-right', '0', true);

  directContent(dom).forEach(element => {
    const key = classifySection(element);
    element.dataset.liqSection = key;
    const visible = tabMatches(tab, key);
    element.style.setProperty('display', visible ? 'block' : 'none', 'important');
    if (!visible) return;

    cardify(element);
    setStyle(element, 'width', 'calc(100% - 32px)', true);
    setStyle(element, 'max-width', '1500px', true);
    setStyle(element, 'margin', '16px auto 0', true);
    setStyle(element, 'max-height', 'none', true);
    setStyle(element, 'overflow', 'visible', true);
  });
}

function restoreDetail(dom: DetailDom | null) {
  if (!dom) return;
  delete dom.overlay.dataset.liquidacionEnhanced;
  [dom.pageRoot, dom.overlay, dom.panel, dom.header, dom.navHost, ...pageSiblings(dom), ...directContent(dom)].forEach(restoreStyle);
  dom.navHost.remove();
}

function countForSection(element: HTMLElement, key: SectionKey) {
  const heading = element.querySelector<HTMLElement>('h3')?.textContent || '';
  const match = heading.match(/\(([^)]+)\)/);
  if (!match) return null;
  const raw = match[1].trim();
  if (key === 'devoluciones') return raw.match(/\d+/)?.[0] ?? raw;
  return raw.split('·')[0].trim();
}

export default function LiquidacionDetailEnhancer() {
  const [dom, setDom] = useState<DetailDom | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('todo');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current: DetailDom | null = null;
    let raf = 0;
    let resizeObserver: ResizeObserver | null = null;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = findDetail();
        if (!next) {
          if (current) restoreDetail(current);
          resizeObserver?.disconnect();
          resizeObserver = null;
          current = null;
          setDom(null);
          return;
        }

        if (!current || current.panel !== next.panel) {
          if (current) restoreDetail(current);
          resizeObserver?.disconnect();
          current = next;
          setActiveTab('todo');
          setDom(next);

          resizeObserver = new ResizeObserver(() => {
            if (!current) return;
            applyInlineShell(current);
            setRevision(value => value + 1);
          });
          resizeObserver.observe(next.main);
          resizeObserver.observe(next.header);
        }

        applyInlineShell(next);
        setRevision(value => value + 1);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    window.addEventListener('resize', sync);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('resize', sync);
      restoreDetail(current);
    };
  }, []);

  useEffect(() => {
    if (!dom) return;
    applyInlineShell(dom);
    if (activeTab === 'todo') applyTodo(dom);
    else applyFocusedTab(dom, activeTab);
  }, [dom, activeTab, revision]);

  const counts = useMemo(() => {
    if (!dom) return {} as Partial<Record<TabKey, string>>;
    const result: Partial<Record<TabKey, string>> = {};
    directContent(dom).forEach(element => {
      const key = classifySection(element);
      if (key === 'other' || key === 'summary' || key === 'supervision' || key === 'resumen') return;
      const count = countForSection(element, key);
      if (count != null) result[key as TabKey] = count;
    });
    return result;
    // revision intentionally refreshes counts after async queries render.
  }, [dom, revision]);

  if (!dom) return null;

  return createPortal(
    <div className="mx-auto flex w-full max-w-[1600px] items-center gap-1.5 overflow-x-auto px-4 py-2.5 sm:px-5">
      <div className="mr-2 hidden shrink-0 items-center gap-2 text-xs font-black text-foreground lg:flex">
        <ReceiptText className="h-4 w-4 text-primary" />
        Auditoría de liquidación
      </div>

      {TABS.map(tab => {
        const Icon = tab.icon;
        const active = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors',
              active
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground',
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {tab.label}
            {counts[tab.key] != null && (
              <span className={cn('ml-0.5 rounded px-1 text-[9px]', active ? 'bg-white/15 text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                {counts[tab.key]}
              </span>
            )}
          </button>
        );
      })}

      <div className="ml-auto hidden shrink-0 text-[10px] font-medium text-muted-foreground 2xl:block">
        Todo = vista ejecutiva · pestaña = detalle completo
      </div>
    </div>,
    dom.navHost,
  );
}
