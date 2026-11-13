import { useMemo, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useMermaMotivos, useRegistrarMerma } from '@/hooks/useMermas';
import { cn } from '@/lib/utils';

interface ProductoStock { id: string; nombre: string; codigo?: string | null; costo?: number | null; precio_principal?: number | null; stockRuta: number }

/**
 * El vendedor reporta producto dañado/caducado que trae a bordo: sale del stock de SU ruta
 * hacia el almacén Mermas (registrar_merma) y deja de estar disponible para vender.
 */
export function ReportarMermaSheet({ open, onOpenChange, almacenId, productos, onRegistrada }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  almacenId: string;
  productos: ProductoStock[];
  onRegistrada: () => void;
}) {
  const { data: motivos } = useMermaMotivos();
  const registrar = useRegistrarMerma();
  const [search, setSearch] = useState('');
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState('1');
  const [motivoId, setMotivoId] = useState('');
  const [observaciones, setObservaciones] = useState('');

  const disponibles = useMemo(() => productos
    .filter(p => p.stockRuta > 0)
    .filter(p => !search || p.nombre.toLowerCase().includes(search.toLowerCase())
      || (p.codigo ?? '').toLowerCase().includes(search.toLowerCase())), [productos, search]);
  const sel = productos.find(p => p.id === productoId) ?? null;
  const cant = Number(cantidad);

  const reset = () => { setSearch(''); setProductoId(null); setCantidad('1'); setMotivoId(''); setObservaciones(''); };

  const enviar = async () => {
    if (!sel) return toast.error('Elige el producto');
    if (!(cant > 0)) return toast.error('La cantidad debe ser mayor a 0');
    if (cant > sel.stockRuta) return toast.error(`Solo traes ${sel.stockRuta} de ${sel.nombre}`);
    if (!motivoId) return toast.error('Elige el motivo');
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return toast.error('Necesitas conexión para reportar la merma');
    }
    try {
      await registrar.mutateAsync({
        almacen_origen_id: almacenId,
        ruta_id: almacenId,
        motivo_id: motivoId,
        observaciones: observaciones || undefined,
        lineas: [{
          producto_id: sel.id,
          cantidad: cant,
          costo_unitario: Number(sel.costo) || 0,
          precio_venta_unitario: Number(sel.precio_principal) || 0,
        }],
      });
      reset();
      onOpenChange(false);
      onRegistrada();
    } catch (e: any) {
      toast.error(e?.message || 'No se pudo registrar la merma');
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <SheetContent side="bottom" className="max-h-[90dvh] overflow-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Reportar merma</SheetTitle>
        </SheetHeader>
        <p className="text-[12px] text-muted-foreground mt-1">
          Sale de tu stock a bordo y pasa al almacén Mermas. Ya no podrás venderlo.
        </p>

        {!sel ? (
          <div className="mt-3 space-y-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto a bordo..."
                className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
            <div className="divide-y divide-border border border-border rounded-lg max-h-[45dvh] overflow-auto">
              {disponibles.map(p => (
                <button key={p.id} onClick={() => setProductoId(p.id)} className="w-full flex items-center justify-between px-3 py-2.5 text-left active:bg-accent">
                  <span className="text-[13px] text-foreground truncate pr-2">{p.nombre}</span>
                  <span className="text-[12px] text-muted-foreground shrink-0">{p.stockRuta} a bordo</span>
                </button>
              ))}
              {disponibles.length === 0 && <p className="text-center text-[12px] text-muted-foreground py-6">No hay productos a bordo</p>}
            </div>
          </div>
        ) : (
          <div className="mt-3 space-y-3">
            <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground truncate">{sel.nombre}</p>
                <p className="text-[11px] text-muted-foreground">{sel.stockRuta} a bordo</p>
              </div>
              <button onClick={() => setProductoId(null)} className="text-[12px] text-primary font-semibold shrink-0">Cambiar</button>
            </div>
            <label className="block">
              <span className="text-[12px] font-medium text-foreground">Cantidad</span>
              <input
                type="number" inputMode="decimal" min={0} max={sel.stockRuta}
                value={cantidad} onChange={e => setCantidad(e.target.value)}
                className={cn('mt-1 w-full bg-card border rounded-lg px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-primary/30',
                  cant > sel.stockRuta ? 'border-destructive' : 'border-border')}
              />
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-foreground">Motivo</span>
              <select value={motivoId} onChange={e => setMotivoId(e.target.value)}
                className="mt-1 w-full bg-card border border-border rounded-lg px-3 py-2 text-[14px]">
                <option value="">Elige el motivo</option>
                {(motivos ?? []).map(m => <option key={m.id} value={m.id}>{m.nombre}</option>)}
              </select>
            </label>
            <label className="block">
              <span className="text-[12px] font-medium text-foreground">Observaciones (opcional)</span>
              <input value={observaciones} onChange={e => setObservaciones(e.target.value)}
                className="mt-1 w-full bg-card border border-border rounded-lg px-3 py-2 text-[14px]" />
            </label>
            <button
              onClick={enviar}
              disabled={registrar.isPending}
              className="w-full h-11 rounded-xl bg-destructive text-white font-semibold text-[14px] flex items-center justify-center gap-2 active:scale-[0.99] disabled:opacity-60"
            >
              {registrar.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              Reportar merma
            </button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
