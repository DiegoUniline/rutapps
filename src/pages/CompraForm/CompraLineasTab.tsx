import { useState } from 'react';
import { Plus, X, PackageCheck, Boxes } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import QuickProductDialog from '@/components/QuickProductDialog';
import { Switch } from '@/components/ui/switch';
import type { CompraLinea } from './types';
import { useCurrency } from '@/hooks/useCurrency';
import { getNombreCompra } from '@/lib/productoNombres';
import { useAuth } from '@/contexts/AuthContext';
import { LoteReceptionModal } from '@/components/lotes/LoteReceptionModal';
import { CompraLineaLotesDialog } from '@/components/lotes/CompraLineaLotesDialog';

interface Props {
  lineas: Partial<CompraLinea>[];
  productosList: any[] | undefined;
  isEditable: boolean;
  puedeRecibir: boolean;
  compraId?: string;
  almacenId?: string | null;
  updateLinea: (idx: number, key: string, val: any) => void;
  addLine: () => void;
  removeLine: (idx: number) => void;
  onRecibirLinea: (lineaId: string, loteId?: string | null) => void;
  onLoteChanged?: () => void;
}

export function CompraLineasTab({ lineas, productosList, isEditable, puedeRecibir, compraId, almacenId, updateLinea, addLine, removeLine, onRecibirLinea, onLoteChanged }: Props) {
  const { fmt } = useCurrency();
  const { empresa, user } = useAuth();
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickIdx, setQuickIdx] = useState<number | null>(null);
  const [quickName, setQuickName] = useState('');
  // Recepción por lote: línea pendiente de asignar lote.
  const [loteFor, setLoteFor] = useState<{ lineaId: string; producto: { id: string; nombre: string }; piezas: number } | null>(null);
  // Asignación de lote desde la línea (antes de recibir).
  const [loteAsignar, setLoteAsignar] = useState<{ idx: number; producto: { id: string; nombre: string }; piezas: number } | null>(null);
  // Loteo con cantidades (carga stock vía trigger).
  const [loteoLinea, setLoteoLinea] = useState<{ lineaId: string; producto: { id: string; nombre: string }; piezasTotal: number } | null>(null);
  const manejaLotes = !!(empresa as any)?.maneja_lotes;
  const lineaManejaLote = (line: any) => !!(line.productos?.maneja_lote ?? productosList?.find((p: any) => p.id === line.producto_id)?.maneja_lote);
  const abrirLoteo = (line: any) => {
    const factor = Number(line._factor_conversion) || 1;
    setLoteoLinea({
      lineaId: line.id,
      producto: { id: line.producto_id, nombre: line.productos?.nombre ?? 'Producto' },
      piezasTotal: (Number(line.cantidad) || 0) * factor,
    });
  };
  const abrirAsignarLote = (idx: number, line: any) => {

    const prod = productosList?.find((p: any) => p.id === line.producto_id);
    if (!line.producto_id) return;
    const factor = Number(line._factor_conversion) || 1;
    setLoteAsignar({ idx, producto: { id: line.producto_id, nombre: line.productos?.nombre ?? prod?.nombre ?? 'Producto' }, piezas: (Number(line.cantidad) || 0) * factor });
  };

  // Al recibir una línea: si el producto maneja lote, abrir el modal; si no, recibir directo.
  const recibirLinea = (line: any, pendiente: number) => {
    if (line.lote_id) {
      onRecibirLinea(line.id, line.lote_id);
    } else if (lineaManejaLote(line)) {
      setLoteFor({ lineaId: line.id, producto: { id: line.producto_id, nombre: line.productos?.nombre ?? 'Producto' }, piezas: pendiente });
    } else {
      onRecibirLinea(line.id);
    }
  };
  const [quickCosto, setQuickCosto] = useState(0);

  const triggerQuickCreate = (idx: number, name: string) => {
    setQuickIdx(idx);
    setQuickName(name);
    setQuickCosto(Number(lineas[idx]?.precio_unitario) || 0);
    setQuickOpen(true);
  };

  const productoOptions = (idx: number) => (productosList as any[])?.filter(p => { const usedIds = lineas.filter((_, j) => j !== idx).map(l => l.producto_id).filter(Boolean); return !usedIds.includes(p.id); }).map(p => ({ value: p.id, label: `[${p.codigo}] ${getNombreCompra(p)}`, searchText: [p.codigo, p.nombre_compra, p.nombre].filter(Boolean).join(' ') })) ?? [];

  return (
    <div className="space-y-3">
      {/* Desktop / tablet table */}
      <div className="hidden md:block bg-card border border-border rounded overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-table-border">
            <th className="th-odoo text-left w-8">#</th><th className="th-odoo text-left" style={{ width: '34%' }}>Producto</th>
            <th className="th-odoo text-center w-14">Ud.</th><th className="th-odoo text-right w-24">Cant.</th>
            <th className="th-odoo text-center w-20">Factor</th><th className="th-odoo text-right w-20">Piezas</th>
            <th className="th-odoo text-center w-28">Recibido</th>
            <th className="th-odoo text-right w-28">Costo</th><th className="th-odoo text-center w-14">IVA</th>
            <th className="th-odoo text-center w-14">IEPS</th><th className="th-odoo text-right w-24">Total</th>
            {manejaLotes && <th className="th-odoo text-left w-32">Lote</th>}
            {(isEditable || puedeRecibir) && <th className="th-odoo w-8"></th>}
          </tr></thead>
          <tbody>
            {lineas.map((line, idx) => {
              const iepsLabel = line._tiene_ieps ? (line._ieps_tipo === 'cuota' ? `$${line._ieps_pct}` : `${line._ieps_pct}%`) : '';
              const factor = Number(line._factor_conversion) || 1;
              const totalPz = (Number(line.cantidad) || 0) * factor;
              const recibido = Number(line.cantidad_recibida) || 0;
              const pendiente = Math.max(0, totalPz - recibido);
              const fullyReceived = totalPz > 0 && pendiente === 0;
              return (
                <tr key={idx} className="border-b border-table-border" data-row={idx}>
                  <td className="py-1.5 px-2 text-muted-foreground text-xs">{idx + 1}</td>
                  <td className="py-1.5 px-2">
                    {isEditable ? (
                      <SearchableSelect
                        options={productoOptions(idx)}
                        value={line.producto_id ?? ''}
                        onChange={val => updateLinea(idx, 'producto_id', val)}
                        placeholder="Buscar producto..."
                        onCreateNew={async (name) => { triggerQuickCreate(idx, name); return undefined; }}
                      />
                    ) : <span className="text-xs truncate block">{line.productos ? `[${line.productos.codigo}] ${getNombreCompra(line.productos)}` : '—'}</span>}
                  </td>
                  <td className="py-1.5 px-2 text-center text-xs text-muted-foreground uppercase">{line._unidad_compra || 'pz'}</td>
                  <td className="py-1.5 px-2">{isEditable ? <input type="number" className="input-odoo w-24 text-right text-sm" value={line.cantidad ?? 1} onChange={e => updateLinea(idx, 'cantidad', Number(e.target.value))} min={0} /> : <span className="text-sm text-right block tabular-nums">{(line.cantidad ?? 1).toLocaleString('es-MX')}</span>}</td>
                  <td className="py-1.5 px-1">{isEditable ? <input type="number" className="w-20 text-center text-sm bg-transparent border border-border rounded px-2 py-1 tabular-nums focus:outline-none focus:ring-1 focus:ring-primary" value={line._factor_conversion ?? 1} onChange={e => updateLinea(idx, '_factor_conversion', Math.max(1, Number(e.target.value) || 1))} min={1} /> : <span className="text-sm text-center block tabular-nums">{(line._factor_conversion ?? 1).toLocaleString('es-MX')}</span>}</td>
                  <td className="py-1.5 px-2 text-right text-sm font-medium text-foreground tabular-nums">{totalPz.toLocaleString('es-MX')}</td>
                  <td className="py-1.5 px-2 text-center">
                    {line.id ? (
                      <span className={
                        'inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums ' +
                        (fullyReceived ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          : recibido > 0 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                            : 'bg-muted text-muted-foreground')
                      }>
                        {recibido.toLocaleString('es-MX')} / {totalPz.toLocaleString('es-MX')}
                      </span>
                    ) : <span className="text-[11px] text-muted-foreground">—</span>}
                  </td>
                  <td className="py-1.5 px-3">{isEditable ? <input type="number" className="input-odoo w-28 text-right text-sm" value={line.precio_unitario ?? 0} onChange={e => updateLinea(idx, 'precio_unitario', Number(e.target.value))} step="0.01" /> : <span className="text-sm text-right block tabular-nums">{fmt(line.precio_unitario ?? 0)}</span>}</td>
                  <td className="py-1.5 px-3 text-center"><div className="flex flex-col items-center gap-0.5"><Switch checked={line._tiene_iva ?? false} onCheckedChange={v => updateLinea(idx, '_tiene_iva', v)} disabled={!isEditable} className="scale-75" />{line._tiene_iva && <span className="text-[10px] text-muted-foreground">{line._iva_pct}%</span>}</div></td>
                  <td className="py-1.5 px-3 text-center"><div className="flex flex-col items-center gap-0.5"><Switch checked={line._tiene_ieps ?? false} onCheckedChange={v => updateLinea(idx, '_tiene_ieps', v)} disabled={!isEditable} className="scale-75" />{line._tiene_ieps && <span className="text-[10px] text-muted-foreground">{iepsLabel}</span>}</div></td>
                  <td className="py-1.5 px-3 text-right font-medium text-sm tabular-nums">{fmt(line.total ?? 0)}</td>
                  {manejaLotes && (
                    <td className="py-1.5 px-2">
                      {!line.producto_id || !lineaManejaLote(line) ? (
                        <span className="text-[11px] text-muted-foreground">—</span>
                      ) : !isEditable ? (
                        <span className="text-[11px] text-foreground">{line._lote_codigo || '—'}</span>

                      ) : (
                        <button
                          type="button"
                          onClick={() => abrirAsignarLote(idx, line)}
                          className={'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border transition-colors ' + (line.lote_id ? 'border-border bg-muted text-foreground hover:bg-accent' : 'border-dashed border-primary/50 text-primary hover:bg-primary/5')}
                          title="Elegir o crear el lote de esta línea"
                        >
                          <Boxes className="h-3 w-3" /> {line._lote_codigo || (line.lote_id ? 'Lote asignado' : 'Elegir lote')}
                        </button>
                      )}
                    </td>
                  )}
                  {(isEditable || puedeRecibir) && (
                    <td className="py-1.5 px-2">
                      {isEditable && <button onClick={() => removeLine(idx)} className="text-destructive hover:text-destructive/80" title="Eliminar línea"><X className="h-3.5 w-3.5" /></button>}
                      {!isEditable && puedeRecibir && pendiente > 0 && line.id && (
                        <button
                          onClick={() => recibirLinea(line, pendiente)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95"
                          title={`Recibir ${pendiente} pieza(s) pendiente(s)`}
                        >
                          <PackageCheck className="h-3 w-3" /> Recibir
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {lineas.map((line, idx) => {
          const iepsLabel = line._tiene_ieps ? (line._ieps_tipo === 'cuota' ? `$${line._ieps_pct}` : `${line._ieps_pct}%`) : '';
          const factor = Number(line._factor_conversion) || 1;
          const totalPz = (Number(line.cantidad) || 0) * factor;
          const recibido = Number(line.cantidad_recibida) || 0;
          const pendiente = Math.max(0, totalPz - recibido);
          const fullyReceived = totalPz > 0 && pendiente === 0;
          return (
            <div key={idx} className="bg-card border border-border rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="text-[11px] font-semibold text-muted-foreground">#{idx + 1}</span>
                {isEditable && <button onClick={() => removeLine(idx)} className="text-destructive hover:text-destructive/80 -mt-1"><X className="h-4 w-4" /></button>}
              </div>
              <div>
                {isEditable ? (
                  <SearchableSelect
                    options={productoOptions(idx)}
                    value={line.producto_id ?? ''}
                    onChange={val => updateLinea(idx, 'producto_id', val)}
                    placeholder="Buscar producto..."
                    onCreateNew={async (name) => { triggerQuickCreate(idx, name); return undefined; }}
                  />
                ) : <div className="text-sm font-medium text-foreground break-words">{line.productos ? `[${line.productos.codigo}] ${getNombreCompra(line.productos)}` : '—'}</div>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block">Cant. ({line._unidad_compra || 'pz'})</label>
                  {isEditable ? <input type="number" className="input-odoo w-full text-right text-sm" value={line.cantidad ?? 1} onChange={e => updateLinea(idx, 'cantidad', Number(e.target.value))} min={0} /> : <div className="text-sm text-right tabular-nums">{(line.cantidad ?? 1).toLocaleString('es-MX')}</div>}
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block">Factor</label>
                  {isEditable ? <input type="number" className="input-odoo w-full text-center text-sm" value={line._factor_conversion ?? 1} onChange={e => updateLinea(idx, '_factor_conversion', Math.max(1, Number(e.target.value) || 1))} min={1} /> : <div className="text-sm text-center tabular-nums">{(line._factor_conversion ?? 1).toLocaleString('es-MX')}</div>}
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block">Piezas</label>
                  <div className="text-sm font-medium text-right tabular-nums py-1.5">{totalPz.toLocaleString('es-MX')}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block">Costo</label>
                  {isEditable ? <input type="number" className="input-odoo w-full text-right text-sm" value={line.precio_unitario ?? 0} onChange={e => updateLinea(idx, 'precio_unitario', Number(e.target.value))} step="0.01" /> : <div className="text-sm text-right tabular-nums">{fmt(line.precio_unitario ?? 0)}</div>}
                </div>
                <div>
                  <label className="text-[10px] uppercase text-muted-foreground block">Total</label>
                  <div className="text-sm font-bold text-right tabular-nums py-1.5">{fmt(line.total ?? 0)}</div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 pt-1 border-t border-border">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">IVA</span>
                  <Switch checked={line._tiene_iva ?? false} onCheckedChange={v => updateLinea(idx, '_tiene_iva', v)} disabled={!isEditable} className="scale-75" />
                  {line._tiene_iva && <span className="text-[10px] text-muted-foreground">{line._iva_pct}%</span>}
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">IEPS</span>
                  <Switch checked={line._tiene_ieps ?? false} onCheckedChange={v => updateLinea(idx, '_tiene_ieps', v)} disabled={!isEditable} className="scale-75" />
                  {line._tiene_ieps && <span className="text-[10px] text-muted-foreground">{iepsLabel}</span>}
                </div>
              </div>
              {manejaLotes && isEditable && line.producto_id && lineaManejaLote(line) && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                  <span className="text-[10px] uppercase text-muted-foreground">Lote</span>
                  <button
                    type="button"
                    onClick={() => abrirAsignarLote(idx, line)}
                    className={'inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium border ' + (line.lote_id ? 'border-border bg-muted text-foreground' : 'border-dashed border-primary/50 text-primary')}
                  >
                    <Boxes className="h-3 w-3" /> {line._lote_codigo || (line.lote_id ? 'Lote asignado' : 'Elegir lote')}
                  </button>
                </div>
              )}
              {line.id && (
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                  <span className="text-[10px] uppercase text-muted-foreground">Recibido</span>
                  <span className={
                    'inline-flex items-center justify-center px-2 py-0.5 rounded text-[11px] font-semibold tabular-nums ' +
                    (fullyReceived ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                      : recibido > 0 ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                        : 'bg-muted text-muted-foreground')
                  }>{recibido.toLocaleString('es-MX')} / {totalPz.toLocaleString('es-MX')}</span>
                </div>
              )}
              {!isEditable && puedeRecibir && pendiente > 0 && line.id && (
                <button onClick={() => recibirLinea(line, pendiente)} className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95">
                  <PackageCheck className="h-3.5 w-3.5" /> Recibir {pendiente} pza(s)
                </button>
              )}
            </div>
          );
        })}
      </div>

      {isEditable && <button onClick={addLine} className="btn-odoo-secondary text-xs gap-1 w-full md:w-auto justify-center"><Plus className="h-3.5 w-3.5" /> Agregar línea</button>}

      <QuickProductDialog
        open={quickOpen}
        onOpenChange={setQuickOpen}
        initialName={quickName}
        initialCosto={quickCosto}
        onCreated={(prod) => {
          if (quickIdx === null) return;
          updateLinea(quickIdx, 'producto_id', prod.id);
          if (prod.costo && !lineas[quickIdx]?.precio_unitario) {
            const factor = prod.factor_conversion ?? 1;
            updateLinea(quickIdx, 'precio_unitario', prod.costo * factor);
          }
          updateLinea(quickIdx, '_tiene_iva', !!prod.tiene_iva);
          if (prod.tiene_iva) updateLinea(quickIdx, '_iva_pct', prod.iva_pct ?? 16);
          updateLinea(quickIdx, '_tiene_ieps', !!prod.tiene_ieps);
          if (prod.tiene_ieps) updateLinea(quickIdx, '_ieps_pct', prod.ieps_pct ?? 0);
          if (prod.factor_conversion) updateLinea(quickIdx, '_factor_conversion', prod.factor_conversion);
        }}
      />
      {loteAsignar && empresa?.id && (
        <LoteReceptionModal
          empresaId={empresa.id}
          producto={loteAsignar.producto}
          piezas={loteAsignar.piezas}
          title="Elegir o crear lote"
          confirmLabel="Usar este lote"
          descripcion={`Selecciona el lote al que entrarán las piezas de ${loteAsignar.producto.nombre}. Puedes crear uno nuevo.`}
          onClose={() => setLoteAsignar(null)}
          onConfirm={(loteId, codigo) => {
            const idx = loteAsignar.idx;
            setLoteAsignar(null);
            updateLinea(idx, 'lote_id', loteId);
            updateLinea(idx, '_lote_codigo', codigo ?? null);
          }}
        />
      )}
      {loteFor && empresa?.id && (
        <LoteReceptionModal
          empresaId={empresa.id}
          producto={loteFor.producto}
          piezas={loteFor.piezas}
          onClose={() => setLoteFor(null)}
          onConfirm={(loteId) => {
            const lineaId = loteFor.lineaId;
            setLoteFor(null);
            onRecibirLinea(lineaId, loteId);
          }}
        />
      )}
    </div>
  );
}
