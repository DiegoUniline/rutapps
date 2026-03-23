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

export interface DevolucionItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  motivo: 'no_vendido' | 'vencido' | 'danado' | 'cambio' | 'otro';
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

export const MOTIVOS: { value: DevolucionItem['motivo']; label: string }[] = [
  { value: 'no_vendido', label: 'No vendido' },
  { value: 'vencido', label: 'Vencido' },
  { value: 'danado', label: 'Dañado' },
  { value: 'cambio', label: 'Cambio' },
  { value: 'otro', label: 'Otro' },
];
