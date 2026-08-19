import { fmtNum, fmtDate } from '@/lib/utils';
import type { SurtidoHistorial } from '@/hooks/useSolicitudesTraspaso';

interface Props {
  solicitado: number;
  surtido: number;
  pendiente: number;
  origen?: string;
  destino?: string;
  surtidos: SurtidoHistorial[];
}

export function SolicitudResumen({ solicitado, surtido, pendiente, origen, destino, surtidos }: Props) {
  const cantidadDe = (s: SurtidoHistorial) =>
    (s.traspasos?.traspaso_lineas ?? []).reduce((acc, l) => acc + (Number(l.cantidad) || 0), 0);

  return (
    <div className="bg-card border border-border rounded p-3 grid grid-cols-2 md:grid-cols-5 gap-3 text-[12px]">
      <div><span className="text-muted-foreground block">Origen</span>{origen || '—'}</div>
      <div><span className="text-muted-foreground block">Destino</span>{destino || '—'}</div>
      <div><span className="text-muted-foreground block">Solicitado</span><span className="font-medium">{fmtNum(solicitado)}</span></div>
      <div><span className="text-muted-foreground block">Surtido</span><span className="font-medium">{fmtNum(surtido)}</span></div>
      <div>
        <span className="text-muted-foreground block">Pendiente</span>
        <span className={`font-medium ${pendiente > 0 ? 'text-destructive' : ''}`}>{fmtNum(pendiente)}</span>
      </div>
      {surtidos.length > 0 && (
        <div className="col-span-2 md:col-span-5 border-t border-border pt-2">
          <span className="text-muted-foreground">Surtidos ({surtidos.length})</span>
          <ul className="mt-1 space-y-0.5">
            {surtidos.map((s, i) => (
              <li key={s.id}>
                Surtido {i + 1} · {fmtDate(s.traspasos?.fecha ?? s.created_at)} · {fmtNum(cantidadDe(s))} piezas
                {s.traspasos?.folio ? ` · ${s.traspasos.folio}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default SolicitudResumen;
