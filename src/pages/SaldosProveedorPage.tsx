import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Search, Truck, ChevronRight, CreditCard, FileText, ArrowLeft,
  Banknote, Wallet, Building2, Check, AlertTriangle,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusChip } from '@/components/StatusChip';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/* ── types ── */
type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta';
interface PayableCompra {
  id: string; folio: string | null; fecha: string; total: number;
  saldo_pendiente: number; condicion_pago: string; status: string;
  dias_credito: number | null; montoAplicar: number;
}

/* ── hooks ── */
function useProveedoresSaldo() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['proveedores-saldo-resumen', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('proveedor_id, saldo_pendiente, total, status, proveedores(id, nombre)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['confirmada', 'recibida', 'pagada'] as any);
      if (error) throw error;
      const map = new Map<string, { id: string; nombre: string; totalComprado: number; saldoPendiente: number; docs: number }>();
      (data ?? []).forEach((c: any) => {
        const pid = c.proveedor_id;
        if (!pid) return;
        const existing = map.get(pid);
        if (existing) {
          existing.totalComprado += c.total ?? 0;
          existing.saldoPendiente += c.saldo_pendiente ?? 0;
          existing.docs += 1;
        } else {
          map.set(pid, { id: pid, nombre: c.proveedores?.nombre ?? 'Sin proveedor', totalComprado: c.total ?? 0, saldoPendiente: c.saldo_pendiente ?? 0, docs: 1 });
        }
      });
      return Array.from(map.values()).sort((a, b) => b.saldoPendiente - a.saldoPendiente);
    },
  });
}

function useProveedorDetalle(proveedorId: string | null) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['proveedor-estado-cuenta', empresa?.id, proveedorId],
    enabled: !!empresa?.id && !!proveedorId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compras')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, dias_credito')
        .eq('empresa_id', empresa!.id)
        .eq('proveedor_id', proveedorId!)
        .in('status', ['confirmada', 'recibida', 'pagada'] as any)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const CONDICION_LABELS: Record<string, string> = { contado: 'Contado', credito: 'Crédito', por_definir: 'Por definir' };

/* ── page ── */
export default function SaldosProveedorPage() {
  const { fmt, symbol } = useCurrency();
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Payment view state
  const [payView, setPayView] = useState(false);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('transferencia');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [payables, setPayables] = useState<PayableCompra[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: proveedores, isLoading } = useProveedoresSaldo();
  const { data: compras, isLoading: loadingDetalle } = useProveedorDetalle(selectedId);

  const filtered = useMemo(() => {
    if (!proveedores) return [];
    if (!search) return proveedores;
    const s = search.toLowerCase();
    return proveedores.filter(p => p.nombre.toLowerCase().includes(s));
  }, [proveedores, search]);

  const selected = proveedores?.find(p => p.id === selectedId);
  const totalPendienteGlobal = proveedores?.reduce((s, p) => s + p.saldoPendiente, 0) ?? 0;
  const provConSaldo = proveedores?.filter(p => p.saldoPendiente > 0.01).length ?? 0;

  const comprasPendientes = compras?.filter(c => (c.saldo_pendiente ?? 0) > 0.01) ?? [];
  const comprasPagadas = compras?.filter(c => (c.saldo_pendiente ?? 0) <= 0.01) ?? [];

  // Payment distribution helpers
  const montoNum = parseFloat(montoRecibido) || 0;
  const totalDistribuido = payables.reduce((s, c) => s + c.montoAplicar, 0);
  const totalPendientePay = payables.reduce((s, c) => s + c.saldo_pendiente, 0);
  const sinDistribuir = montoNum - totalDistribuido;

  const updateMonto = useCallback((id: string, monto: number) => {
    setPayables(prev => prev.map(c => c.id === id ? { ...c, montoAplicar: Math.min(Math.max(0, monto), c.saldo_pendiente) } : c));
  }, []);

  const distribuirFIFO = useCallback(() => {
    if (!montoNum) return;
    let restante = montoNum;
    setPayables(prev => prev.map(c => {
      const aplicar = Math.min(restante, c.saldo_pendiente);
      restante -= aplicar;
      return { ...c, montoAplicar: aplicar };
    }));
  }, [montoNum]);

  const limpiarDistribucion = useCallback(() => {
    setPayables(prev => prev.map(c => ({ ...c, montoAplicar: 0 })));
  }, []);

  const openPayView = () => {
    setPayables(comprasPendientes.map(c => ({ ...c, montoAplicar: 0 })));
    setMontoRecibido('');
    setReferencia('');
    setNotas('');
    setMetodoPago('transferencia');
    setPayView(true);
  };

  const handleAplicar = async () => {
    if (!empresa?.id || !user?.id || !selectedId) return;
    const aplicaciones = payables.filter(c => c.montoAplicar > 0);
    if (aplicaciones.length === 0) { toast.error('Distribuye el monto a al menos una compra'); return; }
    if (totalDistribuido <= 0) { toast.error('El monto debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      for (const c of aplicaciones) {
        const { error: pagoErr } = await supabase.from('pago_compras').insert({
          empresa_id: empresa.id, compra_id: c.id, proveedor_id: selectedId,
          user_id: user.id, monto: c.montoAplicar, metodo_pago: metodoPago,
          referencia: referencia || null, notas: notas || null,
          fecha: new Date().toISOString().slice(0, 10),
        } as any);
        if (pagoErr) throw pagoErr;
        const nuevoSaldo = Math.max(0, c.saldo_pendiente - c.montoAplicar);
        const updates: any = { saldo_pendiente: nuevoSaldo };
        if (nuevoSaldo <= 0.01) updates.status = 'pagada';
        await supabase.from('compras').update(updates).eq('id', c.id);
      }
      toast.success(`Pago de ${fmt(totalDistribuido)} aplicado a ${aplicaciones.length} compra(s)`);
      qc.invalidateQueries({ queryKey: ['proveedor-estado-cuenta'] });
      qc.invalidateQueries({ queryKey: ['proveedores-saldo-resumen'] });
      qc.invalidateQueries({ queryKey: ['compras'] });
      qc.invalidateQueries({ queryKey: ['pagos-compra'] });
      setPayView(false);
    } catch (e: any) {
      toast.error(e.message || 'Error al aplicar pago');
    } finally {
      setSaving(false);
    }
  };

  /* ═══════════════════════════════════════════
     VIEW 3 — Apply payment (inside detail)
     ═══════════════════════════════════════════ */
  if (selectedId && selected && payView) {
    return (
      <div className="p-4 space-y-3 min-h-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setPayView(false)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Aplicar pago</h1>
            <p className="text-sm text-muted-foreground">{selected.nombre}</p>
          </div>
        </div>

        {/* Payment config */}
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

          {/* Ref & Notes */}
          <div className="bg-card border border-border rounded p-3">
            <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Referencia / Notas</label>
            {metodoPago !== 'efectivo' && (
              <Input className="mb-2 text-sm" placeholder="No. de referencia" value={referencia} onChange={e => setReferencia(e.target.value)} />
            )}
            <Input className="text-sm" placeholder="Notas (opcional)" value={notas} onChange={e => setNotas(e.target.value)} />
          </div>

          {/* Summary */}
          <div className="bg-card border border-border rounded p-3 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Total por pagar</span>
              <span className="font-semibold text-destructive tabular-nums">{fmt(totalPendientePay)}</span>
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

        {/* Purchases table */}
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-table-border text-left">
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Fecha</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Condición</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Días créd.</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Pendiente</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right w-[160px]">Aplicar</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center w-[110px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {payables.map(c => {
                const isLiq = c.montoAplicar >= c.saldo_pendiente - 0.01 && c.montoAplicar > 0;
                return (
                  <tr key={c.id} className={cn('border-b border-table-border transition-colors', c.montoAplicar > 0 ? 'bg-success/5' : 'hover:bg-table-hover')}>
                    <td className="py-2 px-3 font-mono text-xs font-medium">{c.folio ?? c.id.slice(0, 8)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{fmtDate(c.fecha)}</td>
                    <td className="py-2 px-3">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{CONDICION_LABELS[c.condicion_pago] ?? c.condicion_pago}</span>
                    </td>
                    <td className="py-2 px-3 text-center text-muted-foreground">{c.dias_credito ?? 0}d</td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(c.total)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-destructive tabular-nums">{fmt(c.saldo_pendiente)}</td>
                    <td className="py-2 px-3 text-right">
                      <div className="relative inline-flex">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{symbol}</span>
                        <input type="number" inputMode="decimal"
                          className="w-[130px] bg-accent/40 rounded-lg pl-6 pr-2 py-1.5 text-sm font-medium text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={c.montoAplicar || ''} placeholder="0.00"
                          onChange={e => updateMonto(c.id, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateMonto(c.id, c.saldo_pendiente)}
                          className={cn('text-[11px] px-2 py-1 rounded font-medium transition-all',
                            isLiq ? 'bg-success text-white' : 'bg-accent text-foreground hover:bg-accent/80')}>
                          {isLiq ? '✓ Liquidar' : 'Liquidar'}
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
            {payables.length > 0 && (
              <tfoot>
                <tr className="bg-card border-t border-border font-semibold text-[12px]">
                  <td colSpan={5} className="py-2 px-3 text-muted-foreground">{payables.length} compras pendientes</td>
                  <td className="py-2 px-3 text-right tabular-nums text-destructive font-bold">{fmt(totalPendientePay)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary font-bold">{fmt(totalDistribuido)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {payables.length > 0 && (
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

  /* ═══════════════════════════════════════════
     VIEW 2 — Provider detail (estado de cuenta)
     ═══════════════════════════════════════════ */
  if (selectedId && selected) {
    const totalCompras = compras?.reduce((s, c) => s + (c.total ?? 0), 0) ?? 0;
    const totalSaldo = compras?.reduce((s, c) => s + (c.saldo_pendiente ?? 0), 0) ?? 0;

    return (
      <div className="p-4 space-y-4 min-h-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Estado de cuenta</h1>
            <p className="text-sm text-muted-foreground">{selected.nombre}</p>
          </div>
          {comprasPendientes.length > 0 && (
            <Button onClick={openPayView} className="gap-2">
              <Banknote className="h-4 w-4" /> Aplicar pago
            </Button>
          )}
        </div>

        {/* Summary */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total comprado</p>
              <p className="text-lg font-bold text-foreground">{fmt(totalCompras)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Pagado</p>
              <p className="text-lg font-bold text-success">{fmt(totalCompras - totalSaldo)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Saldo pendiente</p>
              <p className="text-lg font-bold text-destructive">{fmt(totalSaldo)}</p>
            </div>
          </div>
        </div>

        {/* Pending purchases */}
        <div>
          <h3 className="text-sm font-semibold mb-2 text-destructive flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Compras con saldo pendiente ({comprasPendientes.length})
          </h3>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Folio</TableHead>
                  <TableHead className="text-[11px]">Fecha</TableHead>
                  <TableHead className="text-[11px] text-center">Días crédito</TableHead>
                  <TableHead className="text-[11px] text-right">Total</TableHead>
                  <TableHead className="text-[11px] text-right">Pagado</TableHead>
                  <TableHead className="text-[11px] text-right">Pendiente</TableHead>
                  <TableHead className="text-[11px] text-center">Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {comprasPendientes.map(c => (
                  <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/almacen/compras/${c.id}`)}>
                    <TableCell className="font-mono text-[11px]">{c.folio ?? c.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                    <TableCell className="text-center text-[12px] text-muted-foreground">{c.dias_credito ?? 0}d</TableCell>
                    <TableCell className="text-right text-[12px]">{fmt(c.total ?? 0)}</TableCell>
                    <TableCell className="text-right text-[12px] text-success">{fmt((c.total ?? 0) - (c.saldo_pendiente ?? 0))}</TableCell>
                    <TableCell className="text-right font-bold text-destructive">{fmt(c.saldo_pendiente ?? 0)}</TableCell>
                    <TableCell className="text-center"><StatusChip status={c.status} /></TableCell>
                  </TableRow>
                ))}
                {comprasPendientes.length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center py-6 text-muted-foreground text-sm">Sin saldos pendientes 🎉</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </div>

        {/* Paid purchases */}
        {comprasPagadas.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2 text-success flex items-center gap-2">
              <FileText className="h-4 w-4" /> Compras liquidadas ({comprasPagadas.length})
            </h3>
            <div className="bg-card border border-border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Folio</TableHead>
                    <TableHead className="text-[11px]">Fecha</TableHead>
                    <TableHead className="text-[11px] text-right">Total</TableHead>
                    <TableHead className="text-[11px] text-center">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {comprasPagadas.slice(0, 30).map(c => (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/almacen/compras/${c.id}`)}>
                      <TableCell className="font-mono text-[11px]">{c.folio ?? c.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                      <TableCell className="text-right text-[12px]">{fmt(c.total ?? 0)}</TableCell>
                      <TableCell className="text-center"><StatusChip status={c.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {loadingDetalle && <p className="text-center text-muted-foreground py-4">Cargando...</p>}
      </div>
    );
  }

  /* ═══════════════════════════════════════════
     VIEW 1 — Supplier list
     ═══════════════════════════════════════════ */
  return (
    <div className="p-4 space-y-4 min-h-full">
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Truck className="h-5 w-5" /> Saldos por proveedor
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total por pagar</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendienteGlobal)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Proveedores con saldo</p>
          <p className="text-2xl font-bold text-foreground">{provConSaldo}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total proveedores</p>
          <p className="text-2xl font-bold text-muted-foreground">{proveedores?.length ?? 0}</p>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar proveedor..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Proveedor</TableHead>
              <TableHead className="text-[11px] text-center">Compras</TableHead>
              <TableHead className="text-[11px] text-right">Total comprado</TableHead>
              <TableHead className="text-[11px] text-right">Saldo pendiente</TableHead>
              <TableHead className="text-[11px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(p => (
              <TableRow key={p.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedId(p.id)}>
                <TableCell className="font-medium text-[12px]">{p.nombre}</TableCell>
                <TableCell className="text-center text-[12px]">{p.docs}</TableCell>
                <TableCell className="text-right text-[12px]">{fmt(p.totalComprado)}</TableCell>
                <TableCell className={cn("text-right font-bold text-[12px]", p.saldoPendiente > 0.01 ? 'text-destructive' : 'text-success')}>
                  {fmt(p.saldoPendiente)}
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Sin proveedores con compras</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
