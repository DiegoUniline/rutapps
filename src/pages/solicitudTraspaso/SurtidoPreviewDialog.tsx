import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { fmtNum } from '@/lib/utils';
import type { PreviewSurtidoLinea } from '@/hooks/useSolicitudesTraspaso';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lineas: PreviewSurtidoLinea[];
  cargando?: boolean;
  ejecutando?: boolean;
  onConfirm: () => void;
}

export function SurtidoPreviewDialog({ open, onOpenChange, lineas, cargando, ejecutando, onConfirm }: Props) {
  const pendiente = lineas.reduce((s, l) => s + l.cantidad_pendiente, 0);
  const surtible = lineas.reduce((s, l) => s + l.cantidad_surtible, 0);
  const faltantes = lineas.filter(l => l.cantidad_surtible < l.cantidad_pendiente);
  const completo = pendiente > 0 && surtible >= pendiente;
  const nada = surtible <= 0;

  const textoBoton = nada
    ? 'Sin existencia'
    : completo
      ? 'Surtir todo'
      : `Enviar ${fmtNum(surtible)} piezas`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl z-[60] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Surtir pendientes</DialogTitle>
        </DialogHeader>

        {cargando ? (
          <p className="text-[13px] text-muted-foreground py-4">Consultando existencias reales del almacén origen...</p>
        ) : (
          <div className="space-y-3 text-[13px]">
            {completo ? (
              <p className="text-primary font-medium">Todo el inventario solicitado está disponible.</p>
            ) : nada ? (
              <p className="text-destructive font-medium">
                No hay existencia disponible en el almacén origen. Intenta más tarde o cierra el traspaso.
              </p>
            ) : (
              <p>
                Se pueden surtir <strong>{fmtNum(surtible)}</strong> de <strong>{fmtNum(pendiente)}</strong> piezas.{' '}
                {fmtNum(pendiente - surtible)} piezas quedarán pendientes en el mismo folio.
              </p>
            )}

            <div className="border border-border rounded max-h-72 overflow-auto">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-background">
                  <tr className="text-left text-muted-foreground border-b border-border">
                    <th className="px-2 py-1.5">Producto</th>
                    <th className="px-2 py-1.5 text-right">Pendiente</th>
                    <th className="px-2 py-1.5 text-right">Disponible</th>
                    <th className="px-2 py-1.5 text-right">Se enviará</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => {
                    const falta = l.cantidad_pendiente - l.cantidad_surtible;
                    return (
                      <tr key={l.linea_id} className="border-b border-border">
                        <td className="px-2 py-1">{l.codigo ? `${l.codigo} · ` : ''}{l.nombre}</td>
                        <td className="px-2 py-1 text-right">{fmtNum(l.cantidad_pendiente)}</td>
                        <td className="px-2 py-1 text-right">{fmtNum(l.disponible_origen)}</td>
                        <td className={`px-2 py-1 text-right ${falta > 0 ? 'text-destructive font-medium' : ''}`}>
                          {fmtNum(l.cantidad_surtible)} de {fmtNum(l.cantidad_pendiente)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {faltantes.length > 0 && (
              <div className="text-[12px] text-muted-foreground">
                <p className="font-medium text-foreground">Productos con faltante:</p>
                <ul className="list-disc pl-4">
                  {faltantes.map(l => (
                    <li key={l.linea_id}>{l.nombre}: faltan {fmtNum(l.cantidad_pendiente - l.cantidad_surtible)} piezas</li>
                  ))}
                </ul>
                <p className="mt-1">Lo faltante queda pendiente en el mismo folio y podrá surtirse después.</p>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <button className="btn-odoo" onClick={() => onOpenChange(false)}>Cancelar</button>
          <button className="btn-odoo-primary" disabled={cargando || ejecutando || nada} onClick={onConfirm}>
            {ejecutando ? 'Procesando...' : textoBoton}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SurtidoPreviewDialog;
