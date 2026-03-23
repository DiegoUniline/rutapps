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
  unidad: string;
  tiene_iva: boolean;
  iva_pct: number;
}

export type View = 'detalle' | 'editar' | 'cobrar' | 'ticket';

export const statusColors: Record<string, string> = {
  borrador: 'bg-muted text-muted-foreground',
  confirmado: 'bg-primary/10 text-primary',
  entregado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  facturado: 'bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  cancelado: 'bg-destructive/10 text-destructive',
};
