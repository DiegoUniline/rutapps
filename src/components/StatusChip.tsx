import type { StatusProducto, StatusCliente, StatusVenta } from '@/types';

type StatusType = StatusProducto | StatusCliente | StatusVenta;

const config: Record<string, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'status-pill status-activo' },
  inactivo: { label: 'Inactivo', className: 'status-pill status-inactivo' },
  borrador: { label: 'Borrador', className: 'status-pill status-borrador' },
  suspendido: { label: 'Suspendido', className: 'status-pill status-inactivo' },
  confirmado: { label: 'Confirmado', className: 'status-pill status-activo' },
  entregado: { label: 'Entregado', className: 'status-pill status-activo' },
  facturado: { label: 'Facturado', className: 'status-pill status-activo' },
  cancelado: { label: 'Cancelado', className: 'status-pill status-inactivo' },
};

export function StatusChip({ status }: { status: StatusType }) {
  const c = config[status] ?? config.borrador;
  return <span className={c.className}>{c.label}</span>;
}
