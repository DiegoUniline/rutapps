import { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, Banknote, Building2, CreditCard, Wallet, Check, ArrowLeft, AlertTriangle, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { StatusChip } from '@/components/StatusChip';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { printTicket } from '@/lib/printTicketUtil';
import { buildCobroTicketData } from '@/lib/cobroTicket';

/* ──────────── types ──────────── */
interface PendingSale {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  condicion_pago: string;
  status: string;
  montoAplicar: number;
}

type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta';

/* ──────────── hooks ──────────── */
function useClientesConSaldo(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-con-saldo', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // Get all ventas with saldo > 0 grouped by client
      const { data, error } = await supabase
        .from('ventas')
        .select('cliente_id, saldo_pendiente, total, clientes(id, nombre, codigo, telefono)')
        .eq('empresa_id', empresa!.id)
        .gt('saldo_pendiente', 0.009)
        .neq('status', 'cancelado');
      if (error) throw error;

      // Aggregate by client
      const map = new Map<string, { id: string; nombre: string; codigo: string | null; telefono: string | null; saldo: number; docs: number }>();
      (data ?? []).forEach((v: any) => {
        const cid = v.cliente_id;
        if (!cid) return;
        const existing = map.get(cid);
        const clienteNombre = v.clientes?.nombre ?? 'Sin cliente';
        const clienteCodigo = v.clientes?.codigo ?? null;
        const clienteTel = v.clientes?.telefono ?? null;
        if (existing) {
          existing.saldo += v.saldo_pendiente ?? 0;
          existing.docs += 1;
        } else {
          map.set(cid, { id: cid, nombre: clienteNombre, codigo: clienteCodigo, telefono: clienteTel, saldo: v.saldo_pendiente ?? 0, docs: 1 });
        }
      });

      return Array.from(map.values()).sort((a, b) => b.saldo - a.saldo);
    },
  });
}

function useVentasPendientes(clienteId: string | null) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['ventas-pendientes-aplicar', empresa?.id, clienteId],
    enabled: !!empresa?.id && !!clienteId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status')
        .eq('empresa_id', empresa!.id)
        .eq('cliente_id', clienteId!)
        .gt('saldo_pendiente', 0)
        .neq('status', 'cancelado')
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

const CONDICION_LABELS: Record<string, string> = { contado: 'Contado', credito: 'Crédito', por_definir: 'Por definir' };

/* ──────────── main ──────────── */
export default function AplicarPagosPage() {
  const navigate = useNavigate();
  const { empresa, user } = useAuth();
  const { fmt: fmtCurrency, symbol } = useCurrency();
  const queryClient = useQueryClient();

  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string; codigo: string | null } | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [ventas, setVentas] = useState<PendingSale[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: clientesRaw, isLoading: loadingClientes } = useClientesConSaldo(clienteSearch);
  const { data: ventasRaw, isLoading: loadingVentas } = useVentasPendientes(selectedCliente?.id ?? null);

  const clientes = useMemo(() => {
    if (!clientesRaw) return [];
    if (!clienteSearch) return clientesRaw;
    const s = clienteSearch.toLowerCase();
    return clientesRaw.filter(c => c.nombre.toLowerCase().includes(s) || (c.codigo ?? '').toLowerCase().includes(s));
  }, [clientesRaw, clienteSearch]);

  const totalSaldoGlobal = clientesRaw?.reduce((s, c) => s + c.saldo, 0) ?? 0;
  const totalDocsGlobal = clientesRaw?.reduce((s, c) => s + c.docs, 0) ?? 0;

  useMemo(() => {
    if (ventasRaw) setVentas(ventasRaw.map(v => ({ ...v, montoAplicar: 0 })));
  }, [ventasRaw]);

  const totalPendiente = ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
  const totalDistribuido = ventas.reduce((s, v) => s + v.montoAplicar, 0);
  const montoNum = parseFloat(montoRecibido) || 0;
  const sinDistribuir = montoNum - totalDistribuido;

  const fmt = (n: number) => fmtCurrency(n);

  const updateMonto = useCallback((id: string, monto: number) => {
    setVentas(prev => prev.map(v => v.id === id ? { ...v, montoAplicar: Math.min(Math.max(0, monto), v.saldo_pendiente) } : v));
  }, []);

  const distribuirFIFO = useCallback(() => {
    if (!montoNum) return;
    let restante = montoNum;
    setVentas(prev => prev.map(v => {
      const aplicar = Math.min(restante, v.saldo_pendiente);
      restante -= aplicar;
      return { ...v, montoAplicar: aplicar };
    }));
  }, [montoNum]);

  const limpiarDistribucion = useCallback(() => {
    setVentas(prev => prev.map(v => ({ ...v, montoAplicar: 0 })));
  }, []);

  const handleSelectCliente = (c: any) => {
    setSelectedCliente({ id: c.id, nombre: c.nombre, codigo: c.codigo });
    setMontoRecibido('');
    setReferencia('');
    setNotas('');
  };

  const handleBack = () => {
    setSelectedCliente(null);
    setVentas([]);
    setMontoRecibido('');
  };

  const handleAplicar = async () => {
    if (!empresa?.id || !user?.id || !selectedCliente) return;
    const aplicaciones = ventas.filter(v => v.montoAplicar > 0);
    if (aplicaciones.length === 0) { toast.error('Distribuye el monto a al menos una venta'); return; }
    if (totalDistribuido <= 0) { toast.error('El monto a distribuir debe ser mayor a 0'); return; }

    setSaving(true);
    try {
      const { data: cobro, error: cobroErr } = await supabase.from('cobros').insert({
        empresa_id: empresa.id,
        cliente_id: selectedCliente.id,
        user_id: user.id,
        monto: totalDistribuido,
        metodo_pago: metodoPago,
        referencia: referencia || null,
        notas: notas || null,
        fecha: new Date().toISOString().slice(0, 10),
      }).select('id').single();
      if (cobroErr) throw cobroErr;

      for (const v of aplicaciones) {
        await supabase.from('cobro_aplicaciones').insert({ cobro_id: cobro.id, venta_id: v.id, monto_aplicado: v.montoAplicar });
        const nuevoSaldo = Math.max(0, v.saldo_pendiente - v.montoAplicar);
        await supabase.from('ventas').update({ saldo_pendiente: nuevoSaldo }).eq('id', v.id);
      }

      toast.success(`Pago de ${symbol}${fmt(totalDistribuido)} aplicado a ${aplicaciones.length} venta(s)`);
      queryClient.invalidateQueries({ queryKey: ['ventas-pendientes-aplicar'] });
      queryClient.invalidateQueries({ queryKey: ['clientes-con-saldo'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      queryClient.invalidateQueries({ queryKey: ['cobros'] });

      // Print ticket
      if (empresa) {
        const ticketData = buildCobroTicketData({
          empresa: {
            nombre: empresa.nombre ?? '',
            rfc: (empresa as any).rfc,
            razon_social: (empresa as any).razon_social,
            direccion: (empresa as any).direccion,
            colonia: (empresa as any).colonia,
            ciudad: (empresa as any).ciudad,
            estado: (empresa as any).estado,
            cp: (empresa as any).cp,
            telefono: (empresa as any).telefono,
            email: (empresa as any).email,
            logo_url: (empresa as any).logo_url,
            moneda: (empresa as any).moneda,
            notas_ticket: (empresa as any).notas_ticket,
            ticket_campos: (empresa as any).ticket_campos,
          },
          cobro: {
            id: cobro.id,
            fecha: new Date().toISOString().slice(0, 10),
            monto: totalDistribuido,
            metodo_pago: metodoPago,
            referencia,
            notas,
          },
          clienteNombre: selectedCliente.nombre,
          aplicaciones: aplicaciones.map(v => ({
            folio: v.folio,
            monto: v.montoAplicar,
            saldoAnterior: v.saldo_pendiente,
            saldoNuevo: Math.max(0, v.saldo_pendiente - v.montoAplicar),
          })),
        });
        printTicket(ticketData, { ticketAncho: (empresa as any).ticket_ancho ?? '80' });
      }

      handleBack();
    } catch (e: any) {
      toast.error(e.message || 'Error al aplicar pago');
    } finally {
      setSaving(false);
    }
  };

  /* ════════════════════════════════════════════════════════
     VIEW 1 — Client list (only those with saldo > 0)
     ════════════════════════════════════════════════════════ */
  if (!selectedCliente) {
    return (
      <div className="p-4 space-y-3 min-h-full">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </button>
          <h1 className="text-xl font-semibold text-foreground">Aplicar Pagos</h1>
        </div>

        {/* Search */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar cliente por nombre o código..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="pl-9" />
          </div>
        </div>

        {/* Summary bar */}
        {!loadingClientes && (clientesRaw?.length ?? 0) > 0 && (
          <div className="flex flex-wrap items-center gap-3 sm:gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
            <span><strong className="text-foreground">{clientesRaw?.length ?? 0}</strong> clientes con saldo</span>
            <span><strong className="text-foreground">{totalDocsGlobal}</strong> documentos</span>
            <span>Total pendiente: <strong className="text-warning">{fmt(totalSaldoGlobal)}</strong></span>
          </div>
        )}

        {/* Table */}
        {loadingClientes ? (
          <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={8} cols={5} /></div>
        ) : (
          <div className="bg-card border border-border rounded overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-table-border text-left">
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Cliente</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden sm:table-cell">Teléfono</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center">Documentos</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Saldo pendiente</th>
                  <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {clientes.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">
                    <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
                    No hay clientes con saldo pendiente
                  </td></tr>
                )}
                {clientes.map(c => (
                  <tr key={c.id} className="border-b border-table-border cursor-pointer hover:bg-table-hover transition-colors" onClick={() => handleSelectCliente(c)}>
                    <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{c.codigo ?? '—'}</td>
                    <td className="py-2 px-3 font-medium">{c.nombre}</td>
                    <td className="py-2 px-3 text-muted-foreground hidden sm:table-cell">{c.telefono ?? '—'}</td>
                    <td className="py-2 px-3 text-center">
                      <Badge variant="secondary" className="text-[11px]">{c.docs}</Badge>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold text-warning tabular-nums">{fmt(c.saldo)}</td>
                    <td className="py-2 px-3 text-right">
                      <button className="btn-odoo-secondary text-[11px] py-1 px-2.5">Aplicar pago</button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {clientes.length > 0 && (
                <tfoot>
                  <tr className="bg-card border-t border-border font-semibold text-[12px]">
                    <td colSpan={4} className="py-2 px-3 text-muted-foreground">{clientes.length} clientes</td>
                    <td className="py-2 px-3 text-right tabular-nums text-warning font-bold">{fmt(clientes.reduce((s, c) => s + c.saldo, 0))}</td>
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
     VIEW 2 — Payment distribution for selected client
     ════════════════════════════════════════════════════════ */
  return (
    <div className="p-4 space-y-3 min-h-full">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold text-foreground">Aplicar Pago</h1>
          <p className="text-sm text-muted-foreground">{selectedCliente.nombre} {selectedCliente.codigo ? `(${selectedCliente.codigo})` : ''}</p>
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
          <label className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block mb-2">Monto recibido</label>
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
            <span className="text-muted-foreground">Total pendiente</span>
            <span className="font-semibold text-warning tabular-nums">{symbol}{fmt(totalPendiente)}</span>
          </div>
          <div className="flex justify-between text-xs">
            <span className="text-muted-foreground">Distribuido</span>
            <span className="font-bold text-primary tabular-nums">{symbol}{fmt(totalDistribuido)}</span>
          </div>
          {sinDistribuir > 0.01 && (
            <div className="flex items-center gap-1 text-[11px] text-warning bg-warning/10 rounded px-2 py-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> {symbol}{fmt(sinDistribuir)} sin distribuir
            </div>
          )}
          {sinDistribuir < -0.01 && (
            <div className="flex items-center gap-1 text-[11px] text-destructive bg-destructive/10 rounded px-2 py-1 font-medium">
              <AlertTriangle className="h-3 w-3" /> Excede el monto recibido
            </div>
          )}
          <div className="flex gap-1.5 pt-1">
            <button onClick={distribuirFIFO} disabled={!montoNum} className="btn-odoo-secondary flex-1 text-[11px] py-1.5 disabled:opacity-40">FIFO</button>
            <button onClick={limpiarDistribucion} className="btn-odoo-secondary flex-1 text-[11px] py-1.5 text-destructive hover:text-destructive">Limpiar</button>
          </div>
        </div>
      </div>

      {/* Ventas table */}
      {loadingVentas ? (
        <div className="bg-card border border-border rounded p-4"><TableSkeleton rows={6} cols={7} /></div>
      ) : (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="border-b border-table-border text-left">
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Folio</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Fecha</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Condición</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Estado</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Total</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Pendiente</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right w-[180px]">Aplicar</th>
                <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-center w-[120px]">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {ventas.length === 0 && (
                <tr><td colSpan={8} className="text-center py-12 text-muted-foreground">
                  <Banknote className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  Este cliente no tiene ventas pendientes
                </td></tr>
              )}
              {ventas.map(v => {
                const isLiquidada = v.montoAplicar >= v.saldo_pendiente - 0.01 && v.montoAplicar > 0;
                return (
                  <tr key={v.id} className={cn('border-b border-table-border transition-colors', v.montoAplicar > 0 ? 'bg-success/5' : 'hover:bg-table-hover')}>
                    <td className="py-2 px-3 font-mono text-xs font-medium">{v.folio ?? v.id.slice(0, 8)}</td>
                    <td className="py-2 px-3 text-muted-foreground">{fmtDate(v.fecha)}</td>
                    <td className="py-2 px-3">
                      <span className="text-[11px] px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{CONDICION_LABELS[v.condicion_pago] ?? v.condicion_pago}</span>
                    </td>
                    <td className="py-2 px-3"><StatusChip status={v.status} /></td>
                    <td className="py-2 px-3 text-right tabular-nums">{fmt(v.total)}</td>
                    <td className="py-2 px-3 text-right font-semibold text-warning tabular-nums">{fmt(v.saldo_pendiente)}</td>
                    <td className="py-2 px-3 text-right">
                      <div className="relative inline-flex">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-muted-foreground">{symbol}</span>
                        <input type="number" inputMode="decimal"
                          className="w-[140px] bg-accent/40 rounded-lg pl-6 pr-2 py-1.5 text-sm font-medium text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          value={v.montoAplicar || ''} placeholder="0.00"
                          onChange={e => updateMonto(v.id, parseFloat(e.target.value) || 0)}
                        />
                      </div>
                    </td>
                    <td className="py-2 px-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => updateMonto(v.id, v.saldo_pendiente)}
                          className={cn('text-[11px] px-2 py-1 rounded font-medium transition-all',
                            isLiquidada ? 'bg-success text-white' : 'bg-accent text-foreground hover:bg-accent/80')}>
                          {isLiquidada ? '✓ Liquidar' : 'Liquidar'}
                        </button>
                        {v.montoAplicar > 0 && (
                          <button onClick={() => updateMonto(v.id, 0)} className="text-[11px] text-destructive font-medium hover:underline">Quitar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {ventas.length > 0 && (
              <tfoot>
                <tr className="bg-card border-t border-border font-semibold text-[12px]">
                  <td colSpan={5} className="py-2 px-3 text-muted-foreground">{ventas.length} ventas pendientes</td>
                  <td className="py-2 px-3 text-right tabular-nums text-warning font-bold">{fmt(totalPendiente)}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-primary font-bold">{fmt(totalDistribuido)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}

      {/* Bottom CTA */}
      {ventas.length > 0 && (
        <div className="flex justify-end">
          <Button onClick={handleAplicar} disabled={saving || totalDistribuido <= 0 || sinDistribuir < -0.01}
            className="bg-success hover:bg-success/90 text-white py-2.5 px-8 text-sm font-bold gap-2">
            <Check className="h-4 w-4" /> {saving ? 'Procesando...' : `Aplicar pago ${symbol}${fmt(totalDistribuido)}`}
          </Button>
        </div>
      )}
    </div>
  );
}
