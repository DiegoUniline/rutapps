export interface CartItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  unidad: string;
  unidad_id?: string;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps: boolean;
  ieps_pct: number;
  es_cambio?: boolean;
  /** Raw net price before rounding (from tarifa) */
  precio_unitario_sin_redondeo?: number;
  /** Raw gross/display price before rounding */
  precio_display_sin_redondeo?: number;
  /** 'con_impuestos' | 'sin_impuestos' */
  base_precio?: string;
  /** Rounding rule from tarifa */
  redondeo?: string;
  display_unit_price?: number;
  /** True when user manually overrode the unit price */
  precio_manual?: boolean;
  /** Active price list applied to this line (null = base / suggested tarifa) */
  lista_precio_id?: string | null;
  /** Friendly label of the applied list (for UI badges) */
  lista_nombre?: string | null;
  /** Granel: presentación seleccionada (snapshot) */
  presentacion_id?: string | null;
  presentacion_nombre?: string | null;
  presentacion_factor?: number | null;
  /** # de paquetes capturado por el usuario (la cantidad real va en `cantidad`, en unidad base) */
  paquetes?: number | null;
  /** Almacén del que saldrá esta línea (solo pedidos con flag de apartado ON) */
  almacen_id?: string | null;
  /** Lote apartado para esta línea (empresas con manejo de lotes) */
  lote_id?: string | null;
  /** Código del lote apartado (solo para mostrar) */
  lote_codigo?: string | null;
  /** Reparto de la cantidad entre varios lotes (empresas con manejo de lotes) */
  lotes?: LoteAsignacionCart[];
  /** Unidades de regalo agregadas automáticamente por una promoción (no se guardan). */
  regalo_auto?: number;
}

export interface LoteAsignacionCart {
  lote_id: string;
  codigo: string;
  cantidad: number;
}

// D-049: «Descuento en venta» ya no existe; «aplicar_venta» = nota de crédito aplicada a esta venta.
export type AccionDevolucion = 'reposicion' | 'nota_credito' | 'devolucion_dinero' | 'aplicar_venta';
export type MotivoDevolucion = 'no_vendido' | 'vencido' | 'danado' | 'cambio' | 'caducado' | 'error_pedido' | 'otro';

export interface DevolucionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: MotivoDevolucion;
  accion: AccionDevolucion;
  /** Precio de la lista de precios del cliente CON impuestos (D-049). */
  precio_unitario: number;
  /** Destino obligatorio: vendible en camión o merma en camión (el motivo solo lo sugiere). */
  destino: 'vendible' | 'merma';
  /** El vendedor lo cambió a mano: cambiar el motivo ya no lo re-sugiere. */
  destinoElegido?: boolean;
  reemplazo_producto_id?: string;
  reemplazo_nombre?: string;
}

export interface CuentaPendiente {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  montoAplicar: number;
}

export interface PagoLinea {
  id: string;
  metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta' | 'saldo_favor';
  monto: number;
  referencia: string;
}

export type Step = 'tipo' | 'cliente' | 'devoluciones' | 'productos' | 'resumen' | 'pago';

export const STEP_LABELS: Record<Step, string> = {
  tipo: 'Tipo',
  cliente: 'Cliente',
  devoluciones: 'Devol.',
  productos: 'Pedido',
  resumen: 'Confirmar',
  pago: 'Pago',
};

export const STEPS: Step[] = ['tipo', 'cliente', 'devoluciones', 'productos', 'resumen', 'pago'];

export const MOTIVOS: { value: MotivoDevolucion; label: string }[] = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'caducado', label: 'Caducado' },
  { value: 'danado', label: 'Dañado' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'error_pedido', label: 'Error de pedido' },
  { value: 'otro', label: 'Otro' },
];

export type DescuentoExtraTipo = 'monto' | 'porcentaje';

export const ACCIONES: { value: AccionDevolucion; label: string; icon: string; desc: string }[] = [
  { value: 'reposicion', label: 'Reposición', icon: '🔄', desc: 'Se le entrega producto (sale del camión), sin dinero' },
  { value: 'nota_credito', label: 'Nota de crédito', icon: '📝', desc: 'Saldo a favor del cliente' },
  { value: 'devolucion_dinero', label: 'Devolver dinero', icon: '💰', desc: 'Reembolso directo al cliente' },
  { value: 'aplicar_venta', label: 'Aplicar a la venta', icon: '🧾', desc: 'Nota de crédito que paga esta venta' },
];
