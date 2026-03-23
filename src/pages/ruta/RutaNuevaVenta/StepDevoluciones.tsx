import { Search, Plus, Minus, Trash2, ArrowLeft, ArrowRightLeft, ChevronRight } from 'lucide-react';
import type { DevolucionItem } from './types';
import { MOTIVOS } from './types';

interface Props {
  clienteNombre: string;
  searchDevProducto: string;
  setSearchDevProducto: (v: string) => void;
  filteredDevProductos: any[] | undefined;
  devoluciones: DevolucionItem[];
  addDevolucion: (p: any) => void;
  updateDevQty: (pid: string, qty: number) => void;
  updateDevMotivo: (pid: string, motivo: DevolucionItem['motivo']) => void;
  showReemplazoFor: string | null;
  setShowReemplazoFor: (v: string | null) => void;
  searchReemplazo: string;
  setSearchReemplazo: (v: string) => void;
  filteredReemplazoProductos: any[] | undefined;
  setReemplazo: (devPid: string, p: any) => void;
  processDevolucionesAndGoToProductos: () => void;
  fmt: (n: number) => string;
}

export function StepDevoluciones(props: Props) {
  const { clienteNombre, searchDevProducto, setSearchDevProducto, filteredDevProductos, devoluciones, addDevolucion, updateDevQty, updateDevMotivo, showReemplazoFor, setShowReemplazoFor, searchReemplazo, setSearchReemplazo, filteredReemplazoProductos, setReemplazo, processDevolucionesAndGoToProductos, fmt } = props;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
        <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
          <span className="text-[10px] text-muted-foreground">Cliente:</span>
          <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
        </div>
      </div>
      <div className="px-3 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input type="text" placeholder="Buscar producto..." className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
            value={searchDevProducto} onChange={e => setSearchDevProducto(e.target.value)} />
        </div>
      </div>
      <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
        {filteredDevProductos?.map(p => {
          const dev = devoluciones.find(d => d.producto_id === p.id);
          const qty = dev?.cantidad ?? 0;
          return (
            <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${qty > 0 ? 'bg-destructive/[0.04] ring-1 ring-destructive/20' : 'bg-card'}`}>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0" onClick={() => !dev && addDevolucion(p)}>
                  <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                  <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                </div>
                {qty > 0 ? (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => updateDevQty(p.id, qty - 1)} className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                      {qty === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                    </button>
                    <input type="number" inputMode="numeric" className="w-9 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                      value={qty} onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val)) updateDevQty(p.id, val); }} onFocus={e => e.target.select()} />
                    <button onClick={() => updateDevQty(p.id, qty + 1)} className="w-7 h-7 rounded-md bg-destructive/80 text-destructive-foreground flex items-center justify-center active:scale-90 transition-transform"><Plus className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => addDevolucion(p)} className="w-8 h-8 rounded-lg bg-accent hover:bg-destructive/10 flex items-center justify-center text-destructive active:scale-90 transition-all shrink-0"><Plus className="h-4 w-4" /></button>
                )}
              </div>
              {qty > 0 && dev && (
                <div className="mt-1.5 flex items-center gap-2">
                  <select value={dev.motivo} onChange={e => updateDevMotivo(p.id, e.target.value as any)} className="flex-1 bg-accent/40 rounded-lg px-2 py-1.5 text-[11px] text-foreground focus:outline-none focus:ring-1.5 focus:ring-primary/40">
                    {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                  {dev.motivo === 'cambio' && (
                    <button onClick={() => setShowReemplazoFor(p.id)} className="text-[10px] text-primary font-semibold flex items-center gap-0.5 shrink-0">
                      <ArrowRightLeft className="h-3 w-3" />{dev.reemplazo_nombre ? dev.reemplazo_nombre : 'Reemplazo'}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {showReemplazoFor && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 px-3 h-12">
              <button onClick={() => { setShowReemplazoFor(null); setSearchReemplazo(''); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent"><ArrowLeft className="h-[18px] w-[18px] text-foreground" /></button>
              <span className="text-[15px] font-semibold text-foreground flex-1">Producto de reemplazo</span>
            </div>
          </header>
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input type="text" placeholder="Buscar producto..." className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchReemplazo} onChange={e => setSearchReemplazo(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="flex-1 overflow-auto px-3 space-y-[3px]">
            {filteredReemplazoProductos?.map(p => (
              <button key={p.id} onClick={() => setReemplazo(showReemplazoFor, p)} className="w-full rounded-lg px-3 py-2.5 bg-card text-left active:scale-[0.98] transition-all">
                <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                <p className="text-[10px] text-muted-foreground">{p.codigo} · ${fmt(p.precio_principal ?? 0)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
        <button onClick={processDevolucionesAndGoToProductos} className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-bold active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5">
          {devoluciones.length > 0 ? `Continuar con ${devoluciones.length} devolución(es)` : 'Sin devoluciones — Continuar'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
