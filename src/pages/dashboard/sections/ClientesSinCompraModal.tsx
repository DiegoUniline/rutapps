import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';

interface Cliente {
  id: string; nombre: string; vendedor_id?: string | null; ultimaCompra?: string | null; diasSinCompra: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  clientes: Cliente[];
}

export default function ClientesSinCompraModal({ open, onClose, clientes }: Props) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto z-[60]">
        <DialogHeader><DialogTitle>Clientes sin compra 30+ días ({clientes.length})</DialogTitle></DialogHeader>
        {clientes.length === 0 ? (
          <div className="text-sm text-muted-foreground py-4">Todos tus clientes activos han comprado en los últimos 30 días.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2">Cliente</th>
                <th className="text-left py-2">Última compra</th>
                <th className="text-right py-2">Días sin compra</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c) => (
                <tr key={c.id} className="border-b border-border/40">
                  <td className="py-2 font-medium">{c.nombre}</td>
                  <td className="py-2 text-xs">{c.ultimaCompra ? format(new Date(c.ultimaCompra), 'dd/MM/yyyy') : 'Nunca'}</td>
                  <td className="py-2 text-right tabular-nums">{c.diasSinCompra}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </DialogContent>
    </Dialog>
  );
}
