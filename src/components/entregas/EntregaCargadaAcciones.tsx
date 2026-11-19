import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Ban, MinusCircle, Truck, UserRoundCog, Warehouse } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RpcSinTipos } from '@/lib/excedente';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface LineaCargada {
  id: string;
  nombre: string;
  cargada: number;
}

type Destino = 'camion' | 'bodega';

interface Props {
  entregaId: string;
  folio?: string | null;
  version?: string | null;
  vendedorActualId?: string | null;
  lineas: LineaCargada[];
  vendedores: { id: string; nombre: string }[];
  onDone?: () => void;
}

const rpc = (fn: string, args: Record<string, unknown>) =>
  (supabase.rpc.bind(supabase) as unknown as RpcSinTipos)(fn, args);

/** Elegir a dónde va la mercancía quitada (D-030). */
function DestinoSelector({ value, onChange }: { value: Destino; onChange: (d: Destino) => void }) {
  const opciones: { key: Destino; label: string; desc: string; icon: typeof Truck }[] = [
    { key: 'camion', label: 'Se queda en el camión', desc: 'Se regresa con la descarga.', icon: Truck },
    { key: 'bodega', label: 'Regresa a bodega', desc: 'Sale del camión y vuelve al almacén de surtido.', icon: Warehouse },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opciones.map(o => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          className={cn(
            'text-left rounded-lg border p-2.5 transition-colors',
            value === o.key ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
          )}
        >
          <span className="flex items-center gap-1.5 text-[13px] font-semibold">
            <o.icon className="h-4 w-4" /> {o.label}
          </span>
          <span className="block text-[11px] text-muted-foreground mt-0.5">{o.desc}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Acciones de una entrega asignada / cargada / en ruta (D-030): quitar productos, reasignar
 * repartidor (mueve el stock de camión, D-022) y cancelar. Todo en una operación de la BD.
 */
export function EntregaCargadaAcciones({ entregaId, folio, version, vendedorActualId, lineas, vendedores, onDone }: Props) {
  const qc = useQueryClient();
  const [modo, setModo] = useState<'quitar' | 'reasignar' | 'cancelar' | null>(null);
  const [destino, setDestino] = useState<Destino>('camion');
  const [cantidades, setCantidades] = useState<Record<string, string>>({});
  const [vendedorDestino, setVendedorDestino] = useState('');
  const [motivo, setMotivo] = useState('');
  const [saving, setSaving] = useState(false);

  const abrir = (m: 'quitar' | 'reasignar' | 'cancelar') => {
    setDestino('camion');
    setMotivo('');
    setVendedorDestino('');
    setCantidades(Object.fromEntries(lineas.map(l => [l.id, String(l.cargada)])));
    setModo(m);
  };

  const terminar = (msg: string) => {
    toast.success(msg);
    for (const k of ['entrega', 'entregas', 'entregas-list', 'stock_almacen', 'stock-almacen', 'productos', 'venta', 'ventas', 'logistica']) {
      qc.invalidateQueries({ queryKey: [k] });
    }
    setModo(null);
    onDone?.();
  };

  const guardarQuitar = async () => {
    const cambios = lineas
      .map(l => ({ id: l.id, cantidad: Number(cantidades[l.id] ?? l.cargada), cargada: l.cargada, nombre: l.nombre }))
      .filter(c => c.cantidad !== c.cargada);
    const malo = cambios.find(c => !Number.isFinite(c.cantidad) || c.cantidad < 0 || c.cantidad > c.cargada);
    if (malo) { toast.error(`"${malo.nombre}": la cantidad debe ir de 0 a ${malo.cargada}.`); return; }
    if (cambios.length === 0) { toast.info('No hay cambios.'); return; }
    setSaving(true);
    const { error } = await rpc('ajustar_entrega_cargada', {
      p_entrega_id: entregaId,
      p_lineas: cambios.map(c => ({ id: c.id, cantidad: c.cantidad })),
      p_destino: destino,
      p_version: version ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    terminar(destino === 'bodega' ? 'Productos quitados y regresados a bodega' : 'Productos quitados (se quedan en el camión)');
  };

  const guardarReasignar = async () => {
    if (!vendedorDestino) { toast.error('Elige el nuevo repartidor.'); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { error } = await rpc('reasignar_entregas_bulk', {
      p_entrega_ids: [entregaId],
      p_target_vendedor_id: vendedorDestino,
      p_user_id: auth.user?.id ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    terminar('Entrega reasignada; el stock se movió al camión del nuevo repartidor');
  };

  const guardarCancelar = async () => {
    setSaving(true);
    const { error } = await rpc('cancelar_entrega_cargada', {
      p_entrega_id: entregaId,
      p_destino: destino,
      p_motivo: motivo || null,
      p_version: version ?? null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    terminar(destino === 'bodega' ? 'Entrega cancelada; la mercancía regresó a bodega' : 'Entrega cancelada; la mercancía se queda en el camión');
  };

  const otrosVendedores = vendedores.filter(v => v.id !== vendedorActualId);

  return (
    <>
      <Button size="sm" variant="outline" className="text-xs" onClick={() => abrir('reasignar')}>
        <UserRoundCog className="h-3.5 w-3.5" /> Reasignar
      </Button>
      <Button size="sm" variant="destructive" className="text-xs" onClick={() => abrir('cancelar')}>
        <Ban className="h-3.5 w-3.5" /> Cancelar
      </Button>
      <Button size="sm" variant="editar" className="text-xs" onClick={() => abrir('quitar')}>
        <MinusCircle className="h-3.5 w-3.5" /> Quitar productos
      </Button>

      <Dialog open={modo === 'quitar'} onOpenChange={o => !o && setModo(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quitar productos · {folio}</DialogTitle>
            <DialogDescription>Escribe la cantidad que sí se va a entregar. Solo se puede bajar.</DialogDescription>
          </DialogHeader>
          <div className="max-h-[45vh] overflow-y-auto divide-y divide-border border border-border rounded-md">
            {lineas.map(l => (
              <div key={l.id} className="flex items-center gap-3 px-3 py-2">
                <span className="flex-1 min-w-0 text-[13px] truncate">{l.nombre}</span>
                <span className="text-[11px] text-muted-foreground whitespace-nowrap">cargado {l.cargada}</span>
                <Input
                  type="number"
                  min={0}
                  max={l.cargada}
                  step="any"
                  className="w-24 h-8 text-right"
                  value={cantidades[l.id] ?? ''}
                  onChange={e => setCantidades(p => ({ ...p, [l.id]: e.target.value }))}
                />
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium">¿A dónde va lo que quitas?</p>
            <DestinoSelector value={destino} onChange={setDestino} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModo(null)}>Cerrar</Button>
            <Button onClick={guardarQuitar} disabled={saving}>Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modo === 'reasignar'} onOpenChange={o => !o && setModo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Reasignar · {folio}</DialogTitle>
            <DialogDescription>La mercancía cargada pasa del camión actual al del nuevo repartidor.</DialogDescription>
          </DialogHeader>
          <select
            className="input-odoo w-full"
            value={vendedorDestino}
            onChange={e => setVendedorDestino(e.target.value)}
          >
            <option value="">Elige repartidor…</option>
            {otrosVendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
          </select>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModo(null)}>Cerrar</Button>
            <Button onClick={guardarReasignar} disabled={saving || !vendedorDestino}>Reasignar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modo === 'cancelar'} onOpenChange={o => !o && setModo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Cancelar entrega · {folio}</DialogTitle>
            <DialogDescription>Lo pendiente del pedido vuelve a quedar por entregar.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <p className="text-[12px] font-medium">¿A dónde va la mercancía cargada?</p>
            <DestinoSelector value={destino} onChange={setDestino} />
          </div>
          <Input placeholder="Motivo (opcional)" value={motivo} onChange={e => setMotivo(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setModo(null)}>No cancelar</Button>
            <Button variant="destructive" onClick={guardarCancelar} disabled={saving}>Cancelar entrega</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
