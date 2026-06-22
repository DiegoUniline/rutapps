import { useCallback, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { fetchAllPages } from '@/lib/supabasePaginate';

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
  /** Permisos específicos de roles "solo vista móvil". Default true (permitido). */
  hasPermisoMovil: (modulo: string) => boolean;
  isOwner: boolean;
  reload: () => void;
  /** First route the user can access, based on their permissions. */
  firstAccessibleRoute: string;
}

/** Priority list of modules → routes used to compute the home redirect. */
const ROUTE_PRIORITY: Array<{ modulo: string; path: string }> = [
  { modulo: 'dashboard', path: '/dashboard' },
  { modulo: 'pos', path: '/pos' },
  { modulo: 'ventas', path: '/ventas' },
  { modulo: 'clientes', path: '/clientes' },
  { modulo: 'logistica.dashboard', path: '/logistica/dashboard' },
  { modulo: 'logistica.pedidos', path: '/logistica/pedidos' },
  { modulo: 'logistica.entregas', path: '/logistica/entregas' },
  { modulo: 'almacen.inventario', path: '/almacen/inventario' },
  { modulo: 'catalogo.productos', path: '/productos' },
  { modulo: 'reportes.generales', path: '/reportes' },
  { modulo: 'configuracion.suscripcion', path: '/mi-suscripcion' },
];

export function getFirstAccessibleRoute(
  hasModulo: (m: string) => boolean,
  isSoloMovil: boolean = false,
): string {
  // Solo vista móvil tiene prioridad absoluta sobre cualquier permiso residual
  if (isSoloMovil) return '/ruta';
  for (const { modulo, path } of ROUTE_PRIORITY) {
    if (hasModulo(modulo)) return path;
  }
  return '/configuracion-inicial';
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
  { id: 'ventas', label: 'Ventas', group: 'Ventas' },
  { id: 'ventas.cotizaciones', label: 'Cotizaciones', group: 'Ventas' },
  { id: 'ventas.reporte_diario', label: 'Reporte diario', group: 'Ventas' },
  { id: 'ventas.devoluciones', label: 'Devoluciones', group: 'Ventas' },
  { id: 'ventas.cobranza', label: 'Cobranza', group: 'Ventas' },
  { id: 'ventas.promociones', label: 'Promociones', group: 'Ventas' },
  { id: 'ventas.cambiar_precio', label: 'Cambiar precio en venta', group: 'Ventas' },
  { id: 'ventas.aplicar_descuento', label: 'Aplicar descuento al total', group: 'Ventas' },
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
  { id: 'almacen.almacenes', label: 'Almacenes', group: 'Almacén' },

  // Control
  { id: 'control', label: 'Control', group: 'Control' },

  // Finanzas
  { id: 'finanzas.por_cobrar', label: 'Cuentas por cobrar', group: 'Finanzas' },
  { id: 'finanzas.aplicar_pagos', label: 'Aplicar pagos clientes', group: 'Finanzas' },
  { id: 'finanzas.saldos_cliente', label: 'Saldos por cliente', group: 'Finanzas' },
  { id: 'finanzas.por_pagar', label: 'Cuentas por pagar', group: 'Finanzas' },
  { id: 'finanzas.pagos_proveedores', label: 'Pagos proveedores', group: 'Finanzas' },
  { id: 'finanzas.saldos_proveedor', label: 'Saldos por proveedor', group: 'Finanzas' },
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
  { id: 'configuracion.wa_bot', label: 'Bot WhatsApp', group: 'Configuración' },
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
  'ventas.cambiar_precio': ['ver'],
  'ventas.aplicar_descuento': ['ver'],
  'logistica.dashboard': ['ver'],
  'logistica.monitor': ['ver'],
  'logistica.mapa_clientes': ['ver'],
  'logistica.mapa_ventas': ['ver'],
  'reportes.generales': ['ver'],
  'reportes.entregas': ['ver'],
  'configuracion.general': ['ver', 'editar'],
  'configuracion.suscripcion': ['ver'],
  'configuracion.whatsapp': ['ver', 'editar'],
  'configuracion.wa_bot': ['ver', 'editar'],
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
  '/cotizaciones': 'ventas.cotizaciones',
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
  '/almacen/almacenes': 'almacen.almacenes',
  '/control': 'control',
  '/finanzas/por-cobrar': 'finanzas.por_cobrar',
  '/finanzas/aplicar-pagos': 'finanzas.aplicar_pagos',
  '/finanzas/saldos-cliente': 'finanzas.saldos_cliente',
  '/finanzas/por-pagar': 'finanzas.por_pagar',
  '/finanzas/pagos-proveedores': 'finanzas.pagos_proveedores',
  '/finanzas/saldos-proveedor': 'finanzas.saldos_proveedor',
  '/finanzas/aplicar-pagos-proveedor': 'finanzas.saldos_proveedor',
  '/finanzas/gastos': 'finanzas.gastos',
  '/comisiones': 'ventas.comisiones',
  '/reportes': 'reportes.generales',
  '/reportes/entregas': 'reportes.entregas',
  '/facturacion-cfdi': 'facturacion.cfdi',
  '/facturacion-cfdi/catalogos': 'facturacion.catalogos',
  '/configuracion': 'configuracion.general',
  '/configuracion/usuarios': 'configuracion.usuarios',
  '/configuracion/whatsapp': 'configuracion.whatsapp',
  '/configuracion/wa-bot': 'configuracion.wa_bot',
  '/facturacion': 'configuracion.suscripcion',
  '/mi-suscripcion': 'configuracion.suscripcion',
  '/configuracion-inicial': '', // always accessible
};

/**
 * Permisos específicos para roles "Solo vista móvil" (app de ruta).
 * Acción única implícita = 'ver'. Default cuando no hay registro = permitido (true)
 * para no romper roles existentes; el admin debe destildar para bloquear.
 */
export interface ModuloMovilDef { id: string; label: string; group: string; description?: string; }

export const MODULOS_MOVIL: ModuloMovilDef[] = [
  // Pestañas y vistas reales de la app móvil
  { id: 'ruta.resumen', label: 'Resumen (dashboard)', group: 'Vistas', description: 'Pestaña "Resumen" del dashboard de ruta' },
  { id: 'ruta.clientes', label: 'Clientes (pestaña principal)', group: 'Vistas', description: 'Pestaña inferior "Clientes"' },
  { id: 'ruta.entregas', label: 'Entregas / Pedidos', group: 'Vistas', description: 'Sub-pestaña dentro de Clientes' },
  { id: 'ruta.mapa', label: 'Mapa / Navegación', group: 'Vistas', description: 'Sub-pestaña de Navegación y mapa' },
  { id: 'ruta.ventas_hist', label: 'Ventas (historial)', group: 'Vistas', description: 'Pestaña inferior "Ventas"' },
  { id: 'ruta.cobros_hist', label: 'Cobros (historial)', group: 'Vistas', description: 'Sub-pestaña dentro de Ventas' },
  { id: 'ruta.stock', label: 'Stock del camión', group: 'Vistas', description: 'Pestaña inferior "Stock"' },
  { id: 'ruta.descarga', label: 'Liquidar / Mi carga', group: 'Vistas', description: 'Opción del menú "Más"' },
  // Acciones de venta
  { id: 'ruta.vender', label: 'Crear ventas (POS y nueva venta)', group: 'Ventas', description: 'Habilita pestaña POS y crear venta' },
  { id: 'ruta.venta_credito', label: 'Vender a crédito', group: 'Ventas' },
  { id: 'ruta.cambiar_precio', label: 'Cambiar precio en línea', group: 'Ventas' },
  { id: 'ruta.aplicar_descuento', label: 'Aplicar descuento', group: 'Ventas' },
  { id: 'ruta.cancelar_venta', label: 'Cancelar venta', group: 'Ventas' },
  // Cobros / devoluciones
  { id: 'ruta.cobrar', label: 'Registrar cobros', group: 'Cobranza' },
  { id: 'ruta.devoluciones', label: 'Hacer devoluciones', group: 'Cobranza' },
  // Clientes
  { id: 'ruta.cliente_crear', label: 'Crear cliente nuevo', group: 'Clientes' },
  { id: 'ruta.cliente_editar', label: 'Editar cliente', group: 'Clientes' },
  { id: 'ruta.cliente_eliminar', label: 'Eliminar cliente', group: 'Clientes', description: 'Permite dar de baja (marcar inactivo) a un cliente desde la app móvil' },
  { id: 'ruta.cliente_credito', label: 'Asignar límite de crédito', group: 'Clientes' },
  // Otros
  { id: 'ruta.gastos', label: 'Registrar gastos (menú Más)', group: 'Otros' },
];


export function getMobileModuloGroups(): string[] {
  const seen = new Set<string>();
  return MODULOS_MOVIL.reduce<string[]>((acc, m) => {
    if (!seen.has(m.group)) { seen.add(m.group); acc.push(m.group); }
    return acc;
  }, []);
}

interface PermisosData {
  hasRole: boolean;
  permisos: Permiso[];
  /** Source of truth for "Solo vista móvil" — read directly from roles table */
  roleSoloMovil: boolean;
  roleId: string | null;
}

async function fetchPermisos(userId: string): Promise<PermisosData> {
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role_id, roles(solo_movil)')
    .eq('user_id', userId)
    .maybeSingle();

  if (!userRole?.role_id) {
    return { hasRole: false, permisos: [], roleSoloMovil: false, roleId: null };
  }

  const roleSoloMovil = !!(userRole as any).roles?.solo_movil;

  const rolePermisos = await fetchAllPages<Permiso>((from, to) =>
    supabase.from('role_permisos')
      .select('modulo, accion, permitido')
      .eq('role_id', userRole.role_id)
      .range(from, to)
  );

  return { hasRole: true, permisos: rolePermisos, roleSoloMovil, roleId: userRole.role_id };
}

export function usePermisos(): UsePermisosReturn {
  const { user, empresa } = useAuth();

  const isOwner = !!(user && empresa?.owner_user_id && empresa.owner_user_id === user.id);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['user-permisos', user?.id],
    queryFn: () => fetchPermisos(user!.id),
    enabled: !!user?.id,
    staleTime: 15_000,
    gcTime: 5 * 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    refetchInterval: 30_000, // poll cada 30s para reflejar cambios sin recargar
  });

  // Refetch when admin updates permissions (cross-tab via storage / same-tab via event)
  useEffect(() => {
    const handler = () => { refetch(); };
    window.addEventListener('uniline:permisos-changed', handler);
    return () => window.removeEventListener('uniline:permisos-changed', handler);
  }, [refetch]);

  // Suscripción Realtime: cuando el admin cambia role_permisos del rol del usuario,
  // se refresca al instante sin necesidad de recargar la app.
  const roleId = data?.roleId ?? null;
  useEffect(() => {
    if (!roleId) return;
    const channel = supabase
      .channel(`role-permisos-${roleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_permisos', filter: `role_id=eq.${roleId}` },
        () => { refetch(); }
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [roleId, refetch]);

  const hasRole = data?.hasRole ?? null;
  const permisos = data?.permisos ?? [];
  const roleSoloMovil = data?.roleSoloMovil ?? false;

  const hasPermiso = useCallback((modulo: string, accion: string): boolean => {
    // Owner always has full access and is never restricted
    if (isOwner) {
      return modulo === 'solo_movil' ? false : true;
    }
    // 'solo_movil' is a restrictive flag — source of truth is roles.solo_movil column
    if (modulo === 'solo_movil') {
      if (hasRole === false) return false;
      if (hasRole === null) return false;
      // Trust the roles table flag OR an explicit permission row (whichever is true)
      if (roleSoloMovil) return true;
      const perm = permisos.find(p => p.modulo === 'solo_movil' && p.accion === accion);
      return perm?.permitido ?? false;
    }
    if (hasRole === false) return true; // no role = full access
    if (hasRole === null) return modulo === 'solo_movil' ? false : true; // still loading — allow access
    // Each module requires its own explicit permission — no parent fallback
    const perm = permisos.find(p => p.modulo === modulo && p.accion === accion);
    return perm?.permitido ?? false;
  }, [permisos, hasRole, isOwner, roleSoloMovil]);

  const hasModulo = useCallback((modulo: string): boolean => {
    if (!modulo) return true;
    return hasPermiso(modulo, 'ver');
  }, [hasPermiso]);

  /**
   * Permisos móviles (solo para roles "solo vista móvil").
   * Semántica inversa: default = true (permitido) si no hay row en role_permisos.
   * Owners siempre true. Solo se bloquea si existe un row con permitido=false.
   */
  const hasPermisoMovil = useCallback((modulo: string): boolean => {
    if (isOwner) return true;
    if (hasRole !== true) return true;
    const perm = permisos.find(p => p.modulo === modulo && p.accion === 'ver');
    return perm?.permitido ?? true;
  }, [permisos, hasRole, isOwner]);

  const reload = useCallback(() => {
    refetch();
    window.dispatchEvent(new Event('uniline:permisos-changed'));
  }, [refetch]);

  // Para owners, no aplica solo_movil. Para roles solo_movil, redirigir directo a /ruta.
  const firstAccessibleRoute = getFirstAccessibleRoute(hasModulo, !isOwner && roleSoloMovil);

  return { permisos, loading: isLoading, hasPermiso, hasModulo, hasPermisoMovil, isOwner, reload, firstAccessibleRoute };
}
