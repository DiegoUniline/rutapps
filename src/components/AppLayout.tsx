import { useState, useEffect, useMemo, lazy, Suspense } from 'react';
const FloatingSoporteChat = lazy(() => import('@/components/soporte/FloatingSoporteChat'));
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscription } from '@/hooks/useSubscription';
import { useSetupComplete } from '@/pages/ConfiguracionInicialPage';
import { usePermisos, PATH_MODULE_MAP } from '@/hooks/usePermisos';
import { UnilineFooter } from '@/components/UnilineFooter';
import { useTheme } from '@/hooks/useTheme';
import { useIsMobile } from '@/hooks/use-mobile';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import {
  Package, Users, ShoppingCart, BarChart3,
  LogOut, ChevronDown, PanelLeftClose, PanelLeft, Warehouse,
  DollarSign, Settings, Smartphone, Moon, Sun, MapPin, Shield, Sparkles, FileText, Menu, RefreshCw, Download, ShieldAlert, PlayCircle, LifeBuoy,
  Tag, ClipboardList, Star, ShoppingBag, ScanBarcode, Percent
} from 'lucide-react';
import { cn } from '@/lib/utils';
import NotificationRuntime from '@/components/notifications/NotificationRuntime';
import InternalNotificationBell from '@/components/notifications/InternalNotificationBell';
import TiendaOrdersBell from '@/components/notifications/TiendaOrdersBell';
import BroadcastBell from '@/components/BroadcastBell';
import BroadcastAnnouncementModal from '@/components/BroadcastAnnouncementModal';
import PublicidadPopup from '@/components/publicidad/PublicidadPopup';
import PendingInvoiceModal from '@/components/PendingInvoiceModal';
import SandboxBanner from '@/components/SandboxBanner';
import { useProductosRealtime } from '@/hooks/useData';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import SuperAdminEmpresaSelector from '@/components/SuperAdminEmpresaSelector';
import CommandPalette, { CommandPaletteButton } from '@/components/CommandPalette';
import { useFavorites } from '@/hooks/useFavorites';
import { Search } from 'lucide-react';
import { APP_VERSION, APP_BUILD_DATE } from '@/version';
import { isSuperAdminEmail } from '@/lib/superAdminEmail';
import { toast } from 'sonner';
import { refreshAppVersion } from '@/lib/appUpdate';

interface NavChild { label: string; path: string }
interface NavItem {
  label: string;
  icon: React.ElementType;
  path: string;
  children?: NavChild[];
  accent?: boolean; // highlight key items with accent color
  highlight?: 'amber' | 'green' | 'cyan' | 'violet' | 'teal' | 'pink'; // alternate accent color (distinct from primary)
}

const navItems: NavItem[] = [
  // ── Operación diaria ──
  { label: 'Dashboard', icon: BarChart3, path: '/dashboard', accent: true },

  // ── Ventas (Ingresos · verde) ──
  {
    label: 'Ventas',
    icon: ShoppingCart,
    path: '/ventas',
    highlight: 'green',
    children: [
      { label: 'Ventas', path: '/ventas' },
      { label: 'Cotizaciones', path: '/cotizaciones' },
      { label: 'Supervisor', path: '/supervisor' },
      { label: 'Cobranza · CxC · Saldos', path: '/ventas/cobranza' },
      { label: 'Promociones', path: '/ventas/promociones' },
      { label: 'Devoluciones', path: '/ventas/devoluciones' },
      { label: 'Liquidar Ruta', path: '/almacen/descargas' },
      { label: 'Comisiones', path: '/comisiones' },
      { label: 'Metas', path: '/administracion/metas' },
      { label: 'Avance metas', path: '/administracion/metas/seguimiento' },
      { label: 'Reporte diario', path: '/ventas/reporte-diario' },
    ],
  },

  // ── POS (Ingresos · verde) ──
  {
    label: 'Punto de venta', icon: ScanBarcode, path: '/pos', highlight: 'green',
    children: [
      { label: 'Abrir caja (POS)', path: '/pos' },
      { label: 'Caja · Turnos · Cortes · Gastos', path: '/pos/admin?tab=turnos' },
    ],
  },

  // ── Compras (Egresos · rosa) ──
  {
    label: 'Compras',
    icon: ShoppingBag,
    path: '/almacen/compras',
    highlight: 'pink',
    children: [
      { label: 'Órdenes de compra', path: '/almacen/compras' },
      { label: 'Compras sugeridas', path: '/almacen/compras/sugeridas' },
      { label: 'Pagos · CxP · Saldos proveedor', path: '/finanzas/por-pagar' },
      { label: 'Proveedores', path: '/proveedores' },
    ],
  },

  // ── Logística (Operaciones · cyan) ──
  {
    label: 'Logística',
    icon: MapPin,
    path: '/logistica',
    highlight: 'cyan',
    children: [
      { label: 'Pedidos · Pendientes · Entregas', path: '/logistica/pedidos' },
      { label: 'Jornadas de ruta', path: '/logistica/jornadas' },
      { label: 'Mapa de clientes', path: '/ventas/mapa-clientes' },
      { label: 'Mapa de entregas', path: '/ventas/mapa-ventas' },
      { label: 'Zonas', path: '/catalogos/zonas' },
      { label: 'Vehículos', path: '/configuracion/vehiculos' },
      { label: 'Reportes', path: '/logistica/reportes' },
    ],
  },

  // ── Catálogos (Datos maestros · violeta) ──
  {
    label: 'Catálogos',
    icon: Package,
    path: '/productos',
    highlight: 'violet',
    children: [
      { label: 'Productos', path: '/productos' },
      { label: 'Listas de precios', path: '/listas-precio' },
      { label: 'Precios y Comisiones', path: '/precios-comisiones' },
      { label: 'Categorías', path: '/catalogos/clasificaciones' },
      { label: 'Marcas', path: '/catalogos/marcas' },
      { label: 'Unidades', path: '/catalogos/unidades' },
      { label: 'Homologación catálogo', path: '/configuracion/homologacion' },
      { label: 'Consumo de datos', path: '/configuracion/consumo-datos' },
      { label: 'Proveedores', path: '/proveedores' },
    ],
  },



  // ── Almacén (Operaciones · cyan) ──
  {
    label: 'Almacén',
    icon: Warehouse,
    path: '/almacen',
    highlight: 'cyan',
    children: [
      { label: 'Inventario', path: '/almacen/inventario' },
      { label: 'Kardex', path: '/almacen/kardex' },
      { label: 'Inteligencia', path: '/almacen/inteligencia' },
      { label: 'Traspasos', path: '/almacen/traspasos' },
      { label: 'Solicitudes de traspaso', path: '/almacen/solicitudes-traspaso' },
      { label: 'Ajustes y Mermas', path: '/almacen/ajustes-mermas' },
      { label: 'Máximos y mínimos', path: '/almacen/min-max' },
      { label: 'Lotes', path: '/almacen/lotes' },
      { label: 'Almacenes', path: '/almacen/almacenes' },
    ],
  },

  // ── Finanzas (Fiscal · ámbar) ──
  {
    label: 'Finanzas',
    icon: DollarSign,
    path: '/finanzas',
    highlight: 'amber',
    children: [
      { label: 'Aplicar pagos clientes', path: '/finanzas/aplicar-pagos' },
      { label: 'Gastos', path: '/finanzas/gastos' },
      { label: 'Saldos iniciales', path: '/configuracion/saldos-iniciales' },
    ],
  },

  // ── Reportes ──
  {
    label: 'Reportes',
    icon: BarChart3,
    path: '/reportes',
    children: [
      { label: 'Generales', path: '/reportes' },
      { label: 'Personalizados', path: '/reportes/personalizados' },
      { label: 'Control', path: '/control' },
    ],
  },

  // ── Canales (Integraciones con clientes · teal) ──
  {
    label: 'Canales',
    icon: Smartphone,
    path: '/configuracion/tienda',
    highlight: 'teal',
    children: [
      { label: 'Tienda en línea 🛒', path: '/configuracion/tienda' },
      { label: 'WhatsApp', path: '/configuracion/whatsapp' },
      { label: 'Bot WhatsApp ✨', path: '/configuracion/wa-bot' },
    ],
  },

  {
    label: 'Facturación',
    icon: FileText,
    path: '/facturacion-cfdi',
    highlight: 'amber',
    children: [
      { label: 'Facturas', path: '/facturacion-cfdi' },
      { label: 'Complementos de Pago', path: '/facturacion-cfdi/avanzado/pagos' },
      { label: 'Factura Global', path: '/facturacion-cfdi/avanzado/global' },
      { label: 'Descarga Masiva', path: '/facturacion-cfdi/avanzado/masiva' },
      { label: 'Reenvío por Correo', path: '/facturacion-cfdi/avanzado/correo' },
      { label: 'Validar RFC', path: '/facturacion-cfdi/avanzado/rfc' },
      { label: 'Sustituir CFDI', path: '/facturacion-cfdi/avanzado/sustituir' },
    ],
  },

  // ── Configuración (solo ajustes del sistema · violeta) ──
  {
    label: 'Configuración',
    icon: Settings,
    path: '/configuracion',
    highlight: 'violet',
    children: [
      { label: 'General', path: '/configuracion' },
    ],
  },

  {
    label: 'Administración',
    icon: Shield,
    path: '/administracion/usuarios',
    highlight: 'violet',
    children: [
      { label: 'Usuarios y permisos', path: '/administracion/usuarios' },
      { label: 'Mi suscripción', path: '/mi-suscripcion' },
    ],
  },

  // ── Ayuda (Soporte + material · cyan) ──
  {
    label: 'Ayuda',
    icon: LifeBuoy,
    path: '/soporte',
    highlight: 'cyan',
    children: [
      { label: 'Soporte', path: '/soporte' },
      { label: 'Tutoriales', path: '/tutoriales' },
      { label: 'Novedades ✨', path: '/actualizaciones' },
    ],
  },


];

const mobileBottomTabs = [
  { label: 'Inicio', icon: BarChart3, path: '/dashboard' },
  { label: 'Ventas', icon: ShoppingCart, path: '/ventas' },
  { label: 'Clientes', icon: Users, path: '/clientes' },
  { label: 'Almacén', icon: Warehouse, path: '/almacen/inventario' },
  { label: 'Ajustes', icon: Settings, path: '/configuracion' },
];

/** Filter nav items based on granular sub-module permissions */
function useFilteredNav(isSuperAdmin: boolean, hasModulo: (m: string) => boolean, userEmail?: string | null, isOwner?: boolean) {
  const isSuperAdminUser = isSuperAdminEmail(userEmail);
  const isBillingOwner = isSuperAdminUser || !!isOwner;
  const stripBilling = (items: NavItem[]): NavItem[] => items
    .flatMap(it => {
      // Top-level Facturación entry (with or without children): only super admin can see it
      if (it.path.startsWith('/facturacion-cfdi')) {
        return isSuperAdminUser ? [it] : [];
      }
      if (!it.children) return [it];
      const children = it.children.filter(c => {
        if (c.path === '/mi-suscripcion') return isBillingOwner;
        // Hide legacy CFDI children from other modules
        if (c.path.startsWith('/facturacion-cfdi')) return false;
        return true;
      });
      if (children.length === 0) return [];
      return [{ ...it, children }];
    });



  if (isSuperAdmin) return stripBilling(navItems);

  return stripBilling(navItems.reduce<NavItem[]>((acc, item) => {
    if (!item.children) {
      const modulo = PATH_MODULE_MAP[item.path] ?? '';
      if (hasModulo(modulo)) acc.push(item);
    } else {
      const visibleChildren = item.children.filter(child => {
        const modulo = PATH_MODULE_MAP[child.path] ?? '';
        return hasModulo(modulo);
      });
      if (visibleChildren.length > 0) {
        acc.push({ ...item, children: visibleChildren });
      }
    }
    return acc;
  }, []));
}

function FavStar({ path, label }: { path: string; label: string }) {
  const { isFavorite, add, remove } = useFavorites();
  const fav = isFavorite(path);
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (fav) remove(path); else add({ path, label });
      }}
      className={cn(
        "p-1 rounded transition-all shrink-0",
        fav
          ? "text-warning opacity-100"
          : "text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-warning"
      )}
      title={fav ? 'Quitar de favoritos' : 'Agregar a favoritos'}
    >
      <Star className="h-3 w-3" fill={fav ? 'currentColor' : 'none'} />
    </button>
  );
}

function SidebarItem({ item, collapsed, onNavigate, forceOpen }: { item: NavItem; collapsed: boolean; onNavigate?: () => void; forceOpen?: boolean }) {
  const location = useLocation();
  const basePath = item.path.split('?')[0];
  const isActive = location.pathname === basePath || location.pathname.startsWith(basePath + '/');
  const [openState, setOpen] = useState(isActive);
  const open = forceOpen || openState;

  // Shared accent token map for grouped modules (left bar + tinted icon)
  const HL_TOKENS: Record<string, { bar: string; iconBg: string; iconText: string; hoverBg: string; activeText: string; idleText: string }> = {
    amber:  { bar: 'bg-warning',     iconBg: 'bg-warning/10',     iconText: 'text-warning',     hoverBg: 'hover:bg-warning/5',     activeText: 'text-warning font-semibold',     idleText: 'text-sidebar-foreground/80' },
    green:  { bar: 'bg-success',     iconBg: 'bg-success/10',     iconText: 'text-success',     hoverBg: 'hover:bg-success/5',     activeText: 'text-success font-semibold',     idleText: 'text-sidebar-foreground/80' },
    cyan:   { bar: 'bg-info',        iconBg: 'bg-info/10',        iconText: 'text-info',        hoverBg: 'hover:bg-info/5',        activeText: 'text-info font-semibold',        idleText: 'text-sidebar-foreground/80' },
    violet: { bar: 'bg-violet',      iconBg: 'bg-violet/10',      iconText: 'text-violet',      hoverBg: 'hover:bg-violet/5',      activeText: 'text-violet font-semibold',      idleText: 'text-sidebar-foreground/80' },
    teal:   { bar: 'bg-teal',        iconBg: 'bg-teal/10',        iconText: 'text-teal',        hoverBg: 'hover:bg-teal/5',        activeText: 'text-teal font-semibold',        idleText: 'text-sidebar-foreground/80' },
    pink:   { bar: 'bg-pink',        iconBg: 'bg-pink/10',        iconText: 'text-pink',        hoverBg: 'hover:bg-pink/5',        activeText: 'text-pink font-semibold',        idleText: 'text-sidebar-foreground/80' },
  };
  const hl = item.highlight ? HL_TOKENS[item.highlight] : null;

  if (!item.children) {
    return (
      <div className="group relative flex items-center">
        {hl && !collapsed && (
          <div className={cn("absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full", hl.bar)} />
        )}
        <Link
          to={item.path}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all flex-1 min-w-0",
            collapsed ? "justify-center px-2" : hl ? "ml-1" : "",
            isActive
              ? hl
                ? cn(hl.activeText, hl.hoverBg)
                : "bg-primary/10 text-primary font-semibold"
              : hl
                ? cn(hl.idleText, hl.hoverBg)
                : item.accent
                  ? "text-primary/80 hover:bg-primary/5 hover:text-primary"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground"
          )}
          title={collapsed ? item.label : undefined}
        >
          {hl ? (
            <span className={cn("p-1 rounded-md shrink-0", hl.iconBg)}>
              <item.icon className={cn("h-3.5 w-3.5", hl.iconText)} />
            </span>
          ) : (
            <item.icon className={cn(
              "h-4 w-4 shrink-0",
              item.accent && !isActive && "text-primary/70",
            )} />
          )}
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
        {!collapsed && item.path !== '/favoritos' && (
          <div className="absolute right-2">
            <FavStar path={item.path} label={item.label} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {hl && !collapsed && (
        <div className={cn("absolute left-0 top-1 bottom-1 w-[3px] rounded-r-full", hl.bar)} />
      )}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all",
          collapsed ? "justify-center px-2" : hl ? "ml-1" : "",
          isActive
            ? hl
              ? cn(hl.activeText, hl.hoverBg)
              : "text-primary font-semibold"
            : hl
              ? cn(hl.idleText, hl.hoverBg)
              : "text-sidebar-foreground/80 hover:bg-sidebar-hover hover:text-sidebar-foreground"
        )}
        title={collapsed ? item.label : undefined}
      >
        {hl ? (
          <span className={cn("p-1 rounded-md shrink-0", hl.iconBg)}>
            <item.icon className={cn("h-3.5 w-3.5", hl.iconText)} />
          </span>
        ) : (
          <item.icon className="h-4 w-4 shrink-0" />
        )}
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            <ChevronDown className={cn("h-3 w-3 transition-transform opacity-50", open ? "" : "-rotate-90")} />
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className={cn("ml-[22px] pl-3 border-l mt-0.5", hl ? "border-current/20" : "border-sidebar-border/60")}>
          {item.children!.map(child => {
            const childPath = child.path.split('?')[0];
            const childActive = location.pathname === childPath ||
              (location.pathname + location.search === child.path) ||
              (child.path.includes('?tab=') && location.pathname === basePath && child.path.includes('tab=productos') && !location.search);
            const isPlaceholder = child.label === 'Sin favoritos aún';
            return (
              <div key={child.path} className="group relative flex items-center">
                {isPlaceholder ? (
                  <div className="block px-2 py-1 text-[12px] flex-1 min-w-0 whitespace-normal break-words text-sidebar-foreground/40 italic">
                    {child.label}
                  </div>
                ) : (
                  <>
                    <Link
                      to={child.path}
                      onClick={onNavigate}
                      className={cn(
                        "block px-2 py-1 text-[12px] transition-colors flex-1 min-w-0 whitespace-normal break-words leading-snug pr-7 rounded",
                        childActive
                          ? hl ? hl.activeText : "text-primary font-semibold"
                          : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      )}
                    >
                      {child.label}
                    </Link>
                    <div className="absolute right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <FavStar path={child.path} label={child.label} />
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BREADCRUMB_LABELS: Record<string, string> = {
  productos: 'Productos', tarifas: 'Listas de Precios', 'listas-precio': 'Listas de Precios',
  'precios-comisiones': 'Precios y Comisiones',
  clientes: 'Clientes', dashboard: 'Dashboard', ventas: 'Ventas', almacen: 'Almacén',
  finanzas: 'Finanzas', reportes: 'Reportes', nuevo: 'Nuevo', nueva: 'Nueva',
  demanda: 'Demanda', entregas: 'Entregas', 'reporte-entregas': 'Reporte entregas',
  inventario: 'Inventario', cobranza: 'Cobranza', rutas: 'Rutas', cargas: 'Cargas',
  compras: 'Compras', lotes: 'Lotes', almacenes: 'Almacenes', gastos: 'Gastos',
  'por-cobrar': 'Cuentas por cobrar', 'por-pagar': 'Cuentas por pagar',
  'aplicar-pagos': 'Aplicar pagos', 'aplicar-pagos-proveedor': 'Aplicar pagos proveedor',
  'pagos-proveedores': 'Pagos proveedores',
  'saldos-cliente': 'Saldos por cliente', 'saldos-proveedor': 'Saldos por proveedor',
  configuracion: 'Configuración', 'configuracion-inicial': 'Config. inicial',
  descargas: 'Liquidar Ruta', usuarios: 'Usuarios y permisos', whatsapp: 'WhatsApp',
  'mapa-clientes': 'Mapa de clientes', 'mapa-ventas': 'Mapa de entregas',
  logistica: 'Logística', 'pedidos-pendientes': 'Pedidos pendientes',
  asignacion: 'Asignación', quiebres: 'Quiebres', 'orden-carga': 'Orden de carga',
  'facturacion-cfdi': 'Facturación', devoluciones: 'Devoluciones',
  comisiones: 'Comisiones', control: 'Control', proveedores: 'Proveedores',
  catalogos: 'Catálogos', clasificaciones: 'Clasificaciones', zonas: 'Zonas',
  cobradores: 'Cobradores', 'reporte-diario': 'Reporte diario',
  promociones: 'Promociones', pos: 'Punto de venta',
  conteos: 'Conteos físicos', auditorias: 'Auditorías', traspasos: 'Traspasos',
  'ajustes-inventario': 'Ajustes de inventario', supervisor: 'Supervisor',
  'mi-suscripcion': 'Mi suscripción', 'monitor-rutas': 'Monitor de rutas',
  'estado-cuenta': 'Estado de cuenta', 'catalogo-publico': 'Catálogo público',
  'conteo-fisico': 'Conteo físico',
};

function isVentaFormPath(pathname: string) {
  const segments = pathname.split('/').filter(Boolean);
  return segments.length === 2
    && segments[0] === 'ventas'
    && (segments[1] === 'nuevo' || UUID_RE.test(segments[1]));
}

function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split('/').filter(Boolean);

  if (segments.length === 0 || isVentaFormPath(location.pathname) || location.pathname === '/ventas') return null;

  return (
    <div className="h-9 flex items-center px-5 bg-card border-b border-border text-xs text-muted-foreground overflow-x-auto">
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        {segments.map((seg, i) => {
          const isLast = i === segments.length - 1;
          const isUuid = UUID_RE.test(seg);
          const label = isUuid ? 'Detalle' : (BREADCRUMB_LABELS[seg] || seg.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
          const path = '/' + segments.slice(0, i + 1).join('/');
          return (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-muted-foreground/40">/</span>}
              {isLast ? (
                <span className="text-foreground font-semibold">{label}</span>
              ) : (
                <Link to={path} className="hover:text-foreground transition-colors">{label}</Link>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function SidebarNav({ collapsed, onNavigate, visibleNavItems, isSuperAdmin, setupComplete, onOpenPalette }: {
  collapsed: boolean;
  onNavigate?: () => void;
  visibleNavItems: NavItem[];
  isSuperAdmin: boolean;
  setupComplete: boolean | undefined;
  onOpenPalette?: () => void;
}) {
  const location = useLocation();
  const setupActive = location.pathname === '/configuracion-inicial';
  const [query, setQuery] = useState('');

  const filteredItems = useMemo(() => {
    if (!query.trim()) return visibleNavItems;
    const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const out: NavItem[] = [];
    for (const item of visibleNavItems) {
      const labelMatch = item.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q);
      if (!item.children) {
        if (labelMatch) out.push(item);
        continue;
      }
      const matchedChildren = item.children.filter(c =>
        c.label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(q)
      );
      if (labelMatch || matchedChildren.length > 0) {
        out.push({ ...item, children: labelMatch ? item.children : matchedChildren });
      }
    }
    return out;
  }, [visibleNavItems, query]);

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto py-3 px-2 space-y-0.5">
      {!collapsed && (
        <div className="px-1 mb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Buscar vistas..."
              className="w-full h-8 pl-8 pr-6 rounded-md bg-sidebar-hover border border-sidebar-border/40 text-[12px] text-sidebar-foreground placeholder:text-sidebar-foreground/40 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-sidebar-foreground/40 hover:text-sidebar-foreground"
              >
                <span className="text-[10px]">×</span>
              </button>
            )}
          </div>
        </div>
      )}
      {collapsed && onOpenPalette && (
        <div className="px-1 mb-2 flex justify-center">
          <button
            onClick={onOpenPalette}
            className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
            title="Buscar vistas (⌘K)"
          >
            <Search className="h-4 w-4" />
          </button>
        </div>
      )}
      {setupComplete === false && (
        <Link
          to="/configuracion-inicial"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all mb-1",
            collapsed ? "justify-center px-2" : "",
            setupActive
              ? "bg-primary/10 text-primary font-semibold"
              : "text-primary/80 hover:bg-primary/5 hover:text-primary"
          )}
          title={collapsed ? 'Configuración inicial' : undefined}
        >
          <Sparkles className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Configuración inicial</span>}
        </Link>
      )}
      {filteredItems.map(item => (
        <div key={item.path}>
          {item.label === 'Configuración' && !query.trim() && (
            <div className="my-2 border-t border-sidebar-border/40" />
          )}
          <SidebarItem item={item} collapsed={collapsed} onNavigate={onNavigate} forceOpen={!!query.trim() && !!item.children} />
        </div>
      ))}
      {filteredItems.length === 0 && query.trim() && !collapsed && (
        <div className="px-3 py-6 text-center text-[11px] text-sidebar-foreground/40">
          No se encontraron vistas
        </div>
      )}
      {isSuperAdmin && (
        <Link
          to="/super-admin"
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all mt-2 border-t border-sidebar-border/30 pt-3",
            collapsed ? "justify-center px-2" : "",
            "text-amber-500 hover:bg-sidebar-hover"
          )}
          title={collapsed ? 'Panel Master' : undefined}
        >
          <Shield className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Panel Master</span>}
        </Link>
      )}
    </nav>
  );
}


const DemoWelcomeDialog = lazy(() => import('@/components/DemoWelcomeDialog'));

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [swUpdateAvailable, setSwUpdateAvailable] = useState(false);
  const [showDemoWelcome, setShowDemoWelcome] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { empresa, profile, signOut, user } = useAuth();
  const { theme, setTheme } = useTheme();
  const { isSuperAdmin } = useSubscription();
  const { data: setupComplete } = useSetupComplete();
  const { hasModulo, loading: permisosLoading } = usePermisos();
  const isMobile = useIsMobile();
  const location = useLocation();
  const isVentaForm = isVentaFormPath(location.pathname);
  useProductosRealtime();
  useFeatureFlags();

  useEffect(() => {
    if (sessionStorage.getItem('demo_welcome') === '1') {
      sessionStorage.removeItem('demo_welcome');
      setShowDemoWelcome(true);
    }
  }, []);

  useEffect(() => {
    const handler = () => setSwUpdateAvailable(true);
    window.addEventListener('uniline:sw-update-available', handler);
    return () => window.removeEventListener('uniline:sw-update-available', handler);
  }, []);

  const applySwUpdate = async () => {
    const t = toast.loading('Actualizando versión…');
    try {
      setSwUpdateAvailable(false);
      toast.success('Recargando versión nueva…', { id: t });
      await refreshAppVersion();
    } catch (err) {
      console.error('[sync] applySwUpdate error', err);
      toast.error('Recargando app…', { id: t });
      setTimeout(() => window.location.reload(), 500);
    }
  };

  const baseVisibleNavItems = useFilteredNav(isSuperAdmin, hasModulo, user?.email, !!empresa?.owner_user_id && empresa.owner_user_id === user?.id);
  const { favorites } = useFavorites();

  // Inject Favoritos as a dynamic module right after Dashboard with user favorites as children
  const visibleNavItems = useMemo(() => {
    const favItem: NavItem = {
      label: 'Favoritos',
      icon: Star,
      path: '/favoritos',
      highlight: 'amber',
      children: favorites.length > 0
        ? favorites.map(f => ({ label: f.label, path: f.path }))
        : [{ label: 'Sin favoritos aún', path: '/favoritos' }],
    };
    const dashIdx = baseVisibleNavItems.findIndex(i => i.path === '/dashboard');
    const insertAt = dashIdx >= 0 ? dashIdx + 1 : 0;
    // Lotes solo se muestra si la empresa tiene el módulo de lotes activado.
    const manejaLotes = !!(empresa as any)?.maneja_lotes;
    const withLoteGate = baseVisibleNavItems.map(it => {
      if (!it.children) return it;
      const children = it.children.filter(c => c.path !== '/almacen/lotes' || manejaLotes);
      return { ...it, children };
    });
    return [
      ...withLoteGate.slice(0, insertAt),
      favItem,
      ...withLoteGate.slice(insertAt),
    ];
  }, [baseVisibleNavItems, favorites, (empresa as any)?.maneja_lotes]);

  const closeMobile = () => setMobileOpen(false);

  // Mobile layout with hamburger
  if (isMobile) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-background">
        <SandboxBanner />
        <NotificationRuntime bannersOnly />
        {/* Mobile top bar */}
        <header className="min-h-14 flex items-center justify-between px-3 bg-card border-b border-border shrink-0 safe-area-top">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <button className="p-2 rounded-md text-foreground hover:bg-accent transition-colors">
                  <Menu className="h-5 w-5" />
                </button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0 bg-sidebar border-sidebar-border flex flex-col h-full gap-0">
                <div className="h-14 flex items-center px-4 border-b border-sidebar-border/30 shrink-0">
                  <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-7 w-7 rounded object-contain" />
                  <span className="text-[18px] font-black text-primary tracking-tight">Rutapp</span>
                </div>
                <div className="flex-1 min-h-0 overflow-y-auto">
                  <SidebarNav
                    collapsed={false}
                    onNavigate={closeMobile}
                    visibleNavItems={visibleNavItems}
                    isSuperAdmin={isSuperAdmin}
                    setupComplete={setupComplete}
                    onOpenPalette={() => setPaletteOpen(true)}
                  />
                </div>
                <div className="border-t border-sidebar-border/30 p-2.5 shrink-0 safe-area-bottom">
                  <Link
                    to="/perfil"
                    onClick={closeMobile}
                    className="block px-2 py-2 mb-1 rounded-md hover:bg-sidebar-hover transition-colors"
                  >
                    <div className="text-[12px] font-semibold text-sidebar-foreground truncate">{profile?.nombre ?? 'Usuario'}</div>
                    <div className="text-[11px] text-sidebar-foreground/50 truncate">{empresa?.nombre ?? 'Mi Empresa'}</div>
                    <div className="text-[10px] text-sidebar-foreground/40 truncate mt-0.5">v{APP_VERSION} · {APP_BUILD_DATE}</div>
                  </Link>
                  <div className="flex gap-0.5">
                    <button
                      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                      className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                      title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
                    >
                      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                    </button>
                    <Link
                      to="/ruta"
                      onClick={closeMobile}
                      className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                      title="Vista vendedor (móvil)"
                    >
                      <Smartphone className="h-4 w-4" />
                    </Link>
                    <button
                      onClick={signOut}
                      className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
                      title="Cerrar sesión"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-6 w-6 rounded object-contain" />
            <span className="text-[16px] font-black text-primary tracking-tight">Rutapp</span>
          </div>
          <div className="flex items-center gap-1">
            <TiendaOrdersBell />
            <button
              onClick={() => setPaletteOpen(true)}
              className="p-2 rounded-md text-foreground/70 hover:text-foreground transition-colors"
              title="Buscar (⌘K)"
            >
              <Search className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={applySwUpdate}
              className={cn(
                "p-2 rounded-md transition-colors",
                swUpdateAvailable
                  ? "text-primary animate-pulse hover:text-primary/80"
                  : "text-foreground/70 hover:text-foreground"
              )}
              title="Actualizar app"
            >
              <RefreshCw className="h-[18px] w-[18px]" />
            </button>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md text-foreground/70 hover:text-foreground transition-colors"
            >
              {theme === 'dark' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
            </button>
          </div>
        </header>

        <SuperAdminEmpresaSelector />
        <Breadcrumb />
        <main className="flex-1 overflow-auto" style={{ paddingBottom: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))' }}>
          {children}
        </main>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
        <PublicidadPopup />
        <BroadcastAnnouncementModal />

        {/* Bottom navigation – app style */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom">
          <div className="flex items-center justify-around h-14">
            {mobileBottomTabs.map(tab => {
              const active = location.pathname === tab.path || location.pathname.startsWith(tab.path + '/');
              return (
                <Link
                  key={tab.path}
                  to={tab.path}
                  className={cn(
                    "flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors",
                    active ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  <tab.icon className="h-5 w-5" />
                  <span className="text-[10px] font-medium">{tab.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
        <NotificationRuntime overlaysOnly />
        <PendingInvoiceModal />
        <Suspense fallback={null}>
          <DemoWelcomeDialog open={showDemoWelcome} onClose={() => setShowDemoWelcome(false)} />
        </Suspense>
      </div>
    );
  }

  // Desktop layout with sidebar
  return (
    <div className="flex-1 min-h-0 h-full overflow-hidden flex flex-col bg-background">
      <SandboxBanner />
      <NotificationRuntime bannersOnly />
      <div className="flex-1 flex min-h-0">
      <aside
        className={cn(
          "h-full shrink-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200 overflow-hidden",
          collapsed ? "w-[52px]" : "w-56"
        )}
      >
        <div className={cn(
          "h-14 flex items-center shrink-0 border-b border-sidebar-border/30",
          collapsed ? "justify-center px-2" : "px-4"
        )}>
          {collapsed ? (
            <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="R" className="h-7 w-7 rounded object-contain" />
          ) : (
            <div className="flex items-center gap-2">
              <img src="https://res.cloudinary.com/dstcnsu6a/image/upload/v1774544059/Imagen_p4jkid.png" alt="Rutapp" className="h-7 w-7 rounded object-contain" />
              <span className="text-[18px] font-black text-primary tracking-tight">Rutapp</span>
            </div>
          )}
        </div>

        <SidebarNav
          collapsed={collapsed}
          visibleNavItems={visibleNavItems}
          isSuperAdmin={isSuperAdmin}
          setupComplete={setupComplete}
          onOpenPalette={() => setPaletteOpen(true)}
        />

        <div className="border-t border-sidebar-border/30 p-2.5">
          {!collapsed && (
            <Link
              to="/perfil"
              className="block px-2 py-2 mb-1 rounded-md hover:bg-sidebar-hover transition-colors"
              title="Mi perfil"
            >
              <div className="text-[12px] font-semibold text-sidebar-foreground truncate">{profile?.nombre ?? 'Usuario'}</div>
              <div className="text-[11px] text-sidebar-foreground/50 truncate">{empresa?.nombre ?? 'Mi Empresa'}</div>
              <div className="text-[10px] text-sidebar-foreground/40 truncate mt-0.5">v{APP_VERSION} · {APP_BUILD_DATE}</div>
            </Link>
          )}
          <div className={cn("flex gap-0.5", collapsed ? "flex-col items-center" : "")}>
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <Link
              to="/ruta"
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title="Vista vendedor (móvil)"
            >
              <Smartphone className="h-4 w-4" />
            </Link>
            <button
              onClick={applySwUpdate}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title="Actualizar app"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCollapsed(!collapsed)}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title={collapsed ? 'Expandir' : 'Colapsar'}
            >
              {collapsed ? <PanelLeft className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-hover transition-all"
              title="Cerrar sesión"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 border-b border-border bg-card min-h-10">
          <div className="flex-1 min-w-0"><SuperAdminEmpresaSelector /></div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={applySwUpdate}
              className={cn(
                "hidden md:flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium transition-colors shadow-sm",
                "bg-primary text-primary-foreground hover:bg-primary/90",
                swUpdateAvailable && "animate-pulse shadow-primary/30 shadow-md"
              )}
              title="Sincronizar y limpiar caché"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Sincronizar
            </button>
            <TiendaOrdersBell />
            <InternalNotificationBell />
            <BroadcastBell />
            <CommandPaletteButton onClick={() => setPaletteOpen(true)} />
          </div>
        </div>
        <div className="shrink-0"><Breadcrumb /></div>
        <main className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </main>
        {!isVentaForm && <div className="shrink-0"><UnilineFooter /></div>}
      </div>
      </div>
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <NotificationRuntime overlaysOnly />
      <PendingInvoiceModal />
      <PublicidadPopup />
      <BroadcastAnnouncementModal />
      <Suspense fallback={null}>
        <DemoWelcomeDialog open={showDemoWelcome} onClose={() => setShowDemoWelcome(false)} />
      </Suspense>
      <Suspense fallback={null}>
        <FloatingSoporteChat />
      </Suspense>
    </div>
  );
}
