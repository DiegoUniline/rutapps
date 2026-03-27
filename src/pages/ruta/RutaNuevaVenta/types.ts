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
}

export type AccionDevolucion = 'reposicion' | 'nota_credito' | 'devolucion_dinero' | 'descuento_venta';
export type MotivoDevolucion = 'no_vendido' | 'vencido' | 'danado' | 'cambio' | 'caducado' | 'error_pedido' | 'otro';

export interface DevolucionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: MotivoDevolucion;
  accion: AccionDevolucion;
  precio_unitario: number;
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
  metodo_pago: 'efectivo' | 'transferencia' | 'tarjeta';
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

export const ACCIONES: { value: AccionDevolucion; label: string; icon: string; desc: string }[] = [
  { value: 'reposicion', label: 'Reposición', icon: '🔄', desc: 'Reponer con otro producto sin cargo' },
  { value: 'nota_credito', label: 'Nota de crédito', icon: '📝', desc: 'Saldo a favor del cliente' },
  { value: 'devolucion_dinero', label: 'Devolver dinero', icon: '💰', desc: 'Reembolso directo al cliente' },
  { value: 'descuento_venta', label: 'Descuento en venta', icon: '🏷️', desc: 'Aplicar valor como descuento' },
];
