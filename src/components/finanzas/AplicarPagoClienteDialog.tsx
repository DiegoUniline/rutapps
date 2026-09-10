import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Banknote, CreditCard, Wallet, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, roundMoney, todayInTimezone, cn } from '@/lib/utils';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { printTicket } from '@/lib/printTicketUtil';
import { buildCobroTicketData } from '@/lib/cobroTicket';
import { enviarReciboCobro } from '@/lib/enviarReciboCobro';

type MetodoPago = 'efectivo' | 'transferencia' | 'tarjeta';

type ClientePago = {
  id: string;
  nombre: string;
  codigo?: string | null;
};

type PendingSale = {
  id: string;
  folio: string | null;
  fecha: string;
  total: number;
  saldo_pendiente: number;
  condicion_pago: string;
  status: string;
  montoAplicar: number;
};

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cliente: ClientePago | null;
  onApplied?: () => void;
}

const CONDICION_LABELS: Record<string, string> = {
  contado: 'Contado',
  credito: 'Crédito',
  por_definir: 'Por definir',
};

export default function AplicarPagoClienteDialog({ open, onOpenChange, cliente, onApplied }: Props) {
  const { empresa, user } = useAuth();
  const { fmt: fmtCurrency, symbol } = useCurrency();
  const queryClient = useQueryClient();
  const [metodoPago, setMetodoPago] = useState<MetodoPago>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState('');
  const [referencia, setReferencia] = useState('');
  const [notas, setNotas] = useState('');
  const [ventas, setVentas] = useState<PendingSale[]>([]);
  const [saving, setSaving] = useState(false);

  const { data: ventasRaw, isLoading } = useQuery({
    queryKey: ['ventas-pendientes-aplicar', empresa?.id, cliente?.id],
    enabled: open && !!empresa?.id && !!cliente?.id,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status')
        .eq('empresa_id', empresa!.id)
        .eq('cliente_id', cliente!.id)
        .gt('saldo_pendiente', 0.009)
        .neq('status', 'cancelado')
        .order('fecha', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setMetodoPago('efectivo');
    setMontoRecibido('');
    setReferencia('');
    setNotas('');
    setVentas([]);
  }, [open, cliente?.id]);

  useEffect(() => {
    if (!ventasRaw) return;
    setVentas(ventasRaw.map(v => ({
      ...v,
      total: roundMoney(v.total ?? 0),
      saldo_pendiente: roundMoney(v.saldo_pendiente ?? 0),
      montoAplicar: 0,
    })) as PendingSale[]);
  }, [ventasRaw]);

  const fmt = (n: number) => fmtCurrency(roundMoney(n));
  const totalPendiente = useMemo(() => roundMoney(ventas.reduce((s, v) => s + v.saldo_pendiente, 0)), [ventas]);
  const totalDistribuido = useMemo(() => roundMoney(ventas.reduce((s, v) => s + v.montoAplicar, 0)), [ventas]);
  const montoNum = roundMoney(parseFloat(montoRecibido) || 0);
  const sinDistribuir = roundMoney(montoNum - totalDistribuido);

  const updateMonto = useCallback((id: string, monto: number) => {
    const normalizado = roundMoney(monto);
    setVentas(prev => prev.map(v => v.id === id
      ? { ...v, montoAplicar: roundMoney(Math.min(Math.max(0, normalizado), v.saldo_pendiente)) }
      : v));
  }, []);

  const distribuirFIFO = useCallback((monto = montoNum) => {
    let restante = roundMoney(monto);
    setVentas(prev => prev.map(v => {
      const aplicar = roundMoney(Math.min(Math.max(restante, 0), v.saldo_pendiente));
      restante = roundMoney(restante - aplicar);
      return { ...v, montoAplicar: aplicar };
    }));
  }, [montoNum]);

  const liquidarSaldo = () => {
    setMontoRecibido(String(totalPendiente));
    distribuirFIFO(totalPendiente);
  };

  const handleAplicar = async () => {
    if (!empresa?.id || !user?.id || !cliente) return;
    const aplicaciones = ventas.filter(v => v.montoAplicar > 0);
    if (!aplicaciones.length) {
      toast.error('Distribuye el monto a al menos una venta');
      return;
    }
    if (totalDistribuido <= 0) return;

    setSaving(true);
    try {
      const { data: cobroId, error } = await (supabase as any).rpc('aplicar_cobro', {
        p_empresa_id: empresa.id,
        p_cliente_id: cliente.id,
        p_monto: roundMoney(totalDistribuido),
        p_metodo: metodoPago,
        p_referencia: referencia || null,
        p_fecha: todayInTimezone(empresa.zona_horaria),
        p_aplicaciones: aplicaciones.map(v => ({ venta_id: v.id, monto_aplicado: roundMoney(v.montoAplicar) })),
        p_notas: notas || null,
        p_user_id: user.id,
      });
      if (error) throw error;

      toast.success(`Pago de ${fmt(totalDistribuido)} aplicado a ${aplicaciones.length} venta(s)`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['ventas-pendientes-aplicar', empresa.id, cliente.id] }),
        queryClient.invalidateQueries({ queryKey: ['clientes-con-saldo'] }),
        queryClient.invalidateQueries({ queryKey: ['clientes-saldo-resumen'] }),
        queryClient.invalidateQueries({ queryKey: ['cliente-estado-cuenta', empresa.id, cliente.id] }),
        queryClient.invalidateQueries({ queryKey: ['cuentas-cobrar'] }),
        queryClient.invalidateQueries({ queryKey: ['cobros'] }),
      ]);

      enviarReciboCobro(cobroId, empresa.id);
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
          id: cobroId,
          fecha: todayInTimezone(empresa.zona_horaria),
          monto: totalDistribuido,
          metodo_pago: metodoPago,
          referencia,
          notas,
        },
        clienteNombre: cliente.nombre,
        aplicaciones: aplicaciones.map(v => ({
          folio: v.folio,
          monto: roundMoney(v.montoAplicar),
          saldoAnterior: roundMoney(v.saldo_pendiente),
          saldoNuevo: roundMoney(Math.max(0, v.saldo_pendiente - v.montoAplicar)),
        })),
      });
      printTicket(ticketData, { ticketAncho: (empresa as any).ticket_ancho ?? '80' });

      onOpenChange(false);
      onApplied?.();
    } catch (e: any) {
      toast.error(e?.message || 'Error al aplicar pago');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="w-[min(96vw,1100px)] sm:max-w-5xl max-h-[92dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5 text-primary" /> Aplicar pago
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            {cliente?.nombre}{cliente?.codigo ? ` · ${cliente.codigo}` : ''}
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="py-12 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando documentos pendientes…
          </div>
        ) : ventas.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">Este cliente no tiene documentos con saldo pendiente.</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] text-muted-foreground uppercase">Saldo pendiente</p>
                <p className="text-xl font-bold">{fmt(totalPendiente)}</p>
              </div>
              <div className="rounded-lg border bg-card p-3 md:col-span-2">
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Monto recibido</label>
                <div className="flex gap-2 mt-1">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">{symbol}</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={montoRecibido}
                      onChange={e => setMontoRecibido(e.target.value)}
                      className="pl-7"
                      placeholder="0.00"
                    />
                  </div>
                  <Button variant="outline" onClick={() => distribuirFIFO()} disabled={montoNum <= 0}>Distribuir</Button>
                  <Button variant="outline" onClick={liquidarSaldo}>Liquidar saldo</Button>
                </div>
              </div>
              <div className="rounded-lg border bg-card p-3">
                <p className="text-[11px] text-muted-foreground uppercase">Distribuido</p>
                <p className="text-xl font-bold text-success">{fmt(totalDistribuido)}</p>
                {Math.abs(sinDistribuir) > 0.009 && montoNum > 0 && (
                  <p className={cn('text-[11px] mt-1', sinDistribuir < 0 ? 'text-destructive' : 'text-muted-foreground')}>
                    {sinDistribuir > 0 ? `Sin distribuir: ${fmt(sinDistribuir)}` : `Excede monto: ${fmt(Math.abs(sinDistribuir))}`}
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase mb-2">Método de pago</p>
              <div className="grid grid-cols-3 gap-2">
                <Button type="button" variant={metodoPago === 'efectivo' ? 'default' : 'outline'} onClick={() => setMetodoPago('efectivo')} className="gap-2">
                  <Banknote className="h-4 w-4" /> Efectivo
                </Button>
                <Button type="button" variant={metodoPago === 'transferencia' ? 'default' : 'outline'} onClick={() => setMetodoPago('transferencia')} className="gap-2">
                  <Wallet className="h-4 w-4" /> Transferencia
                </Button>
                <Button type="button" variant={metodoPago === 'tarjeta' ? 'default' : 'outline'} onClick={() => setMetodoPago('tarjeta')} className="gap-2">
                  <CreditCard className="h-4 w-4" /> Tarjeta
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Referencia</label>
                <Input value={referencia} onChange={e => setReferencia(e.target.value)} placeholder="Opcional" className="mt-1" />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase">Notas</label>
                <Input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" className="mt-1" />
              </div>
            </div>

            <div className="border rounded-lg overflow-auto max-h-[40dvh]">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b">
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Folio</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Fecha</th>
                    <th className="px-3 py-2 text-left font-medium text-muted-foreground">Condición</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Total</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground">Saldo</th>
                    <th className="px-3 py-2 text-right font-medium text-muted-foreground w-[150px]">Aplicar</th>
                  </tr>
                </thead>
                <tbody>
                  {ventas.map(v => (
                    <tr key={v.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-mono font-semibold">{v.folio ?? v.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{fmtDate(v.fecha)}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{CONDICION_LABELS[v.condicion_pago] ?? v.condicion_pago}</Badge></td>
                      <td className="px-3 py-2 text-right">{fmt(v.total)}</td>
                      <td className="px-3 py-2 text-right font-medium">{fmt(v.saldo_pendiente)}</td>
                      <td className="px-3 py-2">
                        <Input
                          type="number"
                          min="0"
                          max={v.saldo_pendiente}
                          step="0.01"
                          value={v.montoAplicar || ''}
                          onChange={e => updateMonto(v.id, parseFloat(e.target.value) || 0)}
                          className="h-8 text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter className="border-t pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancelar</Button>
          <Button onClick={handleAplicar} disabled={saving || isLoading || totalDistribuido <= 0} className="gap-2">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {saving ? 'Aplicando…' : `Aplicar ${fmt(totalDistribuido)}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
