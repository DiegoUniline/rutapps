import type { StatusProducto, StatusCliente, StatusVenta } from '@/types';

type StatusType = StatusProducto | StatusCliente | StatusVenta | string;

const config: Record<string, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'status-pill status-activo' },
  inactivo: { label: 'Inactivo', className: 'status-pill status-inactivo' },
  borrador: { label: 'Borrador', className: 'status-pill status-borrador' },
  suspendido: { label: 'Suspendido', className: 'status-pill status-inactivo' },
  confirmado: { label: 'Confirmado', className: 'status-pill status-activo' },
  confirmada: { label: 'Confirmada', className: 'status-pill status-activo' },
  entregado: { label: 'Entregado', className: 'status-pill status-activo' },
  recibida: { label: 'Recibida', className: 'status-pill status-activo' },
  facturado: { label: 'Facturado', className: 'status-pill status-activo' },
  pagada: { label: 'Pagada', className: 'status-pill status-activo' },
  cancelado: { label: 'Cancelado', className: 'status-pill status-inactivo' },
  cancelada: { label: 'Cancelada', className: 'status-pill status-inactivo' },
};

export function StatusChip({ status, label }: { status: StatusType; label?: string }) {
  const c = config[status] ?? config.borrador;
  return <span className={c.className}>{label ?? c.label}</span>;
}
