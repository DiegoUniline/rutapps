import type { StatusProducto, StatusCliente } from '@/types';

type StatusType = StatusProducto | StatusCliente;

const config: Record<string, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'status-pill status-activo' },
  inactivo: { label: 'Inactivo', className: 'status-pill status-inactivo' },
  borrador: { label: 'Borrador', className: 'status-pill status-borrador' },
  suspendido: { label: 'Suspendido', className: 'status-pill status-inactivo' },
};

export function StatusChip({ status }: { status: StatusType }) {
  const c = config[status] ?? config.borrador;
  return <span className={c.className}>{c.label}</span>;
}
