import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Star, StarOff, Search, Plus, Trash2, ArrowRight } from 'lucide-react';
import { useFavorites } from '@/hooks/useFavorites';
import { usePermisos, PATH_MODULE_MAP } from '@/hooks/usePermisos';
import { useSubscription } from '@/hooks/useSubscription';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

// Catálogo plano de todas las vistas del sistema (label + path + grupo)
const ALL_VIEWS: { label: string; path: string; group: string }[] = [
  // Principal
  { label: 'Dashboard', path: '/dashboard', group: 'Principal' },
  { label: 'Supervisor', path: '/supervisor', group: 'Principal' },
  { label: 'Punto de venta', path: '/pos', group: 'Principal' },
  { label: 'App Móvil', path: '/ruta', group: 'Principal' },
  { label: 'Clientes', path: '/clientes', group: 'Principal' },
  { label: 'Productos', path: '/productos', group: 'Principal' },
  { label: 'Listas de Precios', path: '/listas-precio', group: 'Principal' },
  // Ventas
  { label: 'Todas las ventas', path: '/ventas', group: 'Ventas' },
  { label: 'Cobranza', path: '/ventas/cobranza', group: 'Ventas' },
  { label: 'Promociones', path: '/ventas/promociones', group: 'Ventas' },
  { label: 'Reporte diario', path: '/ventas/reporte-diario', group: 'Ventas' },
  { label: 'Devoluciones', path: '/ventas/devoluciones', group: 'Ventas' },
  { label: 'Liquidar Ruta', path: '/almacen/descargas', group: 'Ventas' },
  // Logística
  { label: 'Dashboard logística', path: '/logistica/dashboard', group: 'Logística' },
  { label: 'Pedidos pendientes', path: '/logistica/pedidos', group: 'Logística' },
  { label: 'Entregas', path: '/logistica/entregas', group: 'Logística' },
  { label: 'Jornadas de ruta', path: '/logistica/jornadas', group: 'Logística' },
  { label: 'Mapa de clientes', path: '/ventas/mapa-clientes', group: 'Logística' },
  { label: 'Mapa de entregas', path: '/ventas/mapa-ventas', group: 'Logística' },
  // Almacén
  { label: 'Inventario', path: '/almacen/inventario', group: 'Almacén' },
  { label: 'Traspasos', path: '/almacen/traspasos', group: 'Almacén' },
  { label: 'Ajustes', path: '/almacen/ajustes', group: 'Almacén' },
  { label: 'Auditorías', path: '/almacen/auditorias', group: 'Almacén' },
  { label: 'Conteos físicos', path: '/almacen/conteos', group: 'Almacén' },
  { label: 'Compras', path: '/almacen/compras', group: 'Almacén' },
  { label: 'Almacenes', path: '/almacen/almacenes', group: 'Almacén' },
  // Catálogo
  { label: 'Categorías', path: '/catalogos/clasificaciones', group: 'Catálogo' },
  { label: 'Marcas', path: '/catalogos/marcas', group: 'Catálogo' },
  { label: 'Proveedores', path: '/proveedores', group: 'Catálogo' },
  { label: 'Unidades', path: '/catalogos/unidades', group: 'Catálogo' },
  { label: 'Zonas', path: '/catalogos/zonas', group: 'Catálogo' },
  // Finanzas
  { label: 'Cuentas por cobrar', path: '/finanzas/por-cobrar', group: 'Finanzas' },
  { label: 'Aplicar pagos clientes', path: '/finanzas/aplicar-pagos', group: 'Finanzas' },
  { label: 'Cuentas por pagar', path: '/finanzas/por-pagar', group: 'Finanzas' },
  { label: 'Pagos proveedores', path: '/finanzas/pagos-proveedores', group: 'Finanzas' },
  { label: 'Saldos por cliente', path: '/finanzas/saldos-cliente', group: 'Finanzas' },
  { label: 'Saldos por proveedor', path: '/finanzas/saldos-proveedor', group: 'Finanzas' },
  { label: 'Gastos', path: '/finanzas/gastos', group: 'Finanzas' },
  { label: 'Comisiones', path: '/finanzas/comisiones', group: 'Finanzas' },
  // Reportes & Facturación
  { label: 'Reportes generales', path: '/reportes', group: 'Reportes' },
  { label: 'Reporte entregas', path: '/reportes/entregas', group: 'Reportes' },
  { label: 'Facturas CFDI', path: '/facturacion-cfdi', group: 'Facturación' },
  { label: 'Catálogos SAT', path: '/facturacion-cfdi/catalogos', group: 'Facturación' },
  // Admin & Config
  { label: 'Control', path: '/control', group: 'Admin' },
  { label: 'Tutoriales', path: '/tutoriales', group: 'Admin' },
  { label: 'Configuración general', path: '/configuracion', group: 'Configuración' },
  { label: 'Usuarios y permisos', path: '/configuracion/usuarios', group: 'Configuración' },
  { label: 'Vehículos', path: '/configuracion/vehiculos', group: 'Configuración' },
  { label: 'Saldos iniciales', path: '/configuracion/saldos-iniciales', group: 'Configuración' },
  { label: 'WhatsApp', path: '/configuracion/whatsapp', group: 'Configuración' },
  { label: 'Mi suscripción', path: '/mi-suscripcion', group: 'Configuración' },
];

export default function FavoritosPage() {
  const { favorites, add, remove, isFavorite } = useFavorites();
  const { hasModulo } = usePermisos();
  const { isSuperAdmin } = useSubscription();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState('');

  // Filter views by user permissions
  const allowedViews = useMemo(() => {
    if (isSuperAdmin) return ALL_VIEWS;
    return ALL_VIEWS.filter(v => {
      const mod = PATH_MODULE_MAP[v.path];
      return !mod || hasModulo(mod);
    });
  }, [hasModulo, isSuperAdmin]);

  // Enrich favorites with metadata for nicer display
  const enrichedFavs = useMemo(() => {
    return favorites.map(f => {
      const meta = ALL_VIEWS.find(v => v.path === f.path);
      return { ...f, group: meta?.group ?? 'Otro' };
    });
  }, [favorites]);

  const groupedFavs = useMemo(() => {
    const map: Record<string, typeof enrichedFavs> = {};
    enrichedFavs.forEach(f => {
      (map[f.group] ??= []).push(f);
    });
    return map;
  }, [enrichedFavs]);

  const filteredOptions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return allowedViews;
    return allowedViews.filter(o =>
      o.label.toLowerCase().includes(q) || o.group.toLowerCase().includes(q)
    );
  }, [allowedViews, search]);

  const groupedOptions = useMemo(() => {
    const map: Record<string, typeof filteredOptions> = {};
    filteredOptions.forEach(o => {
      (map[o.group] ??= []).push(o);
    });
    return map;
  }, [filteredOptions]);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Star className="h-6 w-6 text-warning" fill="currentColor" />
            Mis Favoritos
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tus vistas marcadas. Se sincronizan en cualquier dispositivo, persisten entre sesiones.
          </p>
        </div>
        <button
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors shadow-sm"
        >
          <Plus className="h-4 w-4" />
          Agregar favorito
        </button>
      </div>

      {/* Empty state */}
      {favorites.length === 0 && (
        <div className="border-2 border-dashed border-border rounded-xl p-12 text-center bg-card">
          <Star className="h-12 w-12 text-muted-foreground/40 mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">Aún no tienes favoritos</h3>
          <p className="text-sm text-muted-foreground mb-5">
            Agrega tus vistas más usadas para acceder rápido desde aquí o desde la barra superior.
          </p>
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Agregar mi primer favorito
          </button>
        </div>
      )}

      {/* Grouped favorites */}
      {Object.entries(groupedFavs).map(([group, items]) => (
        <div key={group}>
          <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            {group}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {items.map(f => (
              <div
                key={f.id}
                className="group relative bg-card border border-border rounded-lg p-4 hover:border-primary/40 hover:shadow-md transition-all"
              >
                <Link to={f.path} className="block">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <Star className="h-5 w-5 text-warning" fill="currentColor" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{f.label}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{f.path}</div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors shrink-0" />
                  </div>
                </Link>
                <button
                  onClick={() => remove(f.path)}
                  className="absolute top-2 right-2 p-1.5 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                  title="Eliminar de favoritos"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Picker dialog */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Star className="h-4 w-4 text-warning" fill="currentColor" />
              Configurar favoritos
            </DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              placeholder="Buscar vista..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {Object.entries(groupedOptions).map(([group, items]) => (
              <div key={group}>
                <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1 px-1">
                  {group}
                </div>
                <div className="space-y-0.5">
                  {items.map(opt => {
                    const fav = isFavorite(opt.path);
                    return (
                      <button
                        key={opt.path}
                        onClick={() => fav ? remove(opt.path) : add({ path: opt.path, label: opt.label })}
                        className={cn(
                          "w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-[13px] transition-colors text-left",
                          fav ? "bg-warning/5 hover:bg-warning/10" : "hover:bg-accent"
                        )}
                      >
                        <div className="flex flex-col min-w-0">
                          <span className="font-medium text-foreground truncate">{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{opt.path}</span>
                        </div>
                        {fav ? (
                          <Star className="h-4 w-4 text-warning shrink-0" fill="currentColor" />
                        ) : (
                          <StarOff className="h-4 w-4 text-muted-foreground/50 shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            {filteredOptions.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                No se encontraron vistas
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
