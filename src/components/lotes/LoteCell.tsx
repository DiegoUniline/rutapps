import type { LoteRef } from '@/hooks/useLotesPorReferencia';

const fmtCad = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' }) : 'sin cad.';

/**
 * Celda de "Lote" reutilizable para tablas de detalle (venta, merma, devolución…).
 * Muestra el/los lote(s) de un producto (código + caducidad) o "—" si no aplica.
 */
export function LoteCell({ lotes }: { lotes?: LoteRef[] }) {
  if (!lotes || lotes.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="flex flex-col gap-0.5">
      {lotes.map((l, i) => (
        <span key={i} className="text-[11px] leading-tight">
          <span className="font-medium">{l.codigo}</span>
          <span className="text-muted-foreground"> · cad. {fmtCad(l.fecha_caducidad)}</span>
        </span>
      ))}
    </div>
  );
}
