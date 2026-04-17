import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Command } from 'cmdk';
import {
  ShoppingCart, Package, Users, Truck, Receipt, Wallet,
  ArrowRightLeft, Sliders, UserCog, Warehouse, Tag, FileText,
  ArrowRight, Loader2, Search, ClipboardList, Compass,
  BarChart3, MapPin, Settings, Smartphone, ShieldAlert, PlayCircle, DollarSign,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useDebounce } from '@/hooks/useDebounce';
import { fmtCurrency, fmtDate } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResultItem {
  id: string;
  group: string;
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  hint?: string;
  to: string;
}

const GROUP_ORDER = [
  'Ir a', 'Ventas', 'Pedidos', 'Clientes', 'Productos', 'Proveedores',
  'Compras', 'Traspasos', 'Ajustes', 'Gastos', 'Cobros',
  'CFDI', 'Almacenes', 'Listas de Precios', 'Empleados',
];

// Static menu / views index — always searchable, even without backend hits
const MENU_ITEMS: { title: string; subtitle?: string; to: string; icon: React.ElementType; keywords?: string }[] = [
  { title: 'Dashboard', to: '/dashboard', icon: BarChart3, keywords: 'inicio home resumen' },
  { title: 'Punto de venta', to: '/pos', icon: ShoppingCart, keywords: 'pos caja venta rapida' },
  { title: 'App Móvil', to: '/ruta', icon: Smartphone, keywords: 'ruta movil vendedor' },
  { title: 'Clientes', to: '/clientes', icon: Users, keywords: 'clientes cartera' },
  { title: 'Productos', to: '/productos', icon: Package, keywords: 'productos articulos catalogo' },
  { title: 'Listas de Precios', to: '/listas-precio', icon: Tag, keywords: 'tarifas precios' },
  // Ventas
  { title: 'Ventas', subtitle: 'Todas las ventas', to: '/ventas', icon: Receipt },
  { title: 'Cobranza', subtitle: 'Ventas', to: '/ventas/cobranza', icon: Wallet },
  { title: 'Promociones', subtitle: 'Ventas', to: '/ventas/promociones', icon: Tag },
  { title: 'Reporte diario', subtitle: 'Ventas', to: '/ventas/reporte-diario', icon: BarChart3 },
  { title: 'Devoluciones', subtitle: 'Ventas', to: '/ventas/devoluciones', icon: ArrowRightLeft },
  { title: 'Liquidar Ruta', subtitle: 'Ventas', to: '/almacen/descargas', icon: Truck },
  // Logística
  { title: 'Logística', subtitle: 'Dashboard', to: '/logistica/dashboard', icon: MapPin },
  { title: 'Pedidos pendientes', subtitle: 'Logística', to: '/logistica/pedidos', icon: ClipboardList },
  { title: 'Entregas', subtitle: 'Logística', to: '/logistica/entregas', icon: Truck },
  { title: 'Mapa de clientes', subtitle: 'Logística', to: '/ventas/mapa-clientes', icon: MapPin },
  { title: 'Mapa de entregas', subtitle: 'Logística', to: '/ventas/mapa-ventas', icon: MapPin },
  // Almacén
  { title: 'Inventario', subtitle: 'Almacén', to: '/almacen/inventario', icon: Warehouse, keywords: 'almacen stock existencias' },
  { title: 'Traspasos', subtitle: 'Almacén', to: '/almacen/traspasos', icon: ArrowRightLeft },
  { title: 'Ajustes de inventario', subtitle: 'Almacén', to: '/almacen/ajustes', icon: Sliders },
  { title: 'Auditorías', subtitle: 'Almacén', to: '/almacen/auditorias', icon: ShieldAlert },
  { title: 'Conteos físicos', subtitle: 'Almacén', to: '/almacen/conteos', icon: ClipboardList },
  { title: 'Compras', subtitle: 'Almacén', to: '/almacen/compras', icon: ShoppingCart },
  { title: 'Almacenes', subtitle: 'Almacén', to: '/almacen/almacenes', icon: Warehouse },
  // Catálogo
  { title: 'Proveedores', subtitle: 'Catálogo', to: '/proveedores', icon: Truck },
  // Finanzas
  { title: 'Cuentas por cobrar', subtitle: 'Finanzas', to: '/finanzas/por-cobrar', icon: DollarSign, keywords: 'cxc' },
  { title: 'Aplicar pagos clientes', subtitle: 'Finanzas', to: '/finanzas/aplicar-pagos', icon: Wallet },
  { title: 'Cuentas por pagar', subtitle: 'Finanzas', to: '/finanzas/por-pagar', icon: DollarSign, keywords: 'cxp' },
  { title: 'Pagos proveedores', subtitle: 'Finanzas', to: '/finanzas/pagos-proveedores', icon: Wallet },
  { title: 'Saldos por cliente', subtitle: 'Finanzas', to: '/finanzas/saldos-cliente', icon: DollarSign },
  { title: 'Saldos por proveedor', subtitle: 'Finanzas', to: '/finanzas/saldos-proveedor', icon: DollarSign },
  { title: 'Gastos', subtitle: 'Finanzas', to: '/finanzas/gastos', icon: Wallet },
  { title: 'Comisiones', subtitle: 'Finanzas', to: '/finanzas/comisiones', icon: DollarSign },
  // Reportes & Facturación
  { title: 'Reportes', to: '/reportes', icon: BarChart3 },
  { title: 'Reporte de entregas', subtitle: 'Reportes', to: '/reportes/entregas', icon: BarChart3 },
  { title: 'Facturas CFDI', subtitle: 'Facturación', to: '/facturacion-cfdi', icon: FileText },
  { title: 'Catálogos SAT', subtitle: 'Facturación', to: '/facturacion-cfdi/catalogos', icon: FileText },
  // Admin
  { title: 'Supervisor', to: '/supervisor', icon: BarChart3 },
  { title: 'Control', to: '/control', icon: ShieldAlert, keywords: 'auditoria fraude' },
  { title: 'Usuarios y permisos', to: '/configuracion/usuarios', icon: UserCog },
  { title: 'Tutoriales', to: '/tutoriales', icon: PlayCircle, keywords: 'videos ayuda' },
  { title: 'Configuración general', to: '/configuracion', icon: Settings },
  { title: 'WhatsApp', subtitle: 'Configuración', to: '/configuracion/whatsapp', icon: Settings },
  { title: 'Saldos iniciales', subtitle: 'Configuración', to: '/configuracion/saldos-iniciales', icon: Settings },
  { title: 'Mi suscripción', to: '/mi-suscripcion', icon: Settings },
];

function normalize(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function CommandPalette({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const debounced = useDebounce(query, 220);

  useEffect(() => {
    if (!open) { setQuery(''); setResults([]); }
  }, [open]);

  useEffect(() => {
    const q = debounced.trim();
    // Always compute menu matches (works even without empresaId / no backend hits)
    const nq = normalize(q);
    const menuMatches: ResultItem[] = q.length >= 1
      ? MENU_ITEMS
          .filter(m => normalize(m.title + ' ' + (m.subtitle ?? '') + ' ' + (m.keywords ?? '')).includes(nq))
          .slice(0, 10)
          .map((m, i) => ({
            id: `menu-${i}-${m.to}`,
            group: 'Ir a',
            icon: m.icon,
            title: m.title,
            subtitle: m.subtitle,
            to: m.to,
          }))
      : [];

    if (!empresaId) { setResults(menuMatches); setLoading(false); return; }
    if (q.length < 2) { setResults(menuMatches); setLoading(false); return; }
    const term = `%${q}%`;
    let cancelled = false;
    setLoading(true);

    // Helper: search ventas by folio, related client name, or vendedor name
    const ventasByFolio = supabase.from('ventas').select('id,folio,total,fecha,tipo,clientes(nombre),vendedores:profiles!vendedor_id(nombre)')
      .eq('empresa_id', empresaId).ilike('folio', term).limit(5);
    const ventasByCliente = supabase.from('ventas').select('id,folio,total,fecha,tipo,clientes!inner(nombre),vendedores:profiles!vendedor_id(nombre)')
      .eq('empresa_id', empresaId).ilike('clientes.nombre', term).limit(5);
    const ventasByVendedor = supabase.from('ventas').select('id,folio,total,fecha,tipo,clientes(nombre),vendedores:profiles!vendedor_id(nombre)')
      .eq('empresa_id', empresaId).ilike('vendedores.nombre', term).limit(5).not('vendedor_id', 'is', null);

    Promise.all([
      ventasByFolio,
      ventasByCliente,
      ventasByVendedor,
      // Clientes
      supabase.from('clientes').select('id,nombre,codigo,telefono,rfc')
        .eq('empresa_id', empresaId).or(`nombre.ilike.${term},codigo.ilike.${term},telefono.ilike.${term},rfc.ilike.${term}`).limit(5),
      // Productos
      supabase.from('productos').select('id,nombre,codigo,clave_alterna,precio_principal')
        .eq('empresa_id', empresaId).or(`nombre.ilike.${term},codigo.ilike.${term},clave_alterna.ilike.${term}`).limit(5),
      // Proveedores
      supabase.from('proveedores').select('id,nombre,rfc,telefono')
        .eq('empresa_id', empresaId).or(`nombre.ilike.${term},rfc.ilike.${term},telefono.ilike.${term}`).limit(5),
      // Compras
      supabase.from('compras').select('id,folio,total,fecha,proveedores(nombre)')
        .eq('empresa_id', empresaId).or(`folio.ilike.${term}`).limit(5),
      // Traspasos
      supabase.from('traspasos').select('id,folio,fecha,status')
        .eq('empresa_id', empresaId).or(`folio.ilike.${term}`).limit(5),
      // Ajustes
      supabase.from('ajustes_inventario').select('id,fecha,motivo,productos(nombre,codigo)')
        .eq('empresa_id', empresaId).or(`motivo.ilike.${term}`).limit(5),
      // Gastos
      supabase.from('gastos').select('id,concepto,monto,fecha')
        .eq('empresa_id', empresaId).or(`concepto.ilike.${term}`).limit(5),
      // Cobros (search by metodo_pago, referencia, notas, or cliente)
      supabase.from('cobros').select('id,metodo_pago,monto,fecha,referencia,clientes!inner(nombre)')
        .eq('empresa_id', empresaId)
        .or(`metodo_pago.ilike.${term},referencia.ilike.${term},notas.ilike.${term}`)
        .limit(5),
      supabase.from('cobros').select('id,metodo_pago,monto,fecha,referencia,clientes!inner(nombre)')
        .eq('empresa_id', empresaId).ilike('clientes.nombre', term).limit(5),
      // CFDI
      supabase.from('cfdis').select('id,folio,folio_fiscal,total,fecha_timbrado,receiver_name')
        .eq('empresa_id', empresaId).or(`folio.ilike.${term},folio_fiscal.ilike.${term},receiver_name.ilike.${term}`).limit(5),
      // Almacenes
      supabase.from('almacenes').select('id,nombre,tipo')
        .eq('empresa_id', empresaId).ilike('nombre', term).limit(5),
      // Listas de Precios (tarifas)
      supabase.from('tarifas').select('id,nombre,tipo')
        .eq('empresa_id', empresaId).ilike('nombre', term).limit(5),
      // Empleados (profiles)
      supabase.from('profiles').select('id,nombre,telefono')
        .eq('empresa_id', empresaId).or(`nombre.ilike.${term},telefono.ilike.${term}`).limit(5),
      // Pedidos pendientes (entregas)
      supabase.from('entregas').select('id,folio,fecha,status,clientes(nombre)')
        .eq('empresa_id', empresaId).or(`folio.ilike.${term}`).limit(5),
    ]).then((rows) => {
      if (cancelled) return;
      const out: ResultItem[] = [];
      const [ventasFolio, ventasCli, ventasVend, clientes, productos, proveedores, compras, traspasos, ajustes, gastos, cobrosByMetodo, cobrosByCliente, cfdis, almacenes, tarifas, empleados, entregas] = rows;
      const cobros = { data: [...((cobrosByMetodo as any).data ?? []), ...((cobrosByCliente as any).data ?? [])] };
      const ventasMap = new Map<string, any>();
      [...(ventasFolio.data ?? []), ...(ventasCli.data ?? []), ...((ventasVend as any).data ?? [])].forEach((v: any) => ventasMap.set(v.id, v));
      const ventas = { data: Array.from(ventasMap.values()).slice(0, 10) };

      (ventas.data ?? []).forEach((v: any) => {
        const isPedido = v.tipo === 'pedido';
        const isSaldo = v.tipo === 'saldo_inicial';
        out.push({
          id: `v-${v.id}`,
          group: isPedido ? 'Pedidos' : 'Ventas',
          icon: isPedido ? Truck : Receipt,
          title: v.folio ?? 'Sin folio',
          subtitle: [v.clientes?.nombre, v.vendedores?.nombre ? `Vend: ${v.vendedores.nombre}` : null, isSaldo ? 'Saldo inicial' : null, fmtDate(v.fecha)].filter(Boolean).join(' · '),
          hint: fmtCurrency(v.total),
          to: `/ventas/${v.id}`,
        });
      });

      (entregas.data ?? []).forEach((e: any) => {
        out.push({
          id: `e-${e.id}`,
          group: 'Pedidos',
          icon: Truck,
          title: e.folio ?? 'Entrega',
          subtitle: [e.clientes?.nombre, e.status, fmtDate(e.fecha)].filter(Boolean).join(' · '),
          to: `/logistica/entregas/${e.id}`,
        });
      });

      (clientes.data ?? []).forEach((c: any) => {
        out.push({
          id: `c-${c.id}`,
          group: 'Clientes',
          icon: Users,
          title: c.nombre,
          subtitle: [c.codigo, c.telefono, c.rfc].filter(Boolean).join(' · '),
          to: `/clientes/${c.id}`,
        });
      });

      (productos.data ?? []).forEach((p: any) => {
        out.push({
          id: `p-${p.id}`,
          group: 'Productos',
          icon: Package,
          title: p.nombre,
          subtitle: [p.codigo, p.clave_alterna].filter(Boolean).join(' · '),
          hint: fmtCurrency(p.precio_principal),
          to: `/productos/${p.id}`,
        });
      });

      (proveedores.data ?? []).forEach((p: any) => {
        out.push({
          id: `pr-${p.id}`,
          group: 'Proveedores',
          icon: Truck,
          title: p.nombre,
          subtitle: [p.rfc, p.telefono].filter(Boolean).join(' · '),
          to: `/proveedores/${p.id}`,
        });
      });

      (compras.data ?? []).forEach((c: any) => {
        out.push({
          id: `co-${c.id}`,
          group: 'Compras',
          icon: ShoppingCart,
          title: c.folio ?? 'Compra',
          subtitle: [c.proveedores?.nombre, fmtDate(c.fecha)].filter(Boolean).join(' · '),
          hint: fmtCurrency(c.total),
          to: `/almacen/compras/${c.id}`,
        });
      });

      (traspasos.data ?? []).forEach((t: any) => {
        out.push({
          id: `t-${t.id}`,
          group: 'Traspasos',
          icon: ArrowRightLeft,
          title: t.folio ?? 'Traspaso',
          subtitle: [t.status, fmtDate(t.fecha)].filter(Boolean).join(' · '),
          to: `/almacen/traspasos/${t.id}`,
        });
      });

      (ajustes.data ?? []).forEach((a: any) => {
        out.push({
          id: `aj-${a.id}`,
          group: 'Ajustes',
          icon: Sliders,
          title: a.productos?.nombre ?? 'Ajuste',
          subtitle: [a.productos?.codigo, a.motivo, fmtDate(a.fecha)].filter(Boolean).join(' · '),
          to: `/almacen/ajustes`,
        });
      });

      (gastos.data ?? []).forEach((g: any) => {
        out.push({
          id: `g-${g.id}`,
          group: 'Gastos',
          icon: Wallet,
          title: g.concepto ?? 'Gasto',
          subtitle: fmtDate(g.fecha),
          hint: fmtCurrency(g.monto),
          to: `/finanzas/gastos?q=${encodeURIComponent(g.concepto ?? '')}`,
        });
      });

      const cobrosSeen = new Set<string>();
      (cobros.data ?? []).forEach((c: any) => {
        if (cobrosSeen.has(c.id)) return;
        cobrosSeen.add(c.id);
        out.push({
          id: `cb-${c.id}`,
          group: 'Cobros',
          icon: Wallet,
          title: c.metodo_pago ? c.metodo_pago.charAt(0).toUpperCase() + c.metodo_pago.slice(1) : 'Cobro',
          subtitle: [c.clientes?.nombre, c.referencia, fmtDate(c.fecha)].filter(Boolean).join(' · '),
          hint: fmtCurrency(c.monto),
          to: `/ventas/cobranza?cobro=${c.id}`,
        });
      });

      (cfdis.data ?? []).forEach((c: any) => {
        out.push({
          id: `cf-${c.id}`,
          group: 'CFDI',
          icon: FileText,
          title: c.folio ?? c.folio_fiscal?.slice(0, 8) ?? 'CFDI',
          subtitle: [c.receiver_name, fmtDate(c.fecha_timbrado)].filter(Boolean).join(' · '),
          hint: fmtCurrency(c.total),
          to: `/facturacion-cfdi/${c.id}`,
        });
      });

      (almacenes.data ?? []).forEach((a: any) => {
        out.push({
          id: `al-${a.id}`,
          group: 'Almacenes',
          icon: Warehouse,
          title: a.nombre,
          subtitle: a.tipo,
          to: `/almacen/almacenes`,
        });
      });

      (tarifas.data ?? []).forEach((t: any) => {
        out.push({
          id: `ta-${t.id}`,
          group: 'Listas de Precios',
          icon: Tag,
          title: t.nombre,
          subtitle: t.tipo,
          to: `/listas-precio`,
        });
      });

      (empleados.data ?? []).forEach((p: any) => {
        out.push({
          id: `em-${p.id}`,
          group: 'Empleados',
          icon: UserCog,
          title: p.nombre ?? 'Sin nombre',
          subtitle: p.telefono ?? undefined,
          to: `/configuracion/usuarios`,
        });
      });

      setResults([...menuMatches, ...out]);
      setLoading(false);
    }).catch(() => { if (!cancelled) { setResults(menuMatches); setLoading(false); } });

    return () => { cancelled = true; };
  }, [debounced, empresaId]);

  const grouped = useMemo(() => {
    const map = new Map<string, ResultItem[]>();
    for (const r of results) {
      if (!map.has(r.group)) map.set(r.group, []);
      map.get(r.group)!.push(r);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      const ai = GROUP_ORDER.indexOf(a); const bi = GROUP_ORDER.indexOf(b);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
  }, [results]);

  // Global ⌘K / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === 'Escape' && open) {
        onOpenChange(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const handleSelect = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] bg-background/60 backdrop-blur-sm flex items-start justify-center pt-[10vh] px-4 animate-in fade-in duration-150"
      onClick={() => onOpenChange(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[600px] bg-card border border-border rounded-xl shadow-2xl overflow-hidden animate-in slide-in-from-top-4 duration-200"
      >
        <Command shouldFilter={false} className="flex flex-col">
          <div className="flex items-center gap-2 px-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Command.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Buscar módulos, vistas o registros..."
              className="flex-1 h-12 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>

          <Command.List className="max-h-[60vh] overflow-y-auto p-2">
            {query.trim().length < 1 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Escribe para buscar módulos, vistas, ventas, clientes, productos…
              </div>
            )}
            {query.trim().length >= 1 && !loading && results.length === 0 && (
              <div className="py-12 text-center text-xs text-muted-foreground">
                Sin resultados para «{query}»
              </div>
            )}

            {grouped.map(([group, items]) => (
              <Command.Group
                key={group}
                heading={
                  <div className="px-2 pt-2 pb-1 text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
                    {group}
                  </div>
                }
              >
                {items.map(item => (
                  <Command.Item
                    key={item.id}
                    value={item.id}
                    onSelect={() => handleSelect(item.to)}
                    className={cn(
                      "flex items-center gap-3 px-2 py-2 rounded-md cursor-pointer text-xs",
                      "data-[selected=true]:bg-accent/10 data-[selected=true]:text-foreground"
                    )}
                  >
                    <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center shrink-0">
                      <item.icon className="h-4 w-4 text-foreground/70" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-foreground truncate">{item.title}</div>
                      {item.subtitle && (
                        <div className="text-[10px] text-muted-foreground truncate">{item.subtitle}</div>
                      )}
                    </div>
                    {item.hint && (
                      <div className="text-[11px] font-mono text-muted-foreground shrink-0">{item.hint}</div>
                    )}
                    <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>

          <div className="border-t border-border px-3 py-2 flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">↑↓</kbd>
              navegar
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">↵</kbd>
              abrir
            </span>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-muted border border-border font-mono">esc</kbd>
              cerrar
            </span>
            <span className="ml-auto flex items-center gap-1">
              <ClipboardList className="h-3 w-3" /> Búsqueda global
            </span>
          </div>
        </Command>
      </div>
    </div>
  );
}

/** Lightweight trigger button to embed in headers */
export function CommandPaletteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden md:flex items-center gap-2 h-8 px-2.5 rounded-md border border-border bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-xs min-w-[180px]"
    >
      <Search className="h-3.5 w-3.5" />
      <span className="flex-1 text-left">Buscar...</span>
      <kbd className="px-1.5 py-0.5 rounded bg-background border border-border font-mono text-[10px]">⌘K</kbd>
    </button>
  );
}
