import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate } from '@/lib/utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent } from '@/components/ui/card';
import { ShoppingCart, Banknote, Plus, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface Props {
  clienteId: string | null;
  clienteNombre: string;
  onClose: () => void;
}

export default function ClienteEstadoCuenta({ clienteId, clienteNombre, onClose }: Props) {
  const { empresa, user } = useAuth();
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();

  // New payment form
  const [showPagoForm, setShowPagoForm] = useState(false);
  const [pagoMonto, setPagoMonto] = useState('');
  const [pagoMetodo, setPagoMetodo] = useState('efectivo');
  const [pagoRef, setPagoRef] = useState('');

  // Ventas con saldo del cliente
  const { data: ventas, isLoading: loadingVentas } = useQuery({
    queryKey: ['edo-cuenta-ventas', empresa?.id, clienteId],
    enabled: !!empresa?.id && !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, status, condicion_pago, vendedores(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('cliente_id', clienteId!)
        .in('status', ['confirmado', 'entregado', 'facturado'] as any)
        .order('fecha', { ascending: true });
      return data ?? [];
    },
  });

  // Cobros del cliente
  const { data: cobros, isLoading: loadingCobros } = useQuery({
    queryKey: ['edo-cuenta-cobros', empresa?.id, clienteId],
    enabled: !!empresa?.id && !!clienteId,
    queryFn: async () => {
      const { data } = await supabase
        .from('cobros')
        .select('id, fecha, monto, metodo_pago, referencia, notas, cobro_aplicaciones(venta_id, monto_aplicado, ventas(folio))')
        .eq('empresa_id', empresa!.id)
        .eq('cliente_id', clienteId!)
        .order('fecha', { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const ventasPendientes = (ventas ?? []).filter(v => (v.saldo_pendiente ?? 0) > 0);
  const ventasLiquidadas = (ventas ?? []).filter(v => (v.saldo_pendiente ?? 0) <= 0);
  const totalVendido = (ventas ?? []).reduce((s, v) => s + (v.total ?? 0), 0);
  const totalPendiente = ventasPendientes.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
  const totalCobrado = totalVendido - totalPendiente;

  // FIFO payment mutation
  const pagoMut = useMutation({
    mutationFn: async () => {
      const monto = parseFloat(pagoMonto);
      if (!monto || monto <= 0) throw new Error('Monto inválido');
      if (!clienteId || !empresa?.id || !user?.id) throw new Error('Datos incompletos');

      // Create cobro
      const { data: cobro, error: cobroErr } = await supabase
        .from('cobros')
        .insert({
          empresa_id: empresa.id,
          cliente_id: clienteId,
          user_id: user.id,
          monto,
          metodo_pago: pagoMetodo,
          referencia: pagoRef || null,
        })
        .select('id')
        .single();
      if (cobroErr) throw cobroErr;

      // Apply FIFO
      let restante = monto;
      for (const v of ventasPendientes) {
        if (restante <= 0) break;
        const saldo = v.saldo_pendiente ?? 0;
        const aplicar = Math.min(restante, saldo);

        await supabase.from('cobro_aplicaciones').insert({
          cobro_id: cobro.id,
          venta_id: v.id,
          monto_aplicado: aplicar,
        });

        const nuevoSaldo = Math.max(0, saldo - aplicar);
        await supabase.from('ventas').update({ saldo_pendiente: nuevoSaldo }).eq('id', v.id);

        restante -= aplicar;
      }
    },
    onSuccess: () => {
      toast.success('Pago aplicado correctamente');
      qc.invalidateQueries({ queryKey: ['edo-cuenta-ventas'] });
      qc.invalidateQueries({ queryKey: ['edo-cuenta-cobros'] });
      qc.invalidateQueries({ queryKey: ['clientes-deuda'] });
      qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      setShowPagoForm(false);
      setPagoMonto('');
      setPagoRef('');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al aplicar pago'),
  });

  const isLoading = loadingVentas || loadingCobros;

  return (
    <Sheet open={!!clienteId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
        <SheetHeader className="px-5 pt-5 pb-3 border-b border-border">
          <SheetTitle className="text-lg">{clienteNombre}</SheetTitle>
          <p className="text-xs text-muted-foreground">Estado de cuenta</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Cargando...
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {/* Summary cards */}
              <div className="grid grid-cols-3 gap-2">
                <Card><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Vendido</p>
                  <p className="text-lg font-bold text-foreground">{fmt(totalVendido)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Cobrado</p>
                  <p className="text-lg font-bold text-green-600 dark:text-green-400">{fmt(totalCobrado)}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3 text-center">
                  <p className="text-[10px] text-muted-foreground uppercase">Pendiente</p>
                  <p className="text-lg font-bold text-destructive">{fmt(totalPendiente)}</p>
                </CardContent></Card>
              </div>

              {/* Apply payment button */}
              {totalPendiente > 0 && !showPagoForm && (
                <Button className="w-full gap-2" onClick={() => { setShowPagoForm(true); setPagoMonto(totalPendiente.toFixed(2)); }}>
                  <Plus className="h-4 w-4" /> Aplicar pago
                </Button>
              )}

              {/* Payment form */}
              {showPagoForm && (
                <Card className="border-primary/30">
                  <CardContent className="p-4 space-y-3">
                    <h3 className="text-sm font-semibold">Nuevo pago</h3>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] text-muted-foreground">Monto</label>
                        <Input type="number" step="0.01" value={pagoMonto} onChange={e => setPagoMonto(e.target.value)} placeholder="0.00" />
                      </div>
                      <div>
                        <label className="text-[11px] text-muted-foreground">Método</label>
                        <Select value={pagoMetodo} onValueChange={setPagoMetodo}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="efectivo">Efectivo</SelectItem>
                            <SelectItem value="transferencia">Transferencia</SelectItem>
                            <SelectItem value="cheque">Cheque</SelectItem>
                            <SelectItem value="tarjeta">Tarjeta</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="text-[11px] text-muted-foreground">Referencia (opcional)</label>
                      <Input value={pagoRef} onChange={e => setPagoRef(e.target.value)} placeholder="No. cheque, ref. transferencia..." />
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" className="flex-1" onClick={() => setShowPagoForm(false)}>Cancelar</Button>
                      <Button className="flex-1" onClick={() => pagoMut.mutate()} disabled={pagoMut.isPending}>
                        {pagoMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cobrar'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              <Tabs defaultValue="pendientes" className="space-y-3">
                <TabsList className="w-full">
                  <TabsTrigger value="pendientes" className="flex-1 gap-1 text-xs">
                    <ShoppingCart className="h-3.5 w-3.5" /> Pendientes
                    {ventasPendientes.length > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0 ml-1">{ventasPendientes.length}</Badge>}
                  </TabsTrigger>
                  <TabsTrigger value="cobros" className="flex-1 gap-1 text-xs">
                    <Banknote className="h-3.5 w-3.5" /> Pagos
                  </TabsTrigger>
                  <TabsTrigger value="liquidadas" className="flex-1 gap-1 text-xs">
                    <FileText className="h-3.5 w-3.5" /> Liquidadas
                  </TabsTrigger>
                </TabsList>

                {/* Ventas pendientes */}
                <TabsContent value="pendientes">
                  {ventasPendientes.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Sin ventas pendientes 🎉</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-[11px]">Folio</TableHead>
                        <TableHead className="text-[11px]">Fecha</TableHead>
                        <TableHead className="text-[11px] text-right">Total</TableHead>
                        <TableHead className="text-[11px] text-right">Pagado</TableHead>
                        <TableHead className="text-[11px] text-right">Saldo</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {ventasPendientes.map(v => {
                          const pagado = (v.total ?? 0) - (v.saldo_pendiente ?? 0);
                          return (
                            <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { onClose(); navigate(`/ventas/${v.id}`); }}>
                              <TableCell className="font-mono text-[11px]">{v.folio}</TableCell>
                              <TableCell className="text-[11px]">{fmtDate(v.fecha)}</TableCell>
                              <TableCell className="text-right text-[11px]">{fmt(v.total ?? 0)}</TableCell>
                              <TableCell className="text-right text-[11px] text-green-600 dark:text-green-400">{fmt(pagado)}</TableCell>
                              <TableCell className="text-right text-[11px] font-bold text-destructive">{fmt(v.saldo_pendiente ?? 0)}</TableCell>
                            </TableRow>
                          );
                        })}
                        <TableRow className="bg-muted/30 font-semibold">
                          <TableCell colSpan={4} className="text-right text-[11px]">Total pendiente</TableCell>
                          <TableCell className="text-right text-destructive">{fmt(totalPendiente)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* Pagos */}
                <TabsContent value="cobros">
                  {(cobros ?? []).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Sin pagos registrados</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-[11px]">Fecha</TableHead>
                        <TableHead className="text-[11px]">Método</TableHead>
                        <TableHead className="text-[11px]">Referencia</TableHead>
                        <TableHead className="text-[11px]">Aplicado a</TableHead>
                        <TableHead className="text-[11px] text-right">Monto</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {(cobros ?? []).map((c: any) => (
                          <TableRow key={c.id}>
                            <TableCell className="text-[11px]">{fmtDate(c.fecha)}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{c.metodo_pago}</Badge></TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">{c.referencia ?? '—'}</TableCell>
                            <TableCell className="text-[11px] text-muted-foreground">
                              {(c.cobro_aplicaciones ?? []).map((a: any) => (a.ventas as any)?.folio ?? '').filter(Boolean).join(', ') || '—'}
                            </TableCell>
                            <TableCell className="text-right text-[11px] font-bold text-green-600 dark:text-green-400">{fmt(c.monto)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>

                {/* Liquidadas */}
                <TabsContent value="liquidadas">
                  {ventasLiquidadas.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">Sin ventas liquidadas</div>
                  ) : (
                    <Table>
                      <TableHeader><TableRow>
                        <TableHead className="text-[11px]">Folio</TableHead>
                        <TableHead className="text-[11px]">Fecha</TableHead>
                        <TableHead className="text-[11px]">Status</TableHead>
                        <TableHead className="text-[11px] text-right">Total</TableHead>
                      </TableRow></TableHeader>
                      <TableBody>
                        {ventasLiquidadas.map(v => (
                          <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => { onClose(); navigate(`/ventas/${v.id}`); }}>
                            <TableCell className="font-mono text-[11px]">{v.folio}</TableCell>
                            <TableCell className="text-[11px]">{fmtDate(v.fecha)}</TableCell>
                            <TableCell><Badge variant="outline" className="text-[10px]">{v.status}</Badge></TableCell>
                            <TableCell className="text-right text-[11px]">{fmt(v.total ?? 0)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
