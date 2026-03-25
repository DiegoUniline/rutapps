import { useState } from 'react';
import { Search, Plus, Minus, Trash2, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import type { DevolucionItem, AccionDevolucion, MotivoDevolucion } from './types';
import { MOTIVOS, ACCIONES } from './types';

interface Props {
  clienteNombre: string;
  searchDevProducto: string;
  setSearchDevProducto: (v: string) => void;
  filteredDevProductos: any[] | undefined;
  devoluciones: DevolucionItem[];
  addDevolucion: (p: any) => void;
  updateDevQty: (pid: string, qty: number) => void;
  updateDevMotivo: (pid: string, motivo: DevolucionItem['motivo']) => void;
  updateDevAccion: (pid: string, accion: AccionDevolucion) => void;
  showReemplazoFor: string | null;
  setShowReemplazoFor: (v: string | null) => void;
  searchReemplazo: string;
  setSearchReemplazo: (v: string) => void;
  filteredReemplazoProductos: any[] | undefined;
  setReemplazo: (devPid: string, p: any) => void;
  processDevolucionesAndGoToProductos: () => void;
  fmt: (n: number) => string;
}

/* ── Chip selector ───────────────────────────────── */
function ChipSelect<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; icon?: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-all active:scale-95 ${
              active
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'bg-accent/70 text-muted-foreground hover:bg-accent'
            }`}
          >
            {o.icon && <span className="mr-0.5">{o.icon}</span>}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Compact action badge ────────────────────────── */
function AccionBadge({ accion }: { accion: AccionDevolucion }) {
  const a = ACCIONES.find(x => x.value === accion);
  if (!a) return null;
  return (
    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-accent text-[9px] font-medium text-muted-foreground whitespace-nowrap">
      {a.icon} {a.label}
    </span>
  );
}

function MotivoBadge({ motivo }: { motivo: MotivoDevolucion }) {
  const m = MOTIVOS.find(x => x.value === motivo);
  if (!m) return null;
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded-md bg-destructive/10 text-[9px] font-medium text-destructive/80 whitespace-nowrap">
      {m.label}
    </span>
  );
}

export function StepDevoluciones(props: Props) {
  const {
    clienteNombre, searchDevProducto, setSearchDevProducto, filteredDevProductos,
    devoluciones, addDevolucion, updateDevQty, updateDevMotivo, updateDevAccion,
    showReemplazoFor, setShowReemplazoFor, searchReemplazo, setSearchReemplazo,
    filteredReemplazoProductos, setReemplazo, processDevolucionesAndGoToProductos, fmt,
  } = props;

  // Global defaults
  const [defaultMotivo, setDefaultMotivo] = useState<MotivoDevolucion>('no_vendido');
  const [defaultAccion, setDefaultAccion] = useState<AccionDevolucion>('reposicion');
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  const [showDefaults, setShowDefaults] = useState(true);

  // Override addDevolucion to apply global defaults
  const handleAdd = (p: any) => {
    addDevolucion(p);
    // Apply global defaults after adding
    setTimeout(() => {
      updateDevMotivo(p.id, defaultMotivo);
      updateDevAccion(p.id, defaultAccion);
    }, 0);
  };

  // Apply defaults to all existing items
  const applyDefaultsToAll = () => {
    devoluciones.forEach(d => {
      updateDevMotivo(d.producto_id, defaultMotivo);
      updateDevAccion(d.producto_id, defaultAccion);
    });
  };

  const totalItems = devoluciones.reduce((s, d) => s + d.cantidad, 0);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 pt-2 pb-1 flex items-center gap-1.5">
        <div className="inline-flex items-center gap-1 bg-accent/60 rounded-md px-2 py-0.5">
          <span className="text-[10px] text-muted-foreground">Cliente:</span>
          <span className="text-[10.5px] font-semibold text-foreground">{clienteNombre}</span>
        </div>
        {devoluciones.length > 0 && (
          <span className="ml-auto text-[10px] text-destructive font-semibold bg-destructive/10 px-2 py-0.5 rounded-full">
            {totalItems} uds · {devoluciones.length} prod
          </span>
        )}
      </div>

      {/* Global defaults panel */}
      <div className="mx-3 mb-2 rounded-xl bg-card border border-border overflow-hidden">
        <button
          onClick={() => setShowDefaults(!showDefaults)}
          className="w-full flex items-center justify-between px-3 py-2"
        >
          <span className="text-[11px] font-semibold text-foreground">Motivo y acción por defecto</span>
          {showDefaults ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </button>
        {showDefaults && (
          <div className="px-3 pb-2.5 space-y-2 border-t border-border/50 pt-2">
            <div>
              <span className="text-[10px] text-muted-foreground mb-1 block">Motivo</span>
              <ChipSelect options={MOTIVOS} value={defaultMotivo} onChange={v => setDefaultMotivo(v as MotivoDevolucion)} />
            </div>
            <div>
              <span className="text-[10px] text-muted-foreground mb-1 block">Acción</span>
              <ChipSelect options={ACCIONES} value={defaultAccion} onChange={v => setDefaultAccion(v as AccionDevolucion)} />
            </div>
            {devoluciones.length > 0 && (
              <button
                onClick={applyDefaultsToAll}
                className="w-full text-[11px] font-medium text-primary bg-primary/10 rounded-lg py-1.5 active:scale-[0.98] transition-all"
              >
                Aplicar a los {devoluciones.length} productos
              </button>
            )}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="px-3 pb-1.5">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar producto a devolver..."
            className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
            value={searchDevProducto}
            onChange={e => setSearchDevProducto(e.target.value)}
          />
        </div>
      </div>

      {/* Product list */}
      <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
        {filteredDevProductos?.map(p => {
          const dev = devoluciones.find(d => d.producto_id === p.id);
          const qty = dev?.cantidad ?? 0;
          const isExpanded = expandedItem === p.id;

          return (
            <div key={p.id} className={`rounded-lg transition-all ${qty > 0 ? 'bg-destructive/[0.04] ring-1 ring-destructive/20' : 'bg-card'}`}>
              {/* Compact product row */}
              <div className="flex items-center gap-2 px-3 py-1.5">
                <div
                  className="flex-1 min-w-0"
                  onClick={() => {
                    if (!dev) {
                      handleAdd(p);
                    } else {
                      setExpandedItem(isExpanded ? null : p.id);
                    }
                  }}
                >
                  <p className="text-[12px] font-medium text-foreground truncate leading-tight">{p.nombre}</p>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[9.5px] text-muted-foreground font-mono">{p.codigo}</span>
                    {qty > 0 && dev && (
                      <>
                        <MotivoBadge motivo={dev.motivo} />
                        <AccionBadge accion={dev.accion} />
                      </>
                    )}
                  </div>
                </div>

                {qty > 0 ? (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => updateDevQty(p.id, qty - 1)} className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90 transition-transform">
                      {qty === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                    </button>
                    <input
                      type="number" inputMode="numeric"
                      className="w-8 text-center text-[13px] font-bold bg-transparent focus:outline-none py-0.5 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none text-foreground"
                      value={qty}
                      onChange={e => { const val = parseInt(e.target.value); if (!isNaN(val)) updateDevQty(p.id, val); }}
                      onFocus={e => e.target.select()}
                    />
                    <button onClick={() => updateDevQty(p.id, qty + 1)} className="w-7 h-7 rounded-md bg-destructive/80 text-destructive-foreground flex items-center justify-center active:scale-90 transition-transform">
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <button onClick={() => handleAdd(p)} className="w-7 h-7 rounded-lg bg-accent hover:bg-destructive/10 flex items-center justify-center text-destructive active:scale-90 transition-all shrink-0">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Expanded: override motivo/acción for this item */}
              {qty > 0 && isExpanded && dev && (
                <div className="px-3 pb-2.5 pt-1 border-t border-border/30 space-y-2">
                  <div>
                    <span className="text-[10px] text-muted-foreground mb-1 block">Motivo</span>
                    <ChipSelect options={MOTIVOS} value={dev.motivo} onChange={v => updateDevMotivo(p.id, v)} />
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground mb-1 block">Acción</span>
                    <ChipSelect options={ACCIONES} value={dev.accion} onChange={v => updateDevAccion(p.id, v)} />
                  </div>

                  {dev.accion === 'reposicion' && (
                    <button
                      onClick={() => setShowReemplazoFor(p.id)}
                      className="w-full bg-primary/5 border border-primary/20 rounded-lg px-3 py-2 text-left active:scale-[0.98] transition-all"
                    >
                      <span className="text-[11px] text-muted-foreground">
                        🔄 {dev.reemplazo_nombre || 'Mismo producto (toca para cambiar)'}
                      </span>
                    </button>
                  )}

                  {(dev.accion === 'nota_credito' || dev.accion === 'descuento_venta' || dev.accion === 'devolucion_dinero') && (
                    <p className="text-[10px] text-muted-foreground">
                      Valor: <span className="font-semibold text-foreground">${fmt(dev.precio_unitario * dev.cantidad)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Reemplazo fullscreen */}
      {showReemplazoFor && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 px-3 h-12">
              <button onClick={() => { setShowReemplazoFor(null); setSearchReemplazo(''); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent">
                <span className="text-[18px]">←</span>
              </button>
              <span className="text-[15px] font-semibold text-foreground flex-1">Producto de reemplazo</span>
            </div>
          </header>
          <div className="px-3 pt-2.5 pb-1.5">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                placeholder="Buscar producto..."
                className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40"
                value={searchReemplazo}
                onChange={e => setSearchReemplazo(e.target.value)}
                autoFocus
              />
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

      {/* Bottom CTA */}
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
        <button
          onClick={processDevolucionesAndGoToProductos}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3 text-[13px] font-bold active:scale-[0.98] transition-transform shadow-lg shadow-primary/20 flex items-center justify-center gap-1.5"
        >
          {devoluciones.length > 0 ? `Continuar con ${devoluciones.length} devolución(es)` : 'Sin devoluciones — Continuar'}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
