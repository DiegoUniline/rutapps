import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Truck, Package, AlertTriangle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { usePermisos } from '@/hooks/usePermisos';
import { isCerradaParcial, totalEfectivoVenta, ventaCerradaBadgeLabel } from '@/lib/ventaCerrada';

interface Props {
  venta: any;
  fmt: (n: number) => string;
}

/**
 * Muestra con claridad la diferencia entre el "Pedido original" y lo
 * "Realmente entregado" cuando hay entrega parcial. Además permite cerrar
 * el pedido a lo entregado (RPC cerrar_pedido_parcial ya existente).
 *
 * - Estado normal (sin entrega parcial): no renderiza nada, TotalCard basta.
 * - Entrega parcial en curso: muestra dos tarjetas (Pedido / Entrega) + botón "Cerrar pedido a lo entregado".
 * - Cerrado: muestra tarjeta única con nota "cerrado a lo entregado".
 */
export function PedidoEntregaResumen({ venta, fmt }: Props) {
  const { hasPermiso } = usePermisos();
  const qc = useQueryClient();
  const [openCerrar, setOpenCerrar] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);

  const { data: entregas } = useQuery({
    queryKey: ['entregas-resumen-venta', venta?.id],
    enabled: !!venta?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entregas')
        .select('id, status, entrega_lineas(producto_id, cantidad_pedida, cantidad_entregada, hecho)')
        .eq('pedido_id', venta.id);
      if (error) throw error;
      return data ?? [];
    },
  });

  const isCerrado = isCerradaParcial(venta);
  const ventaLineas = (venta?.venta_lineas ?? []) as any[];
  const activas = (entregas ?? []).filter((e: any) => e.status !== 'cancelado');
  const hechas = activas.filter((e: any) => e.status === 'hecho');

  // Total entregado real: prorrateo por línea de venta.
  const lineTotalFull = (vl: any) => {
    const t = Number(vl?.total ?? 0);
    if (t > 0) return t;
    return Number(vl?.subtotal ?? 0) + Number(vl?.iva_monto ?? 0) + Number(vl?.ieps_monto ?? 0);
  };
  const entregadoPorProd = new Map<string, number>();
  for (const e of hechas) {
    for (const l of (e as any).entrega_lineas ?? []) {
      entregadoPorProd.set(l.producto_id, (entregadoPorProd.get(l.producto_id) ?? 0) + Number(l.cantidad_entregada ?? 0));
    }
  }
  let totalEntregado = 0;
  let pzasEntregadas = 0;
  let pzasPedidas = 0;
  for (const vl of ventaLineas) {
    const ped = Number(vl.cantidad ?? 0);
    const ent = Math.min(entregadoPorProd.get(vl.producto_id) ?? 0, ped);
    if (ped > 0) totalEntregado += lineTotalFull(vl) * (ent / ped);
    pzasPedidas += ped;
    pzasEntregadas += ent;
  }
  const totalPedido = Number(venta?.total ?? 0);
  const cobrado = Math.max(0, totalPedido - Number(venta?.saldo_pendiente ?? 0));
  const hayFaltante = pzasEntregadas + 0.0001 < pzasPedidas;
  const esParcial = hechas.length > 0 && hayFaltante;

  const politicaEntregado = venta?.politica_cobro === 'entregado';
  const puedeCerrar =
    !isCerrado &&
    esParcial &&
    politicaEntregado &&
    venta?.status === 'confirmado' &&
    venta?.tipo === 'pedido' &&
    hasPermiso('ventas', 'editar');

  // === Vista CERRADO ===
  if (isCerrado) {
    const totalReal = totalEfectivoVenta(venta);
    const saldo = Math.max(0, totalReal - cobrado);
    const label = ventaCerradaBadgeLabel(venta) ?? 'Cerrado';
    return (
      <div className="bg-warning/5 border border-warning/40 rounded-xl p-4 space-y-2">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-warning" />
          <span className="text-[12px] font-bold uppercase text-warning tracking-wider">{label}</span>
        </div>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <Metric label="Total (cerrado)" value={fmt(totalReal)} />
          <Metric label="Cobrado" value={fmt(cobrado)} />
          <Metric label="Saldo" value={fmt(saldo)} highlight={saldo > 0 ? 'warning' : undefined} />
        </div>
        {totalPedido > totalReal + 0.0001 && (
          <p className="text-[11px] text-muted-foreground pt-1">
            Pedido original {fmt(totalPedido)} · {pzasEntregadas} de {pzasPedidas} pza entregadas.
            Lo no entregado quedó cancelado al cerrar el pedido.
          </p>
        )}
      </div>
    );
  }

  // === Vista NORMAL sin entrega parcial: no renderizamos nada extra ===
  if (!esParcial) return null;

  // === Vista ENTREGA PARCIAL en curso ===
  const saldoEntrega = Math.max(0, totalEntregado - cobrado);
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="bg-card border border-border rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Package className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-[11px] font-semibold uppercase text-muted-foreground tracking-wider">Pedido original</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{pzasPedidas} pza pedidas</p>
          <p className="text-[20px] font-bold text-foreground leading-tight">{fmt(totalPedido)}</p>
        </div>
        <div className="bg-primary/5 border border-primary/30 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-primary" />
            <span className="text-[11px] font-semibold uppercase text-primary tracking-wider">Entrega realizada</span>
          </div>
          <p className="text-[11px] text-muted-foreground">{pzasEntregadas} de {pzasPedidas} pza entregadas</p>
          <p className="text-[20px] font-bold text-primary leading-tight">{fmt(totalEntregado)}</p>
          {saldoEntrega > 0 && (
            <p className="text-[11px] text-warning font-medium">Por cobrar de la entrega: {fmt(saldoEntrega)}</p>
          )}
        </div>
      </div>
      {puedeCerrar && (
        <button
          onClick={() => setOpenCerrar(true)}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-warning/50 bg-warning/10 text-warning py-2.5 text-[13px] font-semibold active:scale-[0.98]"
        >
          <Lock className="h-4 w-4" /> Cerrar pedido a lo entregado ({fmt(totalEntregado)})
        </button>
      )}

      {openCerrar && (
        <CerrarDialog
          venta={venta}
          totalPedido={totalPedido}
          totalEntregado={totalEntregado}
          cobrado={cobrado}
          pzasEntregadas={pzasEntregadas}
          pzasPedidas={pzasPedidas}
          fmt={fmt}
          ack={ack}
          setAck={setAck}
          busy={busy}
          onClose={() => { setOpenCerrar(false); setAck(false); }}
          onConfirm={async () => {
            setBusy(true);
            try {
              const { data: userRes } = await supabase.auth.getUser();
              const { error } = await supabase.rpc('cerrar_pedido_parcial', {
                p_venta_id: venta.id,
                p_user_id: userRes.user?.id ?? null,
              } as any);
              if (error) throw error;
              toast.success('Pedido cerrado a lo entregado.');
              setOpenCerrar(false);
              setAck(false);
              qc.invalidateQueries({ queryKey: ['venta', venta.id] });
              qc.invalidateQueries({ queryKey: ['entregas-resumen-venta', venta.id] });
              qc.invalidateQueries({ queryKey: ['ventas'] });
              qc.invalidateQueries({ queryKey: ['entregas'] });
              qc.invalidateQueries({ queryKey: ['cxc'] });
              qc.invalidateQueries({ queryKey: ['saldos'] });
            } catch (e: any) {
              toast.error(e.message || 'No se pudo cerrar el pedido');
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </div>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: 'warning' }) {
  return (
    <div className="text-center">
      <p className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</p>
      <p className={`text-[15px] font-bold ${highlight === 'warning' ? 'text-warning' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function CerrarDialog({
  venta, totalPedido, totalEntregado, cobrado, pzasEntregadas, pzasPedidas,
  fmt, ack, setAck, busy, onClose, onConfirm,
}: {
  venta: any;
  totalPedido: number; totalEntregado: number; cobrado: number;
  pzasEntregadas: number; pzasPedidas: number;
  fmt: (n: number) => string;
  ack: boolean; setAck: (v: boolean) => void;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const saldoFinal = Math.max(0, totalEntregado - cobrado);
  const faltantes = pzasPedidas - pzasEntregadas;
  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-card rounded-2xl w-full max-w-sm p-5 space-y-4 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex flex-col items-center text-center gap-2">
          <div className="h-11 w-11 rounded-full bg-warning/15 flex items-center justify-center">
            <AlertTriangle className="h-5 w-5 text-warning" />
          </div>
          <h3 className="text-[15px] font-bold text-foreground">Cerrar pedido {venta.folio}</h3>
          <p className="text-[12px] text-muted-foreground">Se entregaron {pzasEntregadas} de {pzasPedidas} pza.</p>
        </div>

        <div className="bg-accent/40 rounded-xl p-3.5 space-y-2 text-[12px]">
          <Row label="Pedido original" value={fmt(totalPedido)} muted />
          <Row label="Total nuevo (cerrado a entregado)" value={fmt(totalEntregado)} bold />
          <Row label="Cobrado" value={fmt(cobrado)} />
          <div className="border-t border-border pt-2">
            <Row label="Saldo a cobrar" value={fmt(saldoFinal)} highlight={saldoFinal > 0 ? 'warning' : undefined} bold />
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed">
          Las <b>{faltantes} pza</b> no entregadas se marcarán como <b>canceladas por cierre</b> y no generarán saldo.
          Esta acción no se puede deshacer.
        </p>

        <label className="flex items-start gap-2 text-[12px] text-foreground cursor-pointer">
          <input type="checkbox" checked={ack} onChange={e => setAck(e.target.checked)} className="mt-0.5" />
          <span>Entiendo, cerrar este pedido a lo entregado</span>
        </label>

        <div className="flex gap-2">
          <button onClick={onClose} disabled={busy} className="flex-1 bg-accent/60 text-foreground rounded-xl py-2.5 text-[13px] font-semibold active:scale-[0.98] disabled:opacity-40">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!ack || busy}
            className="flex-1 bg-warning text-warning-foreground rounded-xl py-2.5 text-[13px] font-bold active:scale-[0.98] disabled:opacity-40 flex items-center justify-center gap-1.5"
          >
            <Lock className="h-4 w-4" /> {busy ? 'Cerrando…' : 'Confirmar cierre'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted, bold, highlight }: { label: string; value: string; muted?: boolean; bold?: boolean; highlight?: 'warning' }) {
  return (
    <div className="flex justify-between items-baseline">
      <span className={`${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
      <span className={`tabular-nums ${bold ? 'font-bold' : ''} ${highlight === 'warning' ? 'text-warning' : muted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>{value}</span>
    </div>
  );
}
