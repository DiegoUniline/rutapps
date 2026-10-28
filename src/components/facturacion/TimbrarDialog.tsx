import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Search, FileCheck, ShoppingCart, AlertTriangle } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';
import { fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TimbrarDialog({ open, onOpenChange, onSuccess }: Props) {
  const { empresa, user } = useAuth();
  const { fmt: fmtC } = useCurrency();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<'select' | 'review'>('select');
  const [selectedVentaId, setSelectedVentaId] = useState<string | null>(null);
  const [ventaSearch, setVentaSearch] = useState('');
  const [timbrating, setTimbrating] = useState(false);

  // Receiver form
  const [receiver, setReceiver] = useState({
    rfc: '',
    name: '',
    cfdi_use: 'G01',
    fiscal_regime: '601',
    tax_zip_code: '',
  });
  const [paymentForm, setPaymentForm] = useState('01');
  const [paymentMethod, setPaymentMethod] = useState('PUE');

  // Check timbre balance
  const { data: timbreSaldo } = useQuery({
    queryKey: ['timbres-saldo', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('timbres_saldo')
        .select('saldo')
        .eq('empresa_id', empresa!.id)
        .single();
      return data?.saldo ?? 0;
    },
  });

  // Load ventas without CFDI
  const { data: ventas } = useQuery({
    queryKey: ['ventas-sin-cfdi', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, status, clientes(nombre, rfc, regimen_fiscal, uso_cfdi, cp)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['confirmado', 'entregado', 'facturado'])
        .order('fecha', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  // Catalogs
  const { data: formasPago } = useQuery({
    queryKey: ['cat_forma_pago_active'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_forma_pago').select('clave, descripcion').eq('activo', true).order('clave');
      return data || [];
    },
  });

  const { data: usoCfdiList } = useQuery({
    queryKey: ['cat_uso_cfdi_active'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_uso_cfdi').select('clave, descripcion').eq('activo', true).order('clave');
      return data || [];
    },
  });

  const { data: regimenesList } = useQuery({
    queryKey: ['cat_regimen_fiscal_active'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_regimen_fiscal').select('clave, descripcion').eq('activo', true).order('clave');
      return data || [];
    },
  });

  // Validación previa en el servidor (D-014): receptor desde la ficha fiscal del cliente.
  const [usoCfdi, setUsoCfdi] = useState<string>('');
  const { data: preflight, isFetching: validando } = useQuery({
    queryKey: ['cfdi-preflight', empresa?.id, selectedVentaId, paymentForm, paymentMethod, usoCfdi],
    enabled: !!empresa?.id && !!selectedVentaId && open,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'preflight', empresa_id: empresa!.id, venta_id: selectedVentaId,
          payment_form: paymentForm, payment_method: paymentMethod, receiver_cfdi_use: usoCfdi || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as { valido: boolean; secciones: Record<string, string[]>; receptor: typeof receiver; totales: { total: number } | null; conceptos: { descripcion: string; cantidad: number; total: number }[] };
    },
  });
  const erroresPreflight = preflight ? Object.values(preflight.secciones).flat() : [];

  useEffect(() => {
    if (!preflight?.receptor) return;
    setReceiver(preflight.receptor);
    if (!usoCfdi && preflight.receptor.cfdi_use) setUsoCfdi(preflight.receptor.cfdi_use);
  }, [preflight]);

  useEffect(() => {
    if (selectedVentaId) setStep('review');
  }, [selectedVentaId]);

  // Lo pendiente de facturar lo calcula el servidor (una venta puede tener varias facturas, D-015).
  const conceptos = preflight?.conceptos ?? [];

  // Filter ventas
  const filteredVentas = (ventas || []).filter((v: any) => {
    const q = ventaSearch.toLowerCase();
    return (v.folio || '').toLowerCase().includes(q) ||
      ((v.clientes as any)?.nombre || '').toLowerCase().includes(q);
  });

  async function handleTimbrar() {
    if (!empresa || !selectedVentaId) return;
    if (!preflight?.valido) {
      toast.error('Corrige los datos señalados antes de timbrar');
      return;
    }
    setTimbrating(true);
    try {
      // El servidor arma la factura con las líneas pendientes de la venta y la ficha fiscal del cliente.
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'timbrar',
          empresa_id: empresa.id,
          venta_id: selectedVentaId,
          payment_form: paymentForm,
          payment_method: paymentMethod,
          receiver_cfdi_use: usoCfdi || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (!data?.cfdi?.id) throw new Error('Se timbró, pero no se pudo guardar el CFDI localmente');

      toast.success(`Factura timbrada · UUID: ${data.folio_fiscal?.substring(0, 8)}...`);
      queryClient.invalidateQueries({ queryKey: ['timbres-saldo'] });
      queryClient.invalidateQueries({ queryKey: ['ventas-sin-cfdi'] });
      onSuccess();
      resetForm();
    } catch (e: any) {
      let msg = e?.message || 'Error al timbrar';
      try { const b = await e?.context?.json?.(); if (b?.error) msg = b.error; } catch { /* sin cuerpo */ }
      toast.error(msg);
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
    } finally {
      setTimbrating(false);
    }
  }

  function resetForm() {
    setStep('select');
    setSelectedVentaId(null);
    setVentaSearch('');
    setReceiver({ rfc: '', name: '', cfdi_use: 'G01', fiscal_regime: '601', tax_zip_code: '' });
    setUsoCfdi('');
  }

  const formaOptions = (formasPago || []).map((f: any) => ({ value: f.clave, label: `${f.clave} - ${f.descripcion}` }));
  const usoOptions = (usoCfdiList || []).map((u: any) => ({ value: u.clave, label: `${u.clave} - ${u.descripcion}` }));
  const regimenOptions = (regimenesList || []).map((r: any) => ({ value: r.clave, label: `${r.clave} - ${r.descripcion}` }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-hidden flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle>Timbrar CFDI</DialogTitle>
            <Badge variant={(timbreSaldo ?? 0) > 0 ? 'secondary' : 'destructive'} className="text-xs">
              {timbreSaldo ?? 0} timbres disponibles
            </Badge>
          </div>
          <DialogDescription>
            {step === 'select' ? 'Selecciona la venta a facturar' : 'Verifica los datos y timbra'}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 pr-2">
          {step === 'select' ? (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Buscar por folio o cliente..." value={ventaSearch} onChange={(e) => setVentaSearch(e.target.value)} className="pl-8" />
              </div>
              <div className="space-y-1.5 max-h-[400px] overflow-y-auto">
                {filteredVentas.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-8">No hay ventas disponibles para facturar</p>
                ) : (
                  filteredVentas.map((v: any) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVentaId(v.id)}
                      className="w-full text-left p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
                          <span className="font-mono text-sm font-semibold">{v.folio || '—'}</span>
                          <Badge variant="secondary" className="text-[10px]">{v.status}</Badge>
                        </div>
                        <span className="font-medium text-sm">
                          {fmtC(Number(v.total || 0))}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(v.clientes as any)?.nombre || 'Sin cliente'} · {fmtDate(v.fecha)}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Receiver: datos fiscales de la ficha del cliente (solo el uso de CFDI se elige aquí) */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Datos del Receptor</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">RFC</Label>
                    <Input value={receiver.rfc} readOnly className="font-mono uppercase h-9 bg-muted/40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Razón Social</Label>
                    <Input value={receiver.name} readOnly className="h-9 bg-muted/40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Uso CFDI</Label>
                    <SearchableSelect options={usoOptions} value={usoCfdi} onChange={setUsoCfdi} placeholder="Uso CFDI" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Régimen Fiscal</Label>
                    <Input value={regimenOptions.find((o: any) => o.value === receiver.fiscal_regime)?.label || receiver.fiscal_regime} readOnly className="h-9 bg-muted/40" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">C.P. Domicilio Fiscal</Label>
                    <Input value={receiver.tax_zip_code} readOnly className="h-9 bg-muted/40" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Para corregir RFC, razón social, régimen o C.P. edita los datos fiscales en la ficha del cliente.</p>
              </div>

              {/* Validación previa */}
              {validando && !preflight ? (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" />Validando datos fiscales…</p>
              ) : erroresPreflight.length > 0 ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
                  <p className="text-xs font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />Corrige antes de timbrar</p>
                  <ul className="text-xs text-destructive list-disc pl-5 space-y-0.5">
                    {erroresPreflight.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              ) : null}

              {/* Payment */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Datos de Pago</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de Pago</Label>
                    <SearchableSelect options={formaOptions} value={paymentForm} onChange={setPaymentForm} placeholder="Forma pago" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Método de Pago</Label>
                    <SearchableSelect
                      options={[
                        { value: 'PUE', label: 'PUE - Pago en una sola exhibición' },
                        { value: 'PPD', label: 'PPD - Pago en parcialidades' },
                      ]}
                      value={paymentMethod}
                      onChange={setPaymentMethod}
                      placeholder="Método"
                    />
                  </div>
                </div>
              </div>

              {/* Lines preview */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Conceptos pendientes de facturar ({conceptos.length})</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-card text-muted-foreground">
                        <th className="text-left p-2">Descripción</th>
                        <th className="text-right p-2 w-16">Cant</th>
                        <th className="text-right p-2 w-24">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {conceptos.map((l, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="p-2 truncate max-w-[200px]">{l.descripcion}</td>
                          <td className="text-right p-2">{l.cantidad}</td>
                          <td className="text-right p-2 font-medium">{fmtC(Number(l.total || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <Button variant="outline" className="flex-1" onClick={() => { setStep('select'); setSelectedVentaId(null); }}>
                  Atrás
                </Button>
                <Button className="flex-1" disabled={timbrating || validando || !preflight?.valido} onClick={handleTimbrar}>
                  {timbrating ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Timbrando...</>
                  ) : (
                    <><FileCheck className="h-4 w-4 mr-1.5" />Timbrar CFDI</>
                  )}
                </Button>
              </div>
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
