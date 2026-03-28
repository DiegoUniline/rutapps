import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Search, Banknote, Building2, CreditCard, Wallet, Check, ArrowLeft, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

/* ──────────────── types ──────────────── */
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

/* ──────────────── hooks ──────────────── */
function useClientes(search: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-aplicar-pagos', empresa?.id, search],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase.from('clientes').select('id, nombre, codigo, telefono').eq('empresa_id', empresa!.id).eq('status', 'activo').order('nombre');
      const { data, error } = await q;
      if (error) throw error;
      let list = data ?? [];
      if (search) {
        const s = search.toLowerCase();
        list = list.filter(c => (c.nombre ?? '').toLowerCase().includes(s) || (c.codigo ?? '').toLowerCase().includes(s));
      }
      return list;
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

/* ──────────────── main ──────────────── */
export default function AplicarPagosPage() {
  const { empresa, user } = useAuth();
  const { fmt, symbol } = useCurrency();
  const queryClient = useQueryClient();

  const [clienteSearch, setClienteSearch] = useState('');
  const [selectedCliente, setSelectedCliente] = useState<{ id: string; nombre: string; codigo: string | null } | null>(null);
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [ventas, setVentas] = useState<PendingSale[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: clientes, isLoading: loadingClientes } = useClientes(clienteSearch);
  const { data: ventasRaw, isLoading: loadingVentas } = useVentasPendientes(selectedCliente?.id ?? null);

  // Sync ventas when raw data changes
  useMemo(() => {
    if (ventasRaw) {
      setVentas(ventasRaw.map(v => ({ ...v, montoAplicar: 0 })));
    }
  }, [ventasRaw]);

  const totalPendiente = ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
  const totalDistribuido = ventas.reduce((s, v) => s + v.montoAplicar, 0);
  const montoNum = parseFloat(montoRecibido) || 0;
  const sinDistribuir = montoNum - totalDistribuido;

  const updateMonto = useCallback((id: string, monto: number) => {
    setVentas(prev => prev.map(v => v.id === id ? { ...v, montoAplicar: Math.min(Math.max(0, monto), v.saldo_pendiente) } : v));
  }, []);

  const liquidarTodas = useCallback(() => {
    if (!montoNum) return;
    let restante = montoNum;
    setVentas(prev => prev.map(v => {
      const aplicar = Math.min(restante, v.saldo_pendiente);
      restante -= aplicar;
      return { ...v, montoAplicar: aplicar };
    }));
  }, [montoNum]);

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
      // 1. Create cobro
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

      // 2. Create aplicaciones & update saldos
      for (const v of aplicaciones) {
        await supabase.from('cobro_aplicaciones').insert({
          cobro_id: cobro.id,
          venta_id: v.id,
          monto_aplicado: v.montoAplicar,
        });
        const nuevoSaldo = Math.max(0, v.saldo_pendiente - v.montoAplicar);
        await supabase.from('ventas').update({ saldo_pendiente: nuevoSaldo }).eq('id', v.id);
      }

      toast.success(`Pago de ${symbol}${fmt(totalDistribuido)} aplicado correctamente a ${aplicaciones.length} venta(s)`);
      queryClient.invalidateQueries({ queryKey: ['ventas-pendientes-aplicar'] });
      queryClient.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      queryClient.invalidateQueries({ queryKey: ['cobros'] });
      setMontoRecibido('');
      setReferencia('');
      setNotas('');
    } catch (e: any) {
      toast.error(e.message || 'Error al aplicar pago');
    } finally {
      setSaving(false);
    }
  };

  /* ──── CLIENT LIST VIEW ──── */
  if (!selectedCliente) {
    return (
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Aplicar Pagos</h1>
          <p className="text-sm text-muted-foreground mt-1">Selecciona un cliente para distribuir un pago a sus cuentas pendientes</p>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por nombre o código..." value={clienteSearch} onChange={e => setClienteSearch(e.target.value)} className="pl-9" />
        </div>

        <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30">
                <TableHead className="font-semibold">Código</TableHead>
                <TableHead className="font-semibold">Cliente</TableHead>
                <TableHead className="font-semibold">Teléfono</TableHead>
                <TableHead className="text-right font-semibold">Acción</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingClientes ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : (clientes ?? []).length === 0 ? (
                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No se encontraron clientes</TableCell></TableRow>
              ) : (clientes ?? []).map(c => (
                <TableRow key={c.id} className="cursor-pointer hover:bg-accent/40 transition-colors" onClick={() => handleSelectCliente(c)}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{c.codigo ?? '—'}</TableCell>
                  <TableCell className="font-medium">{c.nombre}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{c.telefono ?? '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="outline" className="text-xs">Aplicar pago</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  }

  /* ──── PAYMENT DISTRIBUTION VIEW ──── */
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={handleBack} className="p-2 rounded-lg hover:bg-accent transition-colors">
          <ArrowLeft className="h-5 w-5 text-muted-foreground" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Aplicar Pago</h1>
          <p className="text-sm text-muted-foreground">
            {selectedCliente.nombre} {selectedCliente.codigo ? `(${selectedCliente.codigo})` : ''}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left: Payment config */}
        <div className="space-y-4">
          {/* Method */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Método de pago</label>
            <div className="grid grid-cols-3 gap-1.5">
              {([['efectivo', 'Efectivo', Wallet], ['transferencia', 'Transfer.', Building2], ['tarjeta', 'Tarjeta', CreditCard]] as const).map(([val, label, Icon]) => (
                <button key={val} onClick={() => setMetodoPago(val)}
                  className={cn('flex flex-col items-center gap-1 py-3 rounded-lg text-xs font-semibold transition-all',
                    metodoPago === val ? 'bg-primary text-primary-foreground shadow-sm' : 'bg-accent/60 text-foreground hover:bg-accent')}>
                  <Icon className="h-4 w-4" />{label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Monto recibido</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-lg font-medium text-muted-foreground">{symbol}</span>
              <input type="number" inputMode="decimal" min="0"
                className="w-full bg-accent/40 rounded-lg pl-8 pr-3 py-3 text-2xl font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={montoRecibido} placeholder="0.00"
                onChange={e => { const v = parseFloat(e.target.value); if (e.target.value === '' || v >= 0) setMontoRecibido(e.target.value); }}
              />
            </div>
            {metodoPago !== 'efectivo' && (
              <div className="mt-3">
                <label className="text-xs text-muted-foreground font-medium">Referencia</label>
                <Input className="mt-1" placeholder="No. de referencia" value={referencia} onChange={e => setReferencia(e.target.value)} />
              </div>
            )}
            <div className="mt-3">
              <label className="text-xs text-muted-foreground font-medium">Notas (opcional)</label>
              <Input className="mt-1" placeholder="Notas del pago" value={notas} onChange={e => setNotas(e.target.value)} />
            </div>
          </div>

          {/* Quick actions */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-2">Distribución rápida</label>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2" onClick={distribuirFIFO} disabled={!montoNum}>
              <Banknote className="h-4 w-4" /> Distribuir FIFO (antiguas primero)
            </Button>
            <Button variant="outline" size="sm" className="w-full justify-start gap-2 text-destructive hover:text-destructive" onClick={limpiarDistribucion}>
              Limpiar distribución
            </Button>
          </div>

          {/* Summary card */}
          <div className="bg-card border border-border rounded-xl p-4 shadow-sm space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total pendiente del cliente</span>
              <span className="font-semibold text-destructive tabular-nums">{symbol}{fmt(totalPendiente)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Monto recibido</span>
              <span className="font-semibold text-foreground tabular-nums">{symbol}{fmt(montoNum)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total distribuido</span>
              <span className="font-semibold text-primary tabular-nums">{symbol}{fmt(totalDistribuido)}</span>
            </div>
            {sinDistribuir > 0.01 && (
              <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded-lg px-3 py-2 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> {symbol}{fmt(sinDistribuir)} sin distribuir
              </div>
            )}
            {sinDistribuir < -0.01 && (
              <div className="flex items-center gap-1.5 text-destructive bg-destructive/10 rounded-lg px-3 py-2 text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> Distribución excede el monto recibido
              </div>
            )}
          </div>

          {/* CTA */}
          <Button onClick={handleAplicar} disabled={saving || totalDistribuido <= 0 || sinDistribuir < -0.01}
            className="w-full bg-green-600 hover:bg-green-700 text-white py-3 text-base font-bold gap-2">
            <Check className="h-5 w-5" /> {saving ? 'Procesando...' : `Aplicar ${symbol}${fmt(totalDistribuido)}`}
          </Button>
        </div>

        {/* Right: Pending sales table */}
        <div className="lg:col-span-2">
          <div className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
            <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center justify-between">
              <h2 className="font-semibold text-foreground">Ventas pendientes <Badge variant="secondary" className="ml-2">{ventas.length}</Badge></h2>
              <p className="text-sm text-muted-foreground">Total: <span className="font-semibold text-destructive">{symbol}{fmt(totalPendiente)}</span></p>
            </div>

            {loadingVentas ? (
              <div className="py-12 text-center text-muted-foreground">Cargando ventas...</div>
            ) : ventas.length === 0 ? (
              <div className="py-12 text-center">
                <Banknote className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
                <p className="text-muted-foreground">Este cliente no tiene ventas pendientes</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Folio</TableHead>
                    <TableHead className="font-semibold">Fecha</TableHead>
                    <TableHead className="font-semibold">Condición</TableHead>
                    <TableHead className="text-right font-semibold">Total</TableHead>
                    <TableHead className="text-right font-semibold">Pendiente</TableHead>
                    <TableHead className="text-right font-semibold w-[200px]">Aplicar</TableHead>
                    <TableHead className="w-[100px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventas.map(v => {
                    const isLiquidada = v.montoAplicar >= v.saldo_pendiente - 0.01 && v.montoAplicar > 0;
                    return (
                      <TableRow key={v.id} className={cn(v.montoAplicar > 0 && 'bg-green-50/50 dark:bg-green-950/10')}>
                        <TableCell className="font-medium">{v.folio ?? '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-sm">{fmtDate(v.fecha)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs capitalize">{v.condicion_pago}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{symbol}{fmt(v.total)}</TableCell>
                        <TableCell className="text-right tabular-nums font-medium text-destructive">{symbol}{fmt(v.saldo_pendiente)}</TableCell>
                        <TableCell className="text-right">
                          <div className="relative inline-flex">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{symbol}</span>
                            <input type="number" inputMode="decimal"
                              className="w-[140px] bg-accent/40 rounded-lg pl-6 pr-2 py-2 text-sm font-medium text-foreground text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/40 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                              value={v.montoAplicar || ''} placeholder="0.00"
                              onChange={e => updateMonto(v.id, parseFloat(e.target.value) || 0)}
                            />
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <button onClick={() => updateMonto(v.id, v.saldo_pendiente)}
                              className={cn('text-xs px-2 py-1 rounded font-medium transition-all',
                                isLiquidada ? 'bg-green-600 text-white' : 'bg-accent text-foreground hover:bg-accent/80')}>
                              {isLiquidada ? '✓ Liquidar' : 'Liquidar'}
                            </button>
                            {v.montoAplicar > 0 && (
                              <button onClick={() => updateMonto(v.id, 0)} className="text-xs text-destructive font-medium hover:underline">Quitar</button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
