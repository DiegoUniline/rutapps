export interface CuentaPendiente {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  montoAplicar: number;
}

export interface EditLinea {
  id?: string;
  producto_id: string;
  nombre: string;
  codigo: string;
  cantidad: number;
  precio_unitario: number;
  precio_unitario_sin_redondeo?: number;
  precio_display_sin_redondeo?: number;
  display_unit_price?: number;
  base_precio?: string;
  redondeo?: string;
  descuento_pct?: number;
  lista_precio_id?: string | null;
  precio_manual?: boolean;
  unidad_id?: string | null;
  unidad: string;
  tiene_iva: boolean;
  iva_pct: number;
  tiene_ieps?: boolean;
  ieps_pct?: number;
  /** Reparto por lotes (empresas con manejo de lotes) */
  lotes?: { lote_id: string; codigo: string; cantidad: number }[];
}

export type View = 'detalle' | 'editar' | 'cobrar' | 'ticket';

export const statusColors: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  confirmado: 'bg-primary/10 text-primary',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  facturado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  cancelado: 'bg-destructive/10 text-destructive',
};
