/**
 * Regla (D-044): lo dado de baja no se ofrece para elegir ni asignar; en un registro que ya lo
 * tiene se conserva y se muestra marcado «(inactivo)». Borrar físicamente un maestro en uso no se
 * permite: se desactiva.
 */
import { supabase } from '@/lib/supabase';

export interface OpcionSelect { value: string; label: string; searchText?: string }

/**
 * Opciones activas + la opción ya asignada al registro (si ya no está entre las activas),
 * marcada «(inactivo)», para que el selector no se vea en blanco ni se pierda el valor.
 */
export function opcionesConAsignado<T extends OpcionSelect>(
  activas: T[],
  asignadoId: string | null | undefined,
  nombreAsignado: string | null | undefined,
  sufijo = '(inactivo)',
): OpcionSelect[] {
  if (!asignadoId || activas.some(o => o.value === asignadoId)) return activas;
  const nombre = (nombreAsignado ?? '').trim() || 'Registro';
  const label = nombre.endsWith(sufijo) ? nombre : `${nombre} ${sufijo}`;
  return [...activas, { value: asignadoId, label, searchText: label }];
}

/** Tablas maestras cuyo borrado físico se valida antes con `usos_de_registros`. */
export type TablaMaestra =
  | 'productos' | 'clientes' | 'proveedores' | 'lista_precios' | 'tarifas' | 'almacenes'
  | 'vehiculos' | 'marcas' | 'clasificaciones' | 'unidades' | 'listas' | 'zonas';

/** Nombre legible de cada tabla que puede tener a un maestro «en uso». */
const ETIQUETAS: Record<string, string> = {
  ventas: 'ventas/pedidos', venta_lineas: 'ventas/pedidos', venta_linea_lotes: 'ventas/pedidos',
  venta_comisiones: 'comisiones', cobros: 'cobros', cobro_excedentes: 'cobros',
  compras: 'compras', compra_lineas: 'compras', pago_compras: 'pagos a proveedor',
  solicitudes_compra: 'solicitudes de compra', solicitud_compra_lineas: 'solicitudes de compra',
  entregas: 'entregas', entrega_lineas: 'entregas', devoluciones: 'devoluciones', devolucion_lineas: 'devoluciones',
  cotizaciones: 'cotizaciones', cotizacion_lineas: 'cotizaciones', cfdi_lineas: 'facturas',
  movimientos_inventario: 'movimientos de inventario', ajustes_inventario: 'ajustes de inventario',
  stock_almacen: 'existencias', stock_camion: 'existencias de camión', lotes: 'lotes',
  traspasos: 'traspasos', traspaso_lineas: 'traspasos', traspaso_linea_lotes: 'traspasos',
  solicitudes_traspaso: 'solicitudes de traspaso', solicitud_traspaso_lineas: 'solicitudes de traspaso',
  cargas: 'cargas', carga_lineas: 'cargas', descarga_ruta: 'descargas', descarga_ruta_lineas: 'descargas',
  mermas: 'mermas', merma_lineas: 'mermas', conteos_fisicos: 'conteos', conteo_lineas: 'conteos',
  auditorias: 'auditorías', auditoria_lineas: 'auditorías', visitas: 'visitas',
  productos: 'productos', producto_proveedores: 'productos', clientes: 'clientes',
  promociones: 'promociones', metas_venta: 'metas de venta', tarifa_lineas: 'tarifas',
  lista_precios: 'listas de precio', tienda_config: 'tienda en línea', tienda_clientes: 'tienda en línea',
  profiles: 'usuarios', ruta_sesiones: 'jornadas de ruta', import_job_lineas: 'importaciones',
};

export interface UsoRegistro { registro_id: string; tabla: string; usos: number }

/** Agrupa los usos por etiqueta legible: «Está en uso en 12 ventas/pedidos, 3 compras». */
export function mensajeEnUso(usos: UsoRegistro[], opts: { cuantos?: number; total?: number; accion?: string } = {}): string {
  const porEtiqueta = new Map<string, number>();
  for (const u of usos) {
    const etiqueta = ETIQUETAS[u.tabla] ?? u.tabla.replace(/_/g, ' ');
    porEtiqueta.set(etiqueta, (porEtiqueta.get(etiqueta) ?? 0) + Number(u.usos || 0));
  }
  const detalle = Array.from(porEtiqueta.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([etiqueta, n]) => `${n} ${etiqueta}`)
    .join(', ');
  const quien = opts.total && opts.total > 1
    ? `${opts.cuantos ?? 0} de ${opts.total} seleccionados están en uso`
    : 'Está en uso';
  return `${quien} (${detalle}); no se puede eliminar. ${opts.accion ?? 'Desactívalo en su lugar.'}`;
}

/** Usos de los registros indicados (solo de la empresa actual; la función valida la empresa). */
export async function usosDeRegistros(tabla: TablaMaestra, ids: string[]): Promise<UsoRegistro[]> {
  if (!ids.length) return [];
  const { data, error } = await (supabase.rpc as any)('usos_de_registros', { p_tabla: tabla, p_ids: ids });
  if (error) throw error;
  return ((data ?? []) as UsoRegistro[]).filter(u => Number(u.usos) > 0);
}

/**
 * Antes de borrar físicamente: devuelve null si ninguno está en uso, o el mensaje para el usuario.
 */
export async function validarSinUsos(tabla: TablaMaestra, ids: string[], accion?: string): Promise<string | null> {
  const usos = await usosDeRegistros(tabla, ids);
  if (!usos.length) return null;
  const enUso = new Set(usos.map(u => u.registro_id));
  return mensajeEnUso(usos, { cuantos: enUso.size, total: ids.length, accion });
}
