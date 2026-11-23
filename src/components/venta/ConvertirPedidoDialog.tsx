import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { ArrowRightLeft, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAlmacenes } from '@/hooks/useData';
import { useAuth } from '@/contexts/AuthContext';
import { almacenSalidaInicial, convertirPedidoAVentaDirecta, type ResultadoConversion } from '@/lib/convertirPedido';

interface Props {
  open: boolean;
  onClose: () => void;
  venta: { id: string; folio?: string | null; almacen_id?: string | null; vendedor_id?: string | null };
  /** Almacén del usuario actual (último respaldo si el pedido y su vendedor no tienen almacén). */
  almacenUsuarioId?: string | null;
  onConvertido: (r: ResultadoConversion) => void | Promise<void>;
}

/** D-062: elige el almacén de salida y convierte el pedido en venta directa (descuenta stock ahora). */
export function ConvertirPedidoDialog({ open, onClose, venta, almacenUsuarioId, onConvertido }: Props) {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const { data: almacenes, isLoading } = useAlmacenes();
  // Pedido sin almacén: se preselecciona el almacén de su vendedor.
  const { data: almacenVendedor, isFetched: vendedorListo } = useQuery({
    queryKey: ['convertir-pedido-almacen-vendedor', empresaId, venta.vendedor_id],
    enabled: open && !!empresaId && !venta.almacen_id && !!venta.vendedor_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('almacen_id').eq('empresa_id', empresaId!).eq('id', venta.vendedor_id!).maybeSingle();
      if (error) throw error;
      return (data as { almacen_id: string | null } | null)?.almacen_id ?? null;
    },
  });
  const esperaVendedor = !venta.almacen_id && !!venta.vendedor_id && !!empresaId && !vendedorListo;
  const [almacenId, setAlmacenId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open || esperaVendedor) return;
    setAlmacenId(prev => prev || almacenSalidaInicial(venta.almacen_id, almacenVendedor ?? almacenUsuarioId, almacenes ?? []));
  }, [open, almacenes, venta.almacen_id, almacenVendedor, almacenUsuarioId, esperaVendedor]);

  const confirmar = async () => {
    if (busy) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      toast.error('Necesitas conexión para convertir');
      return;
    }
    if (!almacenId) { toast.error('Elige el almacén de salida'); return; }
    setBusy(true);
    try {
      const r = await convertirPedidoAVentaDirecta(venta.id, almacenId);
      toast.success(r.ya_convertido ? 'Este pedido ya era venta directa' : `Pedido ${venta.folio ?? ''} convertido en venta directa`);
      onClose();
      await onConvertido(r);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo convertir el pedido');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader className="items-center text-center sm:text-center gap-2 space-y-0">
          <div className="h-11 w-11 rounded-full bg-warning/15 flex items-center justify-center">
            <ArrowRightLeft className="h-5 w-5 text-warning" />
          </div>
          <DialogTitle>Convertir {venta.folio ?? 'pedido'} a venta directa</DialogTitle>
          <DialogDescription className="text-[12px]">Conserva folio, productos, precios y cobros.</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="convertir-almacen" className="text-[12px] font-medium text-foreground">Almacén de salida</label>
          <select
            id="convertir-almacen"
            value={almacenId}
            onChange={e => setAlmacenId(e.target.value)}
            disabled={busy || isLoading}
            className="w-full border border-border rounded-md px-2 py-2 text-sm bg-background"
          >
            {!almacenId && <option value="">{isLoading ? 'Cargando almacenes…' : 'Elige un almacén'}</option>}
            {(almacenes ?? []).map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-warning/10 border border-warning/30 p-3 text-[12px] text-foreground">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>Se descontará el stock ahora de este almacén. El pedido deja de ir a Entregas y queda como venta confirmada.</span>
        </div>

        <DialogFooter className="gap-2 sm:space-x-0">
          <Button variant="cancelar" onClick={onClose} disabled={busy}>Cancelar</Button>
          <Button onClick={confirmar} disabled={busy || !almacenId}>
            <ArrowRightLeft className="h-4 w-4" /> {busy ? 'Convirtiendo…' : 'Convertir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
