import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, Banknote, Building2, CreditCard, Wallet, Check, ArrowLeft, AlertTriangle, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Badge } from '@/components/ui/badge';

/* ──────────── types ──────────── */
interface PendingPurchase {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  condicion_pago: string;
  status: string;
  dias_credito: number | null;
  montoAplicar: number;
}

type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta';

/* ──────────── hooks ──────────── */
function useProveedoresConSaldo() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['proveedores-con-saldo', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('proveedor_id, saldo_pendiente, total, proveedores(id, nombre)')
        .eq('empresa_id', empresa!.id)
        .gt('saldo_pendiente', 0.009)
        .neq('status', 'cancelada');
      if (error) throw error;

      const map = new Map<string, { id: string; nombre: string; saldo: number; docs: number }>();
      (data ?? []).forEach((c: any) => {
        const pid = c.proveedor_id;
        if (!pid) return;
        const existing = map.get(pid);
        if (existing) {
          existing.saldo += c.saldo_pendiente ?? 0;
          existing.docs += 1;
        } else {
          map.set(pid, { id: pid, nombre: c.proveedores?.nombre ?? 'Sin proveedor', saldo: c.saldo_pendiente ?? 0, docs: 1 });
        }
      });

      return Array.from(map.values()).filter(p => p.saldo >= 0.01).sort((a, b) => b.saldo - a.saldo);
    },
  });
}

function useComprasPendientes(proveedorId: string | null) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['compras-pendientes-aplicar', empresa?.id, proveedorId],
    enabled: !!empresa?.id && !!proveedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, dias_credito')
        .eq('empresa_id', empresa!.id)
        .eq('proveedor_id', proveedorId!)
        .gt('saldo_pendiente', 0)
        .neq('status', 'cancelada')
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const CONDICION_LABELS: Record<string, string> = { contado: 'Contado', credito: 'Crédito', por_definir: 'Por definir' };

/* ──────────── main ──────────── */
export default function AplicarPagosProveedorPage() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const { fmt: fmtCurrency, symbol } = useCurrency();
  const queryClient = useQueryClient();

  const [provSearch, setProvSearch] = useState('');
  const [selectedProv, setSelectedProv] = useState<{ id: string; nombre: string } | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('transferencia');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [compras, setCompras] = useState<PendingPurchase[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: proveedoresRaw, isLoading: loadingProv } = useProveedoresConSaldo();
  const { data: comprasRaw, isLoading: loadingCompras } = useComprasPendientes(selectedProv?.id ?? null);

  const proveedores = useMemo(() => {
    if (!proveedoresRaw) return [];
    if (!provSearch) return proveedoresRaw;
    const s = provSearch.toLowerCase();
    return proveedoresRaw.filter(p => p.nombre.toLowerCase().includes(s));
  }, [proveedoresRaw, provSearch]);

  const totalSaldoGlobal = proveedoresRaw?.reduce((s, p) => s + p.saldo, 0) ?? 0;
  const totalDocsGlobal = proveedoresRaw?.reduce((s, p) => s + p.docs, 0) ?? 0;

  useMemo(() => {
    if (comprasRaw) setCompras(comprasRaw.map(c => ({ ...c, montoAplicar: 0 })));
  }, [comprasRaw]);

  const totalPendiente = compras.reduce((s, c) => s + (c.saldo_pendiente ?? 0), 0);
  const totalDistribuido = compras.reduce((s, c) => s + c.montoAplicar, 0);
  const montoNum = parseFloat(montoRecibido) || 0;
  const sinDistribuir = montoNum - totalDistribuido;

  const fmt = (n: number) => fmtCurrency(n);

  const updateMonto = useCallback((id: string, monto: number) => {
    setCompras(prev => prev.map(c => c.id === id ? { ...c, montoAplicar: Math.min(Math.max(0, monto), c.saldo_pendiente) } : c));
  }, []);

  const distribuirFIFO = useCallback(() => {
    if (!montoNum) return;
    let restante = montoNum;
    setCompras(prev => prev.map(c => {
      const aplicar = Math.min(restante, c.saldo_pendiente);
      restante -= aplicar;
      return { ...c, montoAplicar: aplicar };
    }));
  }, [montoNum]);

  const limpiarDistribucion = useCallback(() => {
    setCompras(prev => prev.map(c => ({ ...c, montoAplicar: 0 })));
  }, []);

  const handleSelectProv = (p: any) => {
    setSelectedProv({ id: p.id, nombre: p.nombre });
    setMontoRecibido('');
    setReferencia('');
    setNotas('');
  };

  const handleBack = () => {
    setSelectedProv(null);
    setCompras([]);
    setMontoRecibido('');
  };

  const handleAplicar = async () => {
    if (!empresa?.id || !user?.id || !selectedProv) return;
    const aplicaciones = compras.filter(c => c.montoAplicar > 0);
    if (aplicaciones.length === 0) { toast.error('Distribuye el monto a al menos una compra'); return; }
    if (totalDistribuido <= 0) { toast.error('El monto a distribuir debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      for (const c of aplicaciones) {
        // Insert pago_compras record
        const { error: pagoErr } = await supabase.from('pago_compras').insert({
          empresa_id: empresa.id,
          compra_id: c.id,
          proveedor_id: selectedProv.id,
          user_id: user.id,
          monto: c.montoAplicar,
          metodo_pago: metodoPago,
          referencia: referencia || null,
          notas: notas || null,
          fecha: new Date().toISOString().slice(0, 10),
        } as any);
        if (pagoErr) throw pagoErr;

        const nuevoSaldo = Math.max(0, c.saldo_pendiente - c.montoAplicar);
        const updates: any = { saldo_pendiente: nuevoSaldo };
        if (nuevoSaldo <= 0.01) updates.status = 'pagada';
        await supabase.from('compras').update(updates).eq('id', c.id);
      }

      toast.success(`Pago de ${fmt(totalDistribuido)} aplicado a ${aplicaciones.length} compra(s)`);
      queryClient.invalidateQueries({ queryKey: ['compras-pendientes-aplicar'] });
      queryClient.invalidateQueries({ queryKey: ['proveedores-con-saldo'] });
      queryClient.invalidateQueries({ queryKey: ['proveedores-saldo-resumen'] });
      queryClient.invalidateQueries({ queryKey: ['compras'] });
      queryClient.invalidateQueries({ queryKey: ['pagos-compra'] });

      handleBack();
    } catch (e: any) {
      toast.error(e.message || 'Error al aplicar pago');
    } finally {
      setSaving(false);
    }
  };

  /* ════════════════════════════════════════════════════════
     VIEW 1 — Supplier list (only those with saldo > 0)
     ════════════════════════════════════════════════════════ */
  if (!selectedProv) {
    return (
      <div className="p-4 space-y-3 min-h-full">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">Aplicar Pagos a Proveedores</h1>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar proveedor..." value={provSearch} onChange={e => setProvSearch(e.target.value)} className="pl-9" />
        </div>

        {!loadingProv && (proveedoresRaw?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
            <span><strong className="text-foreground">{proveedoresRaw?.length ?? 0}</strong> proveedores con saldo</span>
            <span><strong className="text-foreground">{totalDocsGlobal}</strong> documentos</span>
            <span>Total por pagar: <strong className="text-destructive">{fmt(totalSaldoGlobal)}</strong></span>
          </div>
        )}

        {loadingProv ? (
          <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={4} /></div>
        ) : (
          <div className="bg-card border border-border rounded overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-table-border text-left">
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Proveedor</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Compras</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Saldo pendiente</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {proveedores.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">
                    <Truck className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    No hay proveedores con saldo pendiente
                  </td></tr>
                )}
                {proveedores.map(p => (
                  <tr key={p.id} className="border-b border-table-border cursor-pointer hover:bg-table-hover transition-colors" onClick={() => handleSelectProv(p)}>
                    <td className="py-2 px-3 font-medium">{p.nombre}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="secondary" className="text-[11px]">{p.docs}</Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-destructive tabular-nums">{fmt(p.saldo)}</td>
                    <td className="py-2 px-3 text-right">
                      <button className="btn-odoo-secondary text-[11px] py-1 px-2.5">Aplicar pago</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {proveedores.length > 0 && (
                <tfoot>
                  <tr className="bg-card border-t border-border font-semibold text-[12px]">
                    <td colSpan={2} className="py-2 px-3 text-muted-foreground">{proveedores.length} proveedores</td>
                    <td className="py-2 px-3 text-right tabular-nums text-destructive font-bold">{fmt(proveedores.reduce((s, p) => s + p.saldo, 0))}</td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    );
  }

  /* ════════════════════════════════════════════════════════
     VIEW 2 — Payment distribution for selected supplier
     ════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Aplicar Pago a Proveedor</h1>
          <p className="text-sm text-muted-foreground">{selectedProv.nombre}</p>
        </div>
      </div>

      {/* Top bar: payment config */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {/* Method */}
        <div className="bg-card border border-border rounded p-3">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Método de pago</label>
          <div className="flex gap-1.5">
            {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Building2], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
              <button key={val} onClick={() => setMetodoPago(val)}
                className={cn('flex-1 py-2 rounded-lg text-[11px] font-semibold transition-all flex flex-col items-center gap-1',
                  metodoPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground hover:bg-accent')}>
                <Icon className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
        </div>

        {/* Amount */}
        <div className="bg-card border border-border rounded p-3">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Monto a pagar</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-medium text-muted-foreground">{symbol}</span>
            <input type="number" inputMode="decimal" min="0"
              className="w-full bg-accent/40 rounded-lg pl-7 pr-3 py-2.5 text-xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              value={montoRecibido} placeholder="0.00"
              onChange={e => { const v = parseFloat(e.target.value); if (e.target.value === '' || v >= 0) setMontoRecibido(e.target.value); }}
            />
          </div>
        </div>

        {/* Reference & Notes */}
        <div className="bg-card border border-border rounded p-3">
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Referencia / Notas</label>
          {metodoPago !== 'efectivo' && (
            <Input className="mb-2 text-sm" placeholder="No. de referencia" value={referencia} onChange={e => setReferencia(e.target.value)} />
          )}
          <Input className="text-sm" placeholder="Notas del pago (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
        </div>

        {/* Summary + actions */}
        <div className="bg-card border border-border rounded p-3 space-y-2">
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Total por pagar</span>
            <span className="font-semibold text-destructive tabular-nums">{fmt(totalPendiente)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Distribuido</span>
            <span className="font-bold text-primary tabular-nums">{fmt(totalDistribuido)}</span>
          </div>
          {sinDistribuir > 0.01 && (
            <div className="flex items-center gap-1 text-[11px] text-warning bg-warning/10 rounded px-2 py-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> {fmt(sinDistribuir)} sin distribuir
            </div>
          )}
          {sinDistribuir < -0.01 && (
            <div className="flex items-center gap-1 text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> Excede el monto ingresado
            </div>
          )}
          <div className="flex gap-1.5 pt-1">
            <button onClick={distribuirFIFO} disabled={!montoNum} className="btn-odoo-secondary flex-1 text-[11px] py-1.5 disabled:opacity-40">FIFO</button>
            <button onClick={limpiarDistribucion} className="btn-odoo-secondary flex-1 text-[11px] py-1.5 text-destructive hover:text-destructive">Limpiar</button>
          </div>
        </div>
      </div>

      {/* Compras table */}
      {loadingCompras ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={6} cols={7} /></div>
      ) : (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-table-border text-left">
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Fecha</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Condición</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Días créd.</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Estado</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Pendiente</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right w-[180px]">Aplicar</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center w-[120px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {compras.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">
                  <Banknote className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  Este proveedor no tiene compras pendientes
                </td></tr>
              )}
              {compras.map(c => {
                const isLiquidada = c.montoAplicar >= c.saldo_pendiente - 0.01 && c.montoAplicar > 0;
                return (
                  <tr key={c.id} className={cn('border-b border-table-border transition-colors', c.montoAplicar > 0 ? 'bg-success/5' : 'hover:bg-table-hover')}>
                    <td className="py-2 px-3 font-mono text-xs font-medium">{c.folio ?? c.id.slice(0, 8)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{fmtDate(c.fecha)}</td>
                    <td className="py-2 px-3">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{CONDICION_LABELS[c.condicion_pago] ?? c.condicion_pago}</span>
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">{c.dias_credito ?? 0}d</td>
                    <td className="py-2 px-3"><StatusChip status={c.status} /></td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(c.total)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-destructive tabular-nums">{fmt(c.saldo_pendiente)}</td>
                    <td className="py-2 px-3 text-right">
                      <div className="relative inline-flex">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{symbol}</span>
                        <input type="number" inputMode="decimal"
                          className="w-[140px] bg-accent/40 rounded-lg pl-6 pr-2 py-1.5 text-sm font-medium text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={c.montoAplicar || ''} placeholder="0.00"
                          onChange={e => updateMonto(c.id, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateMonto(c.id, c.saldo_pendiente)}
                          className={cn('text-[11px] px-2 py-1 rounded font-medium transition-all',
                            isLiquidada ? 'bg-success text-white' : 'bg-accent text-foreground hover:bg-accent/80')}>
                          {isLiquidada ? '✓ Liquidar' : 'Liquidar'}
                        </button>
                        {c.montoAplicar > 0 && (
                          <button onClick={() => updateMonto(c.id, 0)} className="text-[11px] text-destructive font-medium hover:underline">Quitar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {compras.length > 0 && (
              <tfoot>
                <tr className="bg-card border-t border-border font-semibold text-[12px]">
                  <td colSpan={6} className="py-2 px-3 text-muted-foreground">{compras.length} compras pendientes</td>
                  <td className="py-2 px-3 text-right tabular-nums text-destructive font-bold">{fmt(totalPendiente)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary font-bold">{fmt(totalDistribuido)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Bottom CTA */}
      {compras.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleAplicar} disabled={saving || totalDistribuido <= 0 || sinDistribuir < -0.01}
            className="bg-success hover:bg-success/90 text-white py-2.5 px-8 text-sm font-bold gap-2">
            <Check className="h-4 w-4" /> {saving ? 'Procesando...' : `Aplicar pago ${fmt(totalDistribuido)}`}
          </Button>
        </div>
      )}
    </div>
  );
}
