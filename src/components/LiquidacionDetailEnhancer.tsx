import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { BadgeDollarSign, Boxes, CreditCard, LayoutList, PackageCheck, ReceiptText, RotateCcw, ShoppingCart, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type TabKey = 'todo' | 'resumen' | 'ventas' | 'productos' | 'cobros' | 'gastos' | 'devoluciones';

type DetailDom = {
  panel: HTMLElement;
  overlay: HTMLElement;
  header: HTMLElement;
  navHost: HTMLElement;
};

const TABS: Array<{ key: TabKey; label: string; icon: typeof LayoutList }> = [
  { key: 'todo', label: 'Todo', icon: LayoutList },
  { key: 'resumen', label: 'Resumen', icon: BadgeDollarSign },
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart },
  { key: 'productos', label: 'Productos', icon: PackageCheck },
  { key: 'cobros', label: 'Cobros', icon: CreditCard },
  { key: 'gastos', label: 'Gastos', icon: TrendingDown },
  { key: 'devoluciones', label: 'Devoluciones', icon: RotateCcw },
];

function normalize(text: string) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function findDetail(): DetailDom | null {
  const headings = Array.from(document.querySelectorAll<HTMLElement>('h1,h2,h3'));
  const title = headings.find(node => normalize(node.textContent || '').includes('revision completa de liquidacion'));
  if (!title) return null;

  const header = title.closest<HTMLElement>('.sticky') ?? title.parentElement?.parentElement ?? null;
  if (!header) return null;

  const panel = header.parentElement;
  const overlay = panel?.parentElement;
  if (!(panel instanceof HTMLElement) || !(overlay instanceof HTMLElement)) return null;

  let navHost = panel.querySelector<HTMLElement>('[data-liquidacion-detail-nav="true"]');
  if (!navHost) {
    navHost = document.createElement('div');
    navHost.dataset.liquidacionDetailNav = 'true';
    header.insertAdjacentElement('afterend', navHost);
  }

  return { panel, overlay, header, navHost };
}

function setImportant(el: HTMLElement, prop: string, value: string) {
  el.style.setProperty(prop, value, 'important');
}

function applyDetailLayout(dom: DetailDom) {
  const { overlay, panel, header, navHost } = dom;

  overlay.dataset.liquidacionEnhanced = 'true';
  setImportant(overlay, 'background', 'hsl(var(--background))');
  setImportant(overlay, 'padding', '0');
  setImportant(overlay, 'align-items', 'stretch');
  setImportant(overlay, 'justify-content', 'stretch');

  setImportant(panel, 'width', '100%');
  setImportant(panel, 'max-width', 'none');
  setImportant(panel, 'height', '100dvh');
  setImportant(panel, 'max-height', '100dvh');
  setImportant(panel, 'border-radius', '0');
  setImportant(panel, 'border', '0');
  setImportant(panel, 'overflow-y', 'auto');
  setImportant(panel, 'overflow-x', 'hidden');
  setImportant(panel, 'background', 'hsl(var(--background))');

  setImportant(header, 'top', '0');
  setImportant(header, 'z-index', '30');
  setImportant(header, 'background', 'hsl(var(--background))');
  setImportant(header, 'box-shadow', '0 1px 0 hsl(var(--border))');

  navHost.style.position = 'sticky';
  navHost.style.top = `${Math.max(64, header.getBoundingClientRect().height)}px`;
  navHost.style.zIndex = '25';
  navHost.style.background = 'hsl(var(--background))';
  navHost.style.borderBottom = '1px solid hsl(var(--border))';
}

function restoreDetailLayout(dom: DetailDom | null) {
  if (!dom) return;
  const { overlay, panel, header, navHost } = dom;
  delete overlay.dataset.liquidacionEnhanced;
  ['background', 'padding', 'align-items', 'justify-content'].forEach(prop => overlay.style.removeProperty(prop));
  ['width', 'max-width', 'height', 'max-height', 'border-radius', 'border', 'overflow-y', 'overflow-x', 'background'].forEach(prop => panel.style.removeProperty(prop));
  ['top', 'z-index', 'background', 'box-shadow'].forEach(prop => header.style.removeProperty(prop));
  navHost.remove();
}

function classifySection(element: HTMLElement): TabKey | 'other' {
  if (element.dataset.liquidacionDetailNav === 'true') return 'other';
  const heading = element.querySelector<HTMLElement>('h3');
  const text = normalize(heading?.textContent || element.textContent || '');

  if (text.includes('cuadre de efectivo')) return 'resumen';
  if (text.includes('ventas del periodo')) return 'ventas';
  if (text.includes('productos vendidos')) return 'productos';
  if (text.includes('cobros recibidos')) return 'cobros';
  if (text.includes('gastos (') || text.startsWith('gastos')) return 'gastos';
  if (text.includes('devoluciones')) return 'devoluciones';
  return 'other';
}

function applyTab(dom: DetailDom, tab: TabKey) {
  const children = Array.from(dom.panel.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  const headerIndex = children.indexOf(dom.header);
  const navIndex = children.indexOf(dom.navHost);

  children.forEach((child, index) => {
    if (index === headerIndex || index === navIndex) {
      child.style.removeProperty('display');
      return;
    }

    if (tab === 'todo') {
      child.style.removeProperty('display');
      return;
    }

    const classification = classifySection(child);
    const isSummaryKpis = classification === 'other' && index === Math.max(headerIndex, navIndex) + 1;
    const hasSectionHeading = !!child.querySelector('h3');
    const keepAlways = classification === 'other' && !isSummaryKpis && !hasSectionHeading;
    const visible = (tab === 'resumen' && (classification === 'resumen' || isSummaryKpis)) || classification === tab || keepAlways;
    child.style.display = visible ? '' : 'none';
  });

  dom.panel.scrollTo({ top: 0, behavior: 'smooth' });
}

export default function LiquidacionDetailEnhancer() {
  const [dom, setDom] = useState<DetailDom | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('todo');

  useEffect(() => {
    let current: DetailDom | null = null;
    let raf = 0;

    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const next = findDetail();
        if (!next) {
          if (current) restoreDetailLayout(current);
          current = null;
          setDom(null);
          return;
        }

        if (!current || current.panel !== next.panel) {
          if (current) restoreDetailLayout(current);
          current = next;
          setActiveTab('todo');
          setDom(next);
        }
        applyDetailLayout(next);
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener('resize', sync);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', sync);
      restoreDetailLayout(current);
    };
  }, []);

  useEffect(() => {
    if (!dom) return;
    applyDetailLayout(dom);
    applyTab(dom, activeTab);
  }, [dom, activeTab]);

  const counts = useMemo(() => {
    if (!dom) return {} as Partial<Record<TabKey, string>>;
    const result: Partial<Record<TabKey, string>> = {};
    Array.from(dom.panel.children).forEach(child => {
      if (!(child instanceof HTMLElement)) return;
      const key = classifySection(child);
      if (key === 'other' || key === 'resumen') return;
      const heading = child.querySelector<HTMLElement>('h3')?.textContent || '';
      const match = heading.match(/\(([^)]+)\)/);
      if (match) result[key] = match[1];
    });
    return result;
  }, [dom]);

  if (!dom) return null;

  return createPortal(
    <div className="mx-auto flex w-full max-w-[1600px] items-center gap-2 overflow-x-auto px-4 py-2.5 sm:px-6 lg:px-8">
      <div className="mr-2 hidden items-center gap-2 text-xs font-bold text-muted-foreground lg:flex">
        <ReceiptText className="h-4 w-4" />
        Detalle de liquidación
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
            {counts[tab.key] && <span className={cn('ml-0.5 text-[10px]', active ? 'text-primary-foreground/80' : 'text-muted-foreground')}>{counts[tab.key]}</span>}
          </button>
        );
      })}
      <div className="ml-auto hidden shrink-0 items-center gap-1.5 rounded-lg bg-muted/60 px-3 py-2 text-[10px] font-medium text-muted-foreground xl:flex">
        <Boxes className="h-3.5 w-3.5" />
        Todo muestra la auditoría completa · usa las pestañas para ir directo a un bloque
      </div>
    </div>,
    dom.navHost,
  );
}
