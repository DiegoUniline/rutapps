import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { lineaVentaParaProducto, type ProductoAjuste } from '@/lib/ajusteEntrega';
import type { TarifaLineaRule } from '@/lib/priceResolver';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface Fila {
  id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  original: number;
  /** Producto que realmente se entregó, si fue otro. */
  nuevo?: ProductoAjuste & { nombre: string };
}

type RpcSinTipos = (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;

const PRODUCTO_COLS = 'id, nombre, codigo, precio_principal, costo, costo_incluye_impuestos, clasificacion_id, usa_listas_precio, lista_id, tiene_iva, iva_pct, tiene_ieps, ieps_pct, ieps_tipo, unidad_venta_id';

/**
 * Ajuste de una entrega YA ENTREGADA (D-009…D-012): cantidad real entregada y
 * producto equivocado. La BD (ajustar_entrega) mueve solo la diferencia de stock,
 * ajusta el pedido y recalcula el saldo en una sola operación.
 */
export function AjustarEntregaDialog({ entregaId, className, onDone }: { entregaId: string; className?: string; onDone?: () => void }) {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  const [open, setOpen] = useState(false);
  const [filas, setFilas] = useState<Fila[]>([]);
  const [destino, setDestino] = useState<'camion' | 'bodega'>('camion');
  const [cambiando, setCambiando] = useState<string | null>(null);
  const [buscar, setBuscar] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: base, isLoading } = useQuery({
    queryKey: ['ajustar-entrega', entregaId],
    enabled: open,
    queryFn: async () => {
      const { data: ent, error } = await supabase.from('entregas')
        .select('id, folio, updated_at, pedido_id, entrega_lineas(id, producto_id, cantidad_entregada, hecho, productos(nombre))')
        .eq('id', entregaId).single();
      if (error) throw error;
      let tarifaId: string | null = null;
      let listaId: string | null = null;
      if (ent.pedido_id) {
        const { data: ped, error: pErr } = await supabase.from('ventas')
          .select('tarifa_id, clientes(tarifa_id, lista_precio_id)').eq('id', ent.pedido_id).single();
        if (pErr) throw pErr;
        const cli = ped?.clientes as { tarifa_id: string | null; lista_precio_id: string | null } | null;
        tarifaId = ped?.tarifa_id ?? cli?.tarifa_id ?? null;
        listaId = cli?.lista_precio_id ?? null;
      }
      const rules = tarifaId
        ? await fetchAllPages<TarifaLineaRule>((from, to) => supabase.from('tarifa_lineas')
            .select('aplica_a, producto_ids, clasificacion_ids, grupos, tipo_calculo, precio, precio_minimo, margen_pct, descuento_pct, redondeo, base_precio, lista_precio_id')
            .eq('tarifa_id', tarifaId).order('created_at').order('id').range(from, to))
        : [];
      const lineas = (ent.entrega_lineas ?? []) as { id: string; producto_id: string; cantidad_entregada: number; hecho: boolean; productos: { nombre: string } | null }[];
      setFilas(lineas.filter(l => l.hecho).map(l => ({
        id: l.id, producto_id: l.producto_id, nombre: l.productos?.nombre ?? 'Producto',
        cantidad: Number(l.cantidad_entregada) || 0, original: Number(l.cantidad_entregada) || 0,
      })));
      return { updated_at: ent.updated_at as string | null, folio: ent.folio as string | null, rules, listaId };
    },
  });

  const { data: productos } = useQuery({
    queryKey: ['ajustar-entrega-productos', empresa?.id],
    enabled: open && !!cambiando && !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('productos').select(PRODUCTO_COLS)
        .eq('empresa_id', empresa!.id).eq('status', 'activo').order('nombre');
      if (error) throw error;
      return (data ?? []) as unknown as (ProductoAjuste & { nombre: string; codigo: string | null })[];
    },
  });

  const hayRegreso = filas.some(f => f.nuevo || f.cantidad < f.original);

  const guardar = async () => {
    if (!base) return;
    if (filas.some(f => !(f.cantidad >= 0))) { toast.error('Revisa las cantidades'); return; }
    setSaving(true);
    try {
      const pLineas = filas.map(f => ({
        id: f.id,
        producto_id: f.nuevo?.id ?? f.producto_id,
        cantidad_entregada: f.cantidad,
        ...(f.nuevo ? { unidad_id: f.nuevo.unidad_venta_id ?? null, venta_linea: lineaVentaParaProducto(f.nuevo, base.rules, base.listaId, f.cantidad) } : {}),
      }));
      const { error } = await (supabase.rpc as unknown as RpcSinTipos)('ajustar_entrega', {
        p_entrega_id: entregaId, p_lineas: pLineas, p_destino: destino, p_version: base.updated_at,
      });
      if (error) throw new Error(error.message);
      toast.success('Entrega ajustada: stock, pedido y saldo actualizados');
      ['entrega', 'entregas-list', 'venta', 'ventas', 'ajustar-entrega'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo ajustar');
    } finally {
      setSaving(false);
    }
  };

  const filtrados = (productos ?? []).filter(p => !buscar || `${p.nombre} ${p.codigo ?? ''}`.toLowerCase().includes(buscar.toLowerCase())).slice(0, 30);

  return (
    <>
      <Button size="sm" variant="outline" className={className ?? 'h-8 text-xs gap-1.5'} onClick={() => setOpen(true)}>
        <Wrench className="h-3.5 w-3.5" /> Ajustar entrega
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle>Ajustar entrega {base?.folio ?? ''}</DialogTitle>
            <DialogDescription>Captura lo que el cliente realmente recibió. Se mueve solo la diferencia de stock y el pedido se ajusta a lo entregado.</DialogDescription>
          </DialogHeader>
          {isLoading ? <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div> : (
            <div className="space-y-3">
              {filas.map(f => (
                <div key={f.id} className="border border-border rounded-md p-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 min-w-0 text-sm">
                      <div className={f.nuevo ? 'line-through text-muted-foreground truncate' : 'truncate'}>{f.nombre}</div>
                      {f.nuevo && <div className="font-medium truncate">Se entregó: {f.nuevo.nombre}</div>}
                    </div>
                    <Input type="number" min={0} className="w-24 h-8" value={f.cantidad}
                      onChange={e => setFilas(prev => prev.map(x => x.id === f.id ? { ...x, cantidad: Number(e.target.value) } : x))} />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setCambiando(cambiando === f.id ? null : f.id); setBuscar(''); }}>
                      {f.nuevo ? 'Cambiar otra vez' : 'Se entregó otro producto'}
                    </Button>
                    {f.nuevo && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setFilas(prev => prev.map(x => x.id === f.id ? { ...x, nuevo: undefined } : x))}>Deshacer cambio</Button>}
                  </div>
                  {cambiando === f.id && (
                    <div className="space-y-1">
                      <Input placeholder="Buscar producto…" className="h-8" value={buscar} onChange={e => setBuscar(e.target.value)} />
                      <div className="max-h-48 overflow-y-auto border border-border rounded">
                        {filtrados.filter(p => p.id !== f.producto_id).map(p => (
                          <button key={p.id} className="w-full text-left px-2 py-1.5 text-sm hover:bg-accent"
                            onClick={() => { setFilas(prev => prev.map(x => x.id === f.id ? { ...x, nuevo: p } : x)); setCambiando(null); }}>
                            {p.nombre} {p.codigo ? <span className="text-muted-foreground text-xs">· {p.codigo}</span> : null}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {hayRegreso && (
                <div className="text-sm space-y-1">
                  <div className="font-medium">Lo que no se entregó regresa a:</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant={destino === 'camion' ? 'default' : 'outline'} onClick={() => setDestino('camion')}>Camión del repartidor</Button>
                    <Button size="sm" variant={destino === 'bodega' ? 'default' : 'outline'} onClick={() => setDestino('bodega')}>Bodega</Button>
                  </div>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cerrar</Button>
            <Button onClick={guardar} disabled={saving || isLoading || filas.length === 0}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Guardar ajuste
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
