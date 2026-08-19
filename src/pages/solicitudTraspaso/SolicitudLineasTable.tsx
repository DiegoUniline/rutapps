import { Trash2 } from 'lucide-react';
import { fmtNum } from '@/lib/utils';
import type { StatusSolicitudTraspaso } from '@/hooks/useSolicitudesTraspaso';

export interface LineaEditable {
  id: string;
  producto_id: string;
  codigo: string;
  nombre: string;
  stock_actual_snapshot: number;
  stock_minimo_snapshot: number;
  stock_maximo_snapshot: number;
  cantidad_sugerida: number;
  cantidad_solicitada: number;
  cantidad_aprobada: number;
  cantidad_surtida: number;
}

interface Props {
  lineas: LineaEditable[];
  status: StatusSolicitudTraspaso;
  /** El usuario puede editar cantidades solicitadas (borrador). */
  editable: boolean;
  /** El usuario puede ajustar cantidades a aprobar/surtir. */
  aprobando: boolean;
  disponiblePorProducto?: Map<string, number>;
  onChange: (id: string, campo: 'cantidad_solicitada' | 'cantidad_aprobada', valor: number) => void;
  onRemove: (id: string) => void;
}

export function SolicitudLineasTable({
  lineas, status, editable, aprobando, disponiblePorProducto, onChange, onRemove,
}: Props) {
  if (lineas.length === 0) {
    return <p className="text-[12px] text-muted-foreground p-6 text-center">Sin productos en la solicitud.</p>;
  }

  const mostrarSurtido = status !== 'borrador' && status !== 'solicitada';

  return (
    <table className="w-full text-[12px]">
      <thead>
        <tr className="text-left text-muted-foreground border-b border-border">
          <th className="px-3 py-2">Código</th>
          <th className="px-3 py-2">Producto</th>
          <th className="px-3 py-2 text-right">Stock destino</th>
          <th className="px-3 py-2 text-right">Mín</th>
          <th className="px-3 py-2 text-right">Máx</th>
          <th className="px-3 py-2 text-right">Sugerido</th>
          <th className="px-3 py-2 text-right">Solicitado</th>
          <th className="px-3 py-2 text-right">Aprobado</th>
          {mostrarSurtido && <th className="px-3 py-2 text-right">Surtido</th>}
          {aprobando && <th className="px-3 py-2 text-right">Disp. origen</th>}
          {editable && <th className="px-3 py-2" />}
        </tr>
      </thead>
      <tbody>
        {lineas.map(l => {
          const disponible = disponiblePorProducto?.get(l.producto_id);
          const insuficiente = aprobando && disponible != null && l.cantidad_aprobada > disponible;
          return (
            <tr key={l.id} className="border-b border-border">
              <td className="px-3 py-1.5">{l.codigo}</td>
              <td className="px-3 py-1.5">{l.nombre}</td>
              <td className="px-3 py-1.5 text-right">{fmtNum(l.stock_actual_snapshot)}</td>
              <td className="px-3 py-1.5 text-right">{fmtNum(l.stock_minimo_snapshot)}</td>
              <td className="px-3 py-1.5 text-right">{fmtNum(l.stock_maximo_snapshot)}</td>
              <td className="px-3 py-1.5 text-right text-muted-foreground">{fmtNum(l.cantidad_sugerida)}</td>
              <td className="px-3 py-1.5 text-right">
                {editable ? (
                  <input
                    type="number" min={0} step="0.001"
                    className="input-odoo text-right !py-0.5 w-24 text-[12px]"
                    value={l.cantidad_solicitada}
                    onChange={e => onChange(l.id, 'cantidad_solicitada', Number(e.target.value))}
                  />
                ) : fmtNum(l.cantidad_solicitada)}
              </td>
              <td className="px-3 py-1.5 text-right">
                {aprobando ? (
                  <input
                    type="number" min={0} step="0.001"
                    className={`input-odoo text-right !py-0.5 w-24 text-[12px] ${insuficiente ? 'border-destructive text-destructive' : ''}`}
                    value={l.cantidad_aprobada}
                    onChange={e => onChange(l.id, 'cantidad_aprobada', Number(e.target.value))}
                  />
                ) : fmtNum(l.cantidad_aprobada)}
              </td>
              {mostrarSurtido && <td className="px-3 py-1.5 text-right">{fmtNum(l.cantidad_surtida)}</td>}
              {aprobando && (
                <td className={`px-3 py-1.5 text-right ${insuficiente ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                  {disponible != null ? fmtNum(disponible) : '—'}
                </td>
              )}
              {editable && (
                <td className="px-3 py-1.5 text-right">
                  <button onClick={() => onRemove(l.id)} className="text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
