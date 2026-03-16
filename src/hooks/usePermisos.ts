import { useState, useEffect, useCallback } from 'react';
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

  // Ventas
  { id: 'ventas', label: 'Todas las ventas', group: 'Ventas' },
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
  { id: 'catalogo.tarifas', label: 'Tarifas', group: 'Catálogo' },
  { id: 'catalogo.clasificaciones', label: 'Categorías', group: 'Catálogo' },
  { id: 'catalogo.marcas', label: 'Marcas', group: 'Catálogo' },
  { id: 'catalogo.proveedores', label: 'Proveedores', group: 'Catálogo' },
  { id: 'catalogo.unidades', label: 'Unidades', group: 'Catálogo' },
  { id: 'catalogo.tasas_iva', label: 'Tasas IVA', group: 'Catálogo' },
  { id: 'catalogo.tasas_ieps', label: 'Tasas IEPS', group: 'Catálogo' },

  // Almacén
  { id: 'almacen.inventario', label: 'Inventario', group: 'Almacén' },
  { id: 'almacen.traspasos', label: 'Traspasos', group: 'Almacén' },
  { id: 'almacen.ajustes', label: 'Ajustes', group: 'Almacén' },
  { id: 'almacen.auditorias', label: 'Auditorías', group: 'Almacén' },
  { id: 'almacen.compras', label: 'Compras', group: 'Almacén' },
  { id: 'almacen.lotes', label: 'Lotes', group: 'Almacén' },
  { id: 'almacen.almacenes', label: 'Almacenes', group: 'Almacén' },

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

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

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
 * Used for sidebar filtering and route guarding.
 */
export const PATH_MODULE_MAP: Record<string, string> = {
  '/dashboard': 'dashboard',
  '/supervisor': 'supervisor',
  '/ventas': 'ventas',
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
  '/tarifas': 'catalogo.tarifas',
  '/catalogo/clasificaciones': 'catalogo.clasificaciones',
  '/catalogo/marcas': 'catalogo.marcas',
  '/proveedores': 'catalogo.proveedores',
  '/catalogo/unidades': 'catalogo.unidades',
  '/catalogo/tasas-iva': 'catalogo.tasas_iva',
  '/catalogo/tasas-ieps': 'catalogo.tasas_ieps',
  '/almacen/inventario': 'almacen.inventario',
  '/almacen/traspasos': 'almacen.traspasos',
  '/almacen/ajustes': 'almacen.ajustes',
  '/almacen/auditorias': 'almacen.auditorias',
  '/almacen/compras': 'almacen.compras',
  '/almacen/lotes': 'almacen.lotes',
  '/almacen/almacenes': 'almacen.almacenes',
  '/finanzas/por-cobrar': 'finanzas.por_cobrar',
  '/finanzas/por-pagar': 'finanzas.por_pagar',
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
  '/configuracion-inicial': '', // always accessible
};

export function usePermisos(): UsePermisosReturn {
  const { user } = useAuth();
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasRole, setHasRole] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) {
      setPermisos([]);
      setHasRole(null);
      setLoading(false);
      return;
    }

    try {
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!userRole?.role_id) {
        setHasRole(false);
        setPermisos([]);
        setLoading(false);
        return;
      }

      setHasRole(true);

      const { data: rolePermisos } = await supabase
        .from('role_permisos')
        .select('modulo, accion, permitido')
        .eq('role_id', userRole.role_id);

      setPermisos(rolePermisos ?? []);
    } catch (e) {
      console.error('Error loading permisos:', e);
      setPermisos([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { load(); }, [load]);

  const hasPermiso = useCallback((modulo: string, accion: string): boolean => {
    if (hasRole === false) return true; // no role = owner = full access
    if (hasRole === null) return false; // loading
    const perm = permisos.find(p => p.modulo === modulo && p.accion === accion);
    return perm?.permitido ?? false;
  }, [permisos, hasRole]);

  const hasModulo = useCallback((modulo: string): boolean => {
    if (!modulo) return true; // empty = always visible
    return hasPermiso(modulo, 'ver');
  }, [hasPermiso]);

  return { permisos, loading, hasPermiso, hasModulo, reload: load };
}
