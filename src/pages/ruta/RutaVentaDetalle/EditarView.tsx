import { ArrowLeft, Save, Plus, Minus, Trash2, Search, Package } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import type { EditLinea } from './types';

interface Props {
  venta: any;
  editLineas: EditLinea[];
  editCondicion: 'contado' | 'credito' | 'por_definir';
  setEditCondicion: (v: 'contado' | 'credito' | 'por_definir') => void;
  editNotas: string;
  setEditNotas: (v: string) => void;
  editTotals: { subtotal: number; iva: number; total: number };
  clienteData: any;
  saldoPendienteOtras: number;
  creditoDisponible: number;
  excedeCredito: boolean;
  saving: boolean;
  showProductSearch: boolean;
  setShowProductSearch: (v: boolean) => void;
  searchProducto: string;
  setSearchProducto: (v: string) => void;
  filteredProductos: any[] | undefined;
  addProductToEdit: (p: any) => void;
  updateEditQty: (idx: number, delta: number) => void;
  removeEditLine: (idx: number) => void;
  handleSaveEdits: () => void;
  onBack: () => void;
  fmt: (n: number) => string;
}

export function EditarView(p: Props) {
  const { symbol: s } = useCurrency();
  return (
    <div className="flex flex-col h-screen bg-background">
      <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={p.onBack} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent"><ArrowLeft className="h-[18px] w-[18px] text-foreground" /></button>
          <span className="text-[15px] font-semibold text-foreground flex-1">Editar venta</span>
          <span className="text-[11px] text-muted-foreground">{p.venta.folio}</span>
        </div>
      </header>
      <div className="flex-1 overflow-auto px-3 py-3 space-y-3 pb-24">
        <CondicionSection {...p} s={s} />
        <ProductosSection {...p} s={s} />
        {p.showProductSearch && <ProductPicker {...p} s={s} />}
        <NotasSection editNotas={p.editNotas} setEditNotas={p.setEditNotas} />
        <TotalesSection editTotals={p.editTotals} fmt={p.fmt} s={s} />
      </div>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent">
        <button onClick={p.handleSaveEdits} disabled={p.saving || p.editLineas.length === 0 || p.excedeCredito}
          className="w-full bg-primary text-primary-foreground rounded-xl py-3.5 text-[14px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg flex items-center justify-center gap-1.5">
          <Save className="h-4 w-4" />{p.saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  );
}

function CondicionSection({ editCondicion, setEditCondicion, clienteData, saldoPendienteOtras, creditoDisponible, excedeCredito, fmt, s }: Props & { s: string }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">Condición de pago</p>
      <div className="flex gap-1.5">
        {([['contado', 'Contado'], ...(clienteData?.credito ? [['credito', 'Crédito']] : []), ['por_definir', 'Por definir']] as [string, string][]).map(([val, label]) => (
          <button key={val} onClick={() => setEditCondicion(val as any)}
            className={`flex-1 py-2 rounded-lg text-[12px] font-semibold transition-all active:scale-95 ${editCondicion === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground'}`}>{label}</button>
        ))}
      </div>
      {editCondicion === 'credito' && clienteData && (
        <div className={`mt-2.5 rounded-lg px-2.5 py-2 text-[11px] space-y-1 ${excedeCredito ? 'bg-destructive/8' : 'bg-accent/50'}`}>
          <div className="flex justify-between"><span className="text-muted-foreground">Límite</span><span className="font-medium text-foreground">{s}{fmt(clienteData.limite_credito ?? 0)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Saldo otras ventas</span><span className="font-medium text-foreground">{s}{fmt(saldoPendienteOtras)}</span></div>
          <div className="flex justify-between border-t border-border/40 pt-1"><span className="text-muted-foreground">Disponible</span><span className={`font-bold ${excedeCredito ? 'text-destructive' : 'text-green-600 dark:text-green-400'}`}>{s}{fmt(creditoDisponible)}</span></div>
          {excedeCredito && <p className="text-[10px] text-destructive font-medium mt-1">⚠ El total excede el crédito disponible</p>}
        </div>
      )}
    </section>
  );
}

function ProductosSection({ editLineas, updateEditQty, removeEditLine, setShowProductSearch, fmt, s }: Props & { s: string }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Productos ({editLineas.length})</p>
        <button onClick={() => setShowProductSearch(true)} className="text-[11px] text-primary font-semibold flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Agregar</button>
      </div>
      <div className="space-y-1.5">
        {editLineas.length === 0 && <p className="text-muted-foreground text-[12px] text-center py-4">Sin productos</p>}
        {editLineas.map((item, idx) => {
          const lineTotal = item.precio_unitario * item.cantidad * (1 + (item.tiene_iva ? item.iva_pct / 100 : 0));
          return (
            <div key={`${item.producto_id}-${idx}`} className="rounded-lg border border-border/60 p-2.5">
              <div className="flex items-start justify-between gap-2 mb-1.5">
                <div className="flex-1 min-w-0"><p className="text-[12px] font-medium text-foreground truncate">{item.nombre}</p><p className="text-[10px] text-muted-foreground">{item.codigo} · {s}{fmt(item.precio_unitario)} / {item.unidad}</p></div>
                <button onClick={() => removeEditLine(idx)} className="p-1"><Trash2 className="h-3.5 w-3.5 text-destructive" /></button>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 bg-accent/50 rounded-lg px-1">
                  <button onClick={() => updateEditQty(idx, -1)} className="p-1.5"><Minus className="h-3 w-3" /></button>
                  <span className="text-[13px] font-bold w-8 text-center text-foreground">{item.cantidad}</span>
                  <button onClick={() => updateEditQty(idx, 1)} className="p-1.5"><Plus className="h-3 w-3" /></button>
                </div>
                <span className="text-[14px] font-bold text-foreground">{s}{fmt(lineTotal)}</span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ProductPicker({ setShowProductSearch, setSearchProducto, searchProducto, filteredProductos, editLineas, addProductToEdit, updateEditQty, removeEditLine, editTotals, fmt, s }: Props & { s: string }) {
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <header className="sticky top-0 z-10 bg-card/95 backdrop-blur-md border-b border-border pt-[max(0px,env(safe-area-inset-top))]">
        <div className="flex items-center gap-2 px-3 h-12">
          <button onClick={() => { setShowProductSearch(false); setSearchProducto(''); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-accent"><ArrowLeft className="h-[18px] w-[18px] text-foreground" /></button>
          <span className="text-[15px] font-semibold text-foreground flex-1">Agregar productos</span>
        </div>
      </header>
      <div className="px-3 pt-2.5 pb-1.5"><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" /><input type="text" placeholder="Buscar producto..." className="w-full bg-accent/60 rounded-lg pl-8 pr-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1.5 focus:ring-primary/40" value={searchProducto} onChange={e => setSearchProducto(e.target.value)} autoFocus /></div></div>
      <div className="flex-1 overflow-auto px-3 space-y-[3px] pb-20">
        {filteredProductos?.map(p => {
          const inEdit = editLineas.find(l => l.producto_id === p.id);
          const inEditIdx = editLineas.findIndex(l => l.producto_id === p.id);
          return (
            <div key={p.id} className={`rounded-lg px-3 py-2 transition-all ${inEdit ? 'bg-primary/[0.04] ring-1 ring-primary/20' : 'bg-card'}`}>
              <div className="flex items-center gap-2.5">
                <div className="flex-1 min-w-0" onClick={() => !inEdit && addProductToEdit(p)}>
                  <p className="text-[12.5px] font-medium text-foreground truncate">{p.nombre}</p>
                  <span className="text-[10px] text-muted-foreground font-mono">{p.codigo}</span>
                  <p className="text-[13px] font-bold text-foreground mt-px">{s}{fmt(p.precio_principal ?? 0)}</p>
                </div>
                {inEdit ? (
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => inEdit.cantidad === 1 ? removeEditLine(inEditIdx) : updateEditQty(inEditIdx, -1)} className="w-7 h-7 rounded-md bg-accent flex items-center justify-center active:scale-90">
                      {inEdit.cantidad === 1 ? <Trash2 className="h-3 w-3 text-destructive" /> : <Minus className="h-3 w-3 text-foreground" />}
                    </button>
                    <span className="text-[13px] font-bold w-8 text-center text-foreground">{inEdit.cantidad}</span>
                    <button onClick={() => updateEditQty(inEditIdx, 1)} className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center active:scale-90"><Plus className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <button onClick={() => addProductToEdit(p)} className="w-8 h-8 rounded-lg bg-accent hover:bg-primary/10 flex items-center justify-center text-primary active:scale-90 shrink-0"><Plus className="h-4 w-4" /></button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {editLineas.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 px-3 pb-3 pt-1 bg-gradient-to-t from-background via-background to-transparent safe-area-bottom">
          <button onClick={() => { setShowProductSearch(false); setSearchProducto(''); }} className="w-full bg-primary text-primary-foreground rounded-xl py-3 flex items-center justify-between px-4 active:scale-[0.98] shadow-lg shadow-primary/20">
            <div className="flex items-center gap-1.5"><Package className="h-4 w-4 opacity-80" /><span className="text-[13px] font-medium">{editLineas.length} productos</span></div>
            <span className="text-[14px] font-bold">{s}{fmt(editTotals.total)}</span>
          </button>
        </div>
      )}
    </div>
  );
}

function NotasSection({ editNotas, setEditNotas }: { editNotas: string; setEditNotas: (v: string) => void }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">Notas</p>
      <textarea className="w-full bg-accent/40 rounded-md px-2.5 py-2 text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1.5 focus:ring-primary/40 resize-none" rows={2} placeholder="Instrucciones..." value={editNotas} onChange={e => setEditNotas(e.target.value)} />
    </section>
  );
}

function TotalesSection({ editTotals, fmt, s }: { editTotals: { subtotal: number; iva: number; total: number }; fmt: (n: number) => string; s: string }) {
  return (
    <section className="bg-card rounded-xl border border-border p-3.5 space-y-1.5">
      <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">Subtotal</span><span className="font-medium text-foreground tabular-nums">{s}{fmt(editTotals.subtotal)}</span></div>
      {editTotals.iva > 0 && <div className="flex justify-between text-[12px]"><span className="text-muted-foreground">IVA</span><span className="font-medium text-foreground tabular-nums">{s}{fmt(editTotals.iva)}</span></div>}
      <div className="flex justify-between items-baseline pt-1.5 border-t border-border/60"><span className="text-[13px] font-semibold text-foreground">Total</span><span className="text-[20px] font-bold text-primary tabular-nums">{s}{fmt(editTotals.total)}</span></div>
    </section>
  );
}
