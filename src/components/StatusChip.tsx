import type { StatusProducto } from '@/types';

const config: Record<StatusProducto, { label: string; className: string }> = {
  activo: { label: 'Activo', className: 'status-pill status-activo' },
  inactivo: { label: 'Inactivo', className: 'status-pill status-inactivo' },
  borrador: { label: 'Borrador', className: 'status-pill status-borrador' },
};

export function StatusChip({ status }: { status: StatusProducto }) {
  const c = config[status] ?? config.borrador;
  return <span className={c.className}>{c.label}</span>;
}
