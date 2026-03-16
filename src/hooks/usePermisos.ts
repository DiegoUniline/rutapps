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
 * All permission modules available in the system.
 * Each module maps to one or more sidebar sections / route groups.
 */
export const MODULOS = [
  { id: 'ventas', label: 'Ventas', desc: 'Ventas, cobranza, promociones' },
  { id: 'pos', label: 'Punto de venta', desc: 'Módulo POS' },
  { id: 'clientes', label: 'Clientes', desc: 'Lista de clientes, formularios' },
  { id: 'logistica', label: 'Logística', desc: 'Dashboard logística, pedidos, entregas, descargas, monitor, rutas, mapas' },
  { id: 'catalogo', label: 'Catálogo', desc: 'Productos, tarifas, categorías, marcas, proveedores, unidades, tasas' },
  { id: 'almacen', label: 'Almacén', desc: 'Inventario, traspasos, ajustes, auditorías, compras, lotes, almacenes' },
  { id: 'finanzas', label: 'Finanzas', desc: 'Cuentas por cobrar/pagar, gastos, comisiones' },
  { id: 'reportes', label: 'Reportes', desc: 'Reportes generales y entregas' },
  { id: 'facturacion', label: 'Facturación CFDI', desc: 'Facturas electrónicas y catálogos SAT' },
  { id: 'configuracion', label: 'Configuración', desc: 'General, usuarios, WhatsApp, suscripción' },
];

export const ACCIONES = ['ver', 'crear', 'editar', 'eliminar'];

/**
 * Maps route path prefixes to permission module IDs.
 * Used by route guards.
 */
export const ROUTE_TO_MODULE: Record<string, string> = {
  '/ventas': 'ventas',
  '/pos': 'pos',
  '/clientes': 'clientes',
  '/productos': 'catalogo',
  '/tarifas': 'catalogo',
  '/proveedores': 'catalogo',
  '/catalogo': 'catalogo',
  '/almacen': 'almacen',
  '/logistica': 'logistica',
  '/monitor-rutas': 'logistica',
  '/finanzas': 'finanzas',
  '/reportes': 'reportes',
  '/configuracion': 'configuracion',
  '/facturacion-cfdi': 'facturacion',
};

/** Maps sidebar nav item base paths to module IDs */
export const NAV_MODULE_MAP: Record<string, string> = {
  '/dashboard': '',          // always visible
  '/supervisor': '',         // always visible
  '/ventas': 'ventas',
  '/clientes': 'clientes',
  '/logistica': 'logistica',
  '/productos': 'catalogo',
  '/almacen': 'almacen',
  '/finanzas': 'finanzas',
  '/reportes': 'reportes',
  '/facturacion-cfdi': 'facturacion',
  '/configuracion': 'configuracion',
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
      // Get user's role
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!userRole?.role_id) {
        // No role assigned → allow everything (owner/admin with no role)
        setHasRole(false);
        setPermisos([]);
        setLoading(false);
        return;
      }

      setHasRole(true);

      // Get permissions for the role
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
    // If user has no role assigned, they have full access (owner)
    if (hasRole === false) return true;
    // While loading, default to false
    if (hasRole === null) return false;
    
    const perm = permisos.find(p => p.modulo === modulo && p.accion === accion);
    return perm?.permitido ?? false;
  }, [permisos, hasRole]);

  const hasModulo = useCallback((modulo: string): boolean => {
    // Empty module = always visible (dashboard, etc)
    if (!modulo) return true;
    return hasPermiso(modulo, 'ver');
  }, [hasPermiso]);

  return { permisos, loading, hasPermiso, hasModulo, reload: load };
}
