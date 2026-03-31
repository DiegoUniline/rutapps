import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

interface Permiso {
  modulo: string;
  accion: string;
  permitido: boolean;
}

interface UsePermisosReturn {
  permisos: Permiso[];
  loading: boolean;
  hasPermiso: (modulo: string, accion: string) => boolean;
  hasModulo: (modulo: string) => boolean;
  isOwner: boolean;
  reload: () => void;
}

/**
 * All permission sub-modules grouped for UI display.
 * Each maps to a specific sidebar item or route.
 */
export interface ModuloDef {
  id: string;
  label: string;
  group: string;
}

export const MODULOS: ModuloDef[] = [
  // General
  { id: 'dashboard', label: 'Dashboard', group: 'General' },
  { id: 'supervisor', label: 'Supervisor', group: 'General' },
  { id: 'solo_movil', label: 'Solo vista móvil (ruta)', group: 'General' },

  // Ventas
  { id: 'ventas', label: 'Todas las ventas', group: 'Ventas' },
  { id: 'ventas.reporte_diario', label: 'Reporte diario', group: 'Ventas' },
  { id: 'ventas.devoluciones', label: 'Devoluciones', group: 'Ventas' },
  { id: 'ventas.cobranza', label: 'Cobranza', group: 'Ventas' },
  { id: 'ventas.promociones', label: 'Promociones', group: 'Ventas' },
  { id: 'pos', label: 'Punto de venta', group: 'Ventas' },

  // Clientes
  { id: 'clientes', label: 'Clientes', group: 'Clientes' },

  // Logística
  { id: 'logistica.dashboard', label: 'Dashboard logística', group: 'Logística' },
  { id: 'logistica.pedidos', label: 'Pedidos pendientes', group: 'Logística' },
  { id: 'logistica.entregas', label: 'Entregas', group: 'Logística' },
  { id: 'logistica.descargas', label: 'Descargas de ruta', group: 'Logística' },
  { id: 'logistica.monitor', label: 'Monitor de rutas', group: 'Logística' },
  { id: 'logistica.rutas', label: 'Rutas', group: 'Logística' },
  { id: 'logistica.mapa_clientes', label: 'Mapa de clientes', group: 'Logística' },
  { id: 'logistica.mapa_ventas', label: 'Mapa de ventas', group: 'Logística' },

  // Catálogo
  { id: 'catalogo.productos', label: 'Productos', group: 'Catálogo' },
  { id: 'catalogo.listas_precio', label: 'Listas de Precios', group: 'Catálogo' },
  { id: 'catalogo.clasificaciones', label: 'Categorías', group: 'Catálogo' },
  { id: 'catalogo.marcas', label: 'Marcas', group: 'Catálogo' },
  { id: 'catalogo.proveedores', label: 'Proveedores', group: 'Catálogo' },
  { id: 'catalogo.unidades', label: 'Unidades', group: 'Catálogo' },
  { id: 'catalogo.zonas', label: 'Zonas', group: 'Catálogo' },
  { id: 'catalogo.tasas_iva', label: 'Tasas IVA', group: 'Catálogo' },
  { id: 'catalogo.tasas_ieps', label: 'Tasas IEPS', group: 'Catálogo' },

  // Almacén
  { id: 'almacen.inventario', label: 'Inventario', group: 'Almacén' },
  { id: 'almacen.traspasos', label: 'Traspasos', group: 'Almacén' },
  { id: 'almacen.ajustes', label: 'Ajustes', group: 'Almacén' },
  { id: 'almacen.auditorias', label: 'Auditorías', group: 'Almacén' },
  { id: 'almacen.conteos', label: 'Conteos físicos', group: 'Almacén' },
  { id: 'almacen.compras', label: 'Compras', group: 'Almacén' },
  { id: 'almacen.lotes', label: 'Lotes', group: 'Almacén' },
  { id: 'almacen.almacenes', label: 'Almacenes', group: 'Almacén' },

  // Control
  { id: 'control', label: 'Control', group: 'Control' },

  // Finanzas
  { id: 'finanzas.por_cobrar', label: 'Cuentas por cobrar', group: 'Finanzas' },
  { id: 'finanzas.por_pagar', label: 'Cuentas por pagar', group: 'Finanzas' },
  { id: 'finanzas.gastos', label: 'Gastos', group: 'Finanzas' },
  { id: 'finanzas.comisiones', label: 'Comisiones', group: 'Finanzas' },

  // Reportes
  { id: 'reportes.generales', label: 'Reportes generales', group: 'Reportes' },
  { id: 'reportes.entregas', label: 'Reporte entregas', group: 'Reportes' },

  // Facturación
  { id: 'facturacion.cfdi', label: 'Facturas CFDI', group: 'Facturación' },
  { id: 'facturacion.catalogos', label: 'Catálogos SAT', group: 'Facturación' },

  // Configuración
  { id: 'configuracion.general', label: 'General', group: 'Configuración' },
  { id: 'configuracion.usuarios', label: 'Usuarios y permisos', group: 'Configuración' },
  { id: 'configuracion.whatsapp', label: 'WhatsApp', group: 'Configuración' },
  { id: 'configuracion.suscripcion', label: 'Mi suscripción', group: 'Configuración' },
];

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar', 'ver_todos'];

/**
 * Maps module IDs to the actions that actually apply.
 * Modules not listed here default to all ACCIONES.
 */
export const ACCIONES_POR_MODULO: Record<string, string[]> = {
  dashboard: ['ver'],
  supervisor: ['ver'],
  solo_movil: ['ver'],
  pos: ['ver'],
  control: ['ver'],
  'ventas.reporte_diario': ['ver'],
  'logistica.dashboard': ['ver'],
  'logistica.monitor': ['ver'],
  'logistica.mapa_clientes': ['ver'],
  'logistica.mapa_ventas': ['ver'],
  'reportes.generales': ['ver'],
  'reportes.entregas': ['ver'],
  'configuracion.general': ['ver', 'editar'],
  'configuracion.suscripcion': ['ver'],
  'configuracion.whatsapp': ['ver', 'editar'],
  'facturacion.catalogos': ['ver'],
};

/** Get the applicable actions for a given module */
export function getModuloAcciones(moduloId: string): string[] {
  return ACCIONES_POR_MODULO[moduloId] ?? ACCIONES;
}

/** Get unique groups in order */
export function getModuloGroups(): string[] {
  const seen = new Set<string>();
  return MODULOS.reduce<string[]>((acc, m) => {
    if (!seen.has(m.group)) { seen.add(m.group); acc.push(m.group); }
    return acc;
  }, []);
}

/**
 * Maps exact nav child paths → permission module IDs.
 */
export const PATH_MODULE_MAP: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/supervisor': 'supervisor',
  '/ventas': 'ventas',
  '/ventas/reporte-diario': 'ventas.reporte_diario',
  '/ventas/devoluciones': 'ventas.devoluciones',
  '/ventas/cobranza': 'ventas.cobranza',
  '/ventas/promociones': 'ventas.promociones',
  '/pos': 'pos',
  '/clientes': 'clientes',
  '/logistica/dashboard': 'logistica.dashboard',
  '/logistica/pedidos': 'logistica.pedidos',
  '/logistica/entregas': 'logistica.entregas',
  '/almacen/descargas': 'logistica.descargas',
  '/monitor-rutas': 'logistica.monitor',
  '/ventas/rutas': 'logistica.rutas',
  '/ventas/mapa-clientes': 'logistica.mapa_clientes',
  '/ventas/mapa-ventas': 'logistica.mapa_ventas',
  '/productos': 'catalogo.productos',
  '/listas-precio': 'catalogo.listas_precio',
  '/catalogos/clasificaciones': 'catalogo.clasificaciones',
  '/catalogos/marcas': 'catalogo.marcas',
  '/proveedores': 'catalogo.proveedores',
  '/catalogos/unidades': 'catalogo.unidades',
  '/catalogos/zonas': 'catalogo.zonas',
  '/catalogos/tasas-iva': 'catalogo.tasas_iva',
  '/catalogos/tasas-ieps': 'catalogo.tasas_ieps',
  '/almacen/inventario': 'almacen.inventario',
  '/almacen/traspasos': 'almacen.traspasos',
  '/almacen/ajustes': 'almacen.ajustes',
  '/almacen/auditorias': 'almacen.auditorias',
  '/almacen/conteos': 'almacen.conteos',
  '/almacen/compras': 'almacen.compras',
  '/almacen/lotes': 'almacen.lotes',
  '/almacen/almacenes': 'almacen.almacenes',
  '/control': 'control',
  '/finanzas/por-cobrar': 'finanzas.por_cobrar',
  '/finanzas/aplicar-pagos': 'finanzas.por_cobrar',
  '/finanzas/saldos-cliente': 'finanzas.por_cobrar',
  '/finanzas/por-pagar': 'finanzas.por_pagar',
  '/finanzas/pagos-proveedores': 'finanzas.por_pagar',
  '/finanzas/saldos-proveedor': 'finanzas.por_pagar',
  '/finanzas/gastos': 'finanzas.gastos',
  '/finanzas/comisiones': 'finanzas.comisiones',
  '/reportes': 'reportes.generales',
  '/reportes/entregas': 'reportes.entregas',
  '/facturacion-cfdi': 'facturacion.cfdi',
  '/facturacion-cfdi/catalogos': 'facturacion.catalogos',
  '/configuracion': 'configuracion.general',
  '/configuracion/usuarios': 'configuracion.usuarios',
  '/configuracion/whatsapp': 'configuracion.whatsapp',
  '/facturacion': 'configuracion.suscripcion',
  '/mi-suscripcion': 'configuracion.suscripcion',
  '/configuracion-inicial': '', // always accessible
};

interface PermisosData {
  hasRole: boolean;
  permisos: Permiso[];
}

async function fetchPermisos(userId: string): Promise<PermisosData> {
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role_id')
    .eq('user_id', userId)
    .maybeSingle();

  if (!userRole?.role_id) {
    return { hasRole: false, permisos: [] };
  }

  const { data: rolePermisos } = await supabase
    .from('role_permisos')
    .select('modulo, accion, permitido')
    .eq('role_id', userRole.role_id);

  return { hasRole: true, permisos: rolePermisos ?? [] };
}

export function usePermisos(): UsePermisosReturn {
  const { user, empresa } = useAuth();

  const isOwner = !!(user && empresa?.owner_user_id && empresa.owner_user_id === user.id);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-permisos', user?.id],
    queryFn: () => fetchPermisos(user!.id),
    enabled: !!user?.id,
    staleTime: 2 * 60_000,
    gcTime: 5 * 60_000,
  });

  const hasRole = data?.hasRole ?? null;
  const permisos = data?.permisos ?? [];

  const hasPermiso = useCallback((modulo: string, accion: string): boolean => {
    // Owner always has full access and is never restricted
    if (isOwner) {
      return modulo === 'solo_movil' ? false : true;
    }
    // 'solo_movil' is a restrictive flag — only true when explicitly granted
    if (modulo === 'solo_movil') {
      if (hasRole === false) return false;
      if (hasRole === null) return false;
      const perm = permisos.find(p => p.modulo === 'solo_movil' && p.accion === accion);
      return perm?.permitido ?? false;
    }
    if (hasRole === false) return true; // no role = full access
    if (hasRole === null) return false; // loading
    // Each module requires its own explicit permission — no parent fallback
    const perm = permisos.find(p => p.modulo === modulo && p.accion === accion);
    return perm?.permitido ?? false;
  }, [permisos, hasRole, isOwner]);

  const hasModulo = useCallback((modulo: string): boolean => {
    if (!modulo) return true;
    return hasPermiso(modulo, 'ver');
  }, [hasPermiso]);

  const reload = useCallback(() => {
    refetch();
    window.dispatchEvent(new Event('uniline:permisos-changed'));
  }, [refetch]);

  return { permisos, loading: isLoading, hasPermiso, hasModulo, isOwner, reload };
}
