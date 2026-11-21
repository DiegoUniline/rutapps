import { RutaOperacionGate } from '@/components/ruta/RutaOperacionGate';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RotateCcw, Plus, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useCancelarDevolucion } from '@/hooks/useDevoluciones';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { usePermisos } from '@/hooks/usePermisos';
import MobileNoAccess from '@/components/ruta/MobileNoAccess';
import { useCurrency } from '@/hooks/useCurrency';
import { useDateFilter } from '@/hooks/useDateFilter';
import DateFilterBar from '@/components/ruta/DateFilterBar';
import DatePresetButtons from '@/components/ruta/DatePresetButtons';
import { fmtDate } from '@/lib/utils';
import { DESTINO_DEVOLUCION_CORTO } from '@/lib/devolucionGuardado';
import { ACCION_DEVOLUCION_LABELS, MOTIVO_DEVOLUCION_LABELS } from '@/lib/ticketModelo';

interface DevolucionRow {
  id: string;
  tipo: string;
  fecha: string;
  cliente_id: string | null;
  cancelado_at?: string | null;
  cancelado_motivo?: string | null;
  _offline?: boolean;
}
interface LineaRow {
  id: string;
  devolucion_id: string;
  producto_id: string;
  cantidad: number;
  motivo: string;
  accion: string;
  monto_credito: number | null;
  destino?: string | null;
  aplica_venta?: boolean | null;
}

/**
 * Devoluciones de ruta (D-049): ya no existe «Al almacén» (lo que sobra regresa con la
 * descarga de la liquidación). «Nueva devolución» abre el flujo único con cliente
 * (destino por renglón, precio de lista, acción de dinero). Aquí: historial, detalle y
 * cancelar (F2).
 */
function RutaDevolucionInner() {
  const navigate = useNavigate();
  const { profile, empresa } = useAuth();
  const { hasPermisoMovil } = usePermisos();
  const { fmt } = useCurrency();
  const { desde, hasta, setDesde, setHasta, filterByDate } = useDateFilter();
  const cancelar = useCancelarDevolucion();
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [motivoCancel, setMotivoCancel] = useState('');
  const [pidiendoMotivo, setPidiendoMotivo] = useState(false);

  const vendedorId = profile?.id;

  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: historial } = useOfflineQuery('devoluciones', {
    empresa_id: empresa?.id,
    vendedor_id: vendedorId,
  }, { enabled: !!empresa?.id && !!vendedorId, orderBy: 'created_at', ascending: false });
  const { data: lineas } = useOfflineQuery('devolucion_lineas',
    detalleId ? { devolucion_id: detalleId } : undefined,
    { enabled: !!detalleId });

  const clienteMap = useMemo(() => new Map(((clientes ?? []) as { id: string; nombre: string }[]).map(c => [c.id, c.nombre])), [clientes]);
  const productoMap = useMemo(() => new Map(((productos ?? []) as { id: string; nombre: string }[]).map(p => [p.id, p.nombre])), [productos]);
  const filteredHistorial = useMemo(
    () => filterByDate((historial ?? []) as unknown as DevolucionRow[], 'fecha'),
    [historial, filterByDate],
  );
  const detalle = useMemo(
    () => ((historial ?? []) as unknown as DevolucionRow[]).find(d => d.id === detalleId) ?? null,
    [historial, detalleId],
  );
  const detalleLineas = (lineas ?? []) as unknown as LineaRow[];

  if (!hasPermisoMovil('ruta.devoluciones')) {
    return <MobileNoAccess titulo="Sin permiso" mensaje="Tu rol no permite registrar devoluciones." />;
  }

  const cerrarDetalle = () => { setDetalleId(null); setPidiendoMotivo(false); setMotivoCancel(''); };
  const confirmarCancelacion = async () => {
    if (!detalle) return;
    await cancelar.mutateAsync({ id: detalle.id, motivo: motivoCancel });
    cerrarDetalle();
  };
  const online = typeof navigator === 'undefined' || navigator.onLine;

  return (
    <div className="flex flex-col h-[100dvh] bg-background">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={() => navigate('/ruta')} aria-label="Regresar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
            <ArrowLeft className="h-[18px] w-[18px] text-foreground" />
          </button>
          <span className="text-[15px] font-semibold text-foreground flex-1 flex items-center gap-2">
            <RotateCcw className="h-4 w-4 text-primary" /> Devoluciones
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-auto px-4 py-4 space-y-4">
        <button
          onClick={() => navigate('/ruta/ventas/nueva?solo=devolucion')}
          className="w-full rounded-xl bg-primary text-primary-foreground p-3.5 text-left active:scale-[0.98] transition-all flex items-center gap-3"
        >
          <div className="w-9 h-9 rounded-lg bg-primary-foreground/15 flex items-center justify-center shrink-0">
            <Plus className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-bold">Nueva devolución</p>
            <p className="text-[11px] opacity-85">Cliente · vendible o merma en camión · nota, reposición o dinero</p>
          </div>
        </button>

        <div className="space-y-2">
          <h3 className="text-[13px] font-bold text-foreground">Historial</h3>
          <DateFilterBar desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
          <DatePresetButtons desde={desde} hasta={hasta} onDesdeChange={setDesde} onHastaChange={setHasta} />
          <div className="space-y-1.5">
            {filteredHistorial.length === 0 && (
              <p className="text-center text-muted-foreground text-[12px] py-6">Sin devoluciones en el periodo</p>
            )}
            {filteredHistorial.map(d => (
              <button key={d.id} onClick={() => setDetalleId(d.id)}
                className="w-full text-left bg-card border border-border rounded-xl p-3 flex items-center gap-3 active:scale-[0.99] transition-all">
                <div className="w-9 h-9 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
                  <RotateCcw className="h-4 w-4 text-destructive" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">
                    {d.cliente_id ? (clienteMap.get(d.cliente_id) ?? 'Cliente') : 'Al almacén (anterior)'}
                  </p>
                  <p className="text-[10.5px] text-muted-foreground">
                    {fmtDate(d.fecha)}{d._offline ? ' · por sincronizar' : ''}
                  </p>
                </div>
                {d.cancelado_at && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-destructive/10 text-destructive">Cancelada</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {detalle && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 px-3 h-12">
              <button onClick={cerrarDetalle} aria-label="Cerrar" className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
                <X className="h-[18px] w-[18px] text-foreground" />
              </button>
              <span className="text-[15px] font-semibold text-foreground flex-1 truncate">
                Devolución · {detalle.cliente_id ? (clienteMap.get(detalle.cliente_id) ?? 'Cliente') : 'Almacén'}
              </span>
            </div>
          </header>
          <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
            <p className="text-[11px] text-muted-foreground">{fmtDate(detalle.fecha)}</p>
            {detalle.cancelado_at && (
              <div className="rounded-lg bg-destructive/10 text-destructive text-[12px] px-3 py-2">
                Cancelada{detalle.cancelado_motivo ? `: ${detalle.cancelado_motivo}` : ''}
              </div>
            )}
            <div className="bg-card rounded-lg divide-y divide-border/60">
              {detalleLineas.map(l => (
                <div key={l.id} className="px-3 py-2">
                  <div className="flex justify-between gap-2 text-[12.5px]">
                    <span className="font-medium text-foreground truncate">{l.cantidad}x {productoMap.get(l.producto_id) ?? 'Producto'}</span>
                    {Number(l.monto_credito) > 0 && <span className="tabular-nums text-foreground shrink-0">{fmt(Number(l.monto_credito))}</span>}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {l.destino && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${l.destino === 'merma' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                        {DESTINO_DEVOLUCION_CORTO[l.destino] ?? l.destino}
                      </span>
                    )}
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-muted-foreground">
                      {l.aplica_venta ? 'Nota aplicada a la venta' : (ACCION_DEVOLUCION_LABELS[l.accion] ?? l.accion)}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-accent text-muted-foreground">
                      {MOTIVO_DEVOLUCION_LABELS[l.motivo] ?? l.motivo}
                    </span>
                  </div>
                </div>
              ))}
              {detalleLineas.length === 0 && <p className="px-3 py-4 text-[12px] text-muted-foreground text-center">Sin renglones en el dispositivo</p>}
            </div>

            {!detalle.cancelado_at && pidiendoMotivo && (
              <div className="bg-card rounded-lg p-3 space-y-2">
                <label htmlFor="motivo-cancel" className="text-[12px] font-semibold text-foreground">Motivo de la cancelación</label>
                <textarea id="motivo-cancel" rows={3} value={motivoCancel} onChange={e => setMotivoCancel(e.target.value)}
                  className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                  placeholder="Ej. se capturó al cliente equivocado" />
                <p className="text-[10.5px] text-muted-foreground">Se revierte el inventario, la nota de crédito, el pago aplicado y el dinero devuelto.</p>
              </div>
            )}
          </div>
          {!detalle.cancelado_at && !detalle._offline && (
            <div className="px-3 pb-3 pt-1 safe-area-bottom">
              {!online && <p className="text-[11px] text-muted-foreground text-center mb-1.5">Para cancelar necesitas conexión.</p>}
              {pidiendoMotivo ? (
                <button onClick={confirmarCancelacion} disabled={!online || cancelar.isPending || !motivoCancel.trim()}
                  className="btn-cancelar w-full rounded-xl py-3 text-[14px] font-bold disabled:opacity-40">
                  {cancelar.isPending ? 'Cancelando…' : 'Cancelar devolución'}
                </button>
              ) : (
                <button onClick={() => setPidiendoMotivo(true)} disabled={!online}
                  className="btn-cancelar w-full rounded-xl py-3 text-[14px] font-bold disabled:opacity-40">
                  Cancelar devolución
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Portero offline: sin los datos indispensables en el dispositivo, la
 * operación no se puede iniciar (fail-closed).
 */
export default function RutaDevolucion() {
  return (
    <RutaOperacionGate operacion="devolucion">
      <RutaDevolucionInner />
    </RutaOperacionGate>
  );
}
