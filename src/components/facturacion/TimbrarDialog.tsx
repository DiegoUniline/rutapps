import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from 'sonner';
import { Loader2, Search, FileCheck, ShoppingCart } from 'lucide-react';
import SearchableSelect from '@/components/SearchableSelect';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function TimbrarDialog({ open, onOpenChange, onSuccess }: Props) {
  const { empresa, user } = useAuth();
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

  // Load ventas without CFDI
  const { data: ventas } = useQuery({
    queryKey: ['ventas-sin-cfdi', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, status, clientes(nombre, rfc, regimen_fiscal, uso_cfdi, cp)')
        .eq('empresa_id', empresa!.id)
        .in('status', ['confirmada', 'entregada', 'cobrada'])
        .order('fecha', { ascending: false })
        .limit(100);
      return data || [];
    },
  });

  // Load selected venta lines
  const { data: ventaLineas } = useQuery({
    queryKey: ['venta-lineas-cfdi', selectedVentaId],
    enabled: !!selectedVentaId,
    queryFn: async () => {
      const { data } = await supabase
        .from('venta_lineas')
        .select('*, productos(nombre, codigo_sat, codigo)')
        .eq('venta_id', selectedVentaId!);
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

  // When selecting a venta, prefill receiver
  useEffect(() => {
    if (!selectedVentaId || !ventas) return;
    const venta = ventas.find((v: any) => v.id === selectedVentaId);
    if (venta?.clientes) {
      const c = venta.clientes as any;
      setReceiver({
        rfc: c.rfc || '',
        name: c.nombre || '',
        cfdi_use: c.uso_cfdi || 'G01',
        fiscal_regime: c.regimen_fiscal || '601',
        tax_zip_code: c.cp || '',
      });
    }
    setStep('review');
  }, [selectedVentaId]);

  // Filter ventas
  const filteredVentas = (ventas || []).filter((v: any) => {
    const q = ventaSearch.toLowerCase();
    return (v.folio || '').toLowerCase().includes(q) ||
      ((v.clientes as any)?.nombre || '').toLowerCase().includes(q);
  });

  async function handleTimbrar() {
    if (!empresa || !selectedVentaId || !ventaLineas) return;

    if (!empresa.rfc || !empresa.razon_social || !empresa.regimen_fiscal || !empresa.cp) {
      toast.error('Configura los datos fiscales del emisor primero');
      return;
    }
    if (!receiver.rfc || !receiver.name) {
      toast.error('RFC y nombre del receptor son obligatorios');
      return;
    }

    setTimbrating(true);
    try {
      const items = ventaLineas.map((l: any) => ({
        product_code: l.productos?.codigo_sat || '01010101',
        description: l.descripcion || l.productos?.nombre || 'Producto',
        unit: 'Pieza',
        unit_code: 'H87',
        unit_price: l.precio_unitario,
        quantity: l.cantidad,
        iva_rate: (l.iva_pct || 0) / 100,
        ieps_rate: (l.ieps_pct || 0) / 100,
        iva_ret_rate: 0,
        isr_ret_rate: 0,
      }));

      const venta = ventas?.find((v: any) => v.id === selectedVentaId);

      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'timbrar',
          empresa_id: empresa.id,
          venta_id: selectedVentaId,
          folio: venta?.folio || '',
          serie: 'A',
          name_id: '1',
          cfdi_type: 'I',
          currency: 'MXN',
          payment_form: paymentForm,
          payment_method: paymentMethod,
          expedition_place: empresa.cp,
          issuer: {
            rfc: empresa.rfc,
            name: empresa.razon_social,
            fiscal_regime: empresa.regimen_fiscal,
          },
          receiver: {
            rfc: receiver.rfc,
            name: receiver.name,
            cfdi_use: receiver.cfdi_use,
            fiscal_regime: receiver.fiscal_regime,
            tax_zip_code: receiver.tax_zip_code,
          },
          items,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      toast.success(`Factura timbrada · UUID: ${data.folio_fiscal?.substring(0, 8)}...`);
      onSuccess();
      resetForm();
    } catch (e: any) {
      toast.error(e.message || 'Error al timbrar');
    } finally {
      setTimbrating(false);
    }
  }

  function resetForm() {
    setStep('select');
    setSelectedVentaId(null);
    setVentaSearch('');
    setReceiver({ rfc: '', name: '', cfdi_use: 'G01', fiscal_regime: '601', tax_zip_code: '' });
  }

  const formaOptions = (formasPago || []).map((f: any) => ({ value: f.clave, label: `${f.clave} - ${f.descripcion}` }));
  const usoOptions = (usoCfdiList || []).map((u: any) => ({ value: u.clave, label: `${u.clave} - ${u.descripcion}` }));
  const regimenOptions = (regimenesList || []).map((r: any) => ({ value: r.clave, label: `${r.clave} - ${r.descripcion}` }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) resetForm(); onOpenChange(v); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Timbrar CFDI</DialogTitle>
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
                          ${Number(v.total || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {(v.clientes as any)?.nombre || 'Sin cliente'} · {v.fecha}
                      </p>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Receiver */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Datos del Receptor</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">RFC</Label>
                    <Input value={receiver.rfc} onChange={(e) => setReceiver({ ...receiver, rfc: e.target.value })} className="font-mono uppercase h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Nombre / Razón Social</Label>
                    <Input value={receiver.name} onChange={(e) => setReceiver({ ...receiver, name: e.target.value })} className="h-9" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Uso CFDI</Label>
                    <SearchableSelect options={usoOptions} value={receiver.cfdi_use} onValueChange={(v) => setReceiver({ ...receiver, cfdi_use: v })} placeholder="Uso CFDI" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Régimen Fiscal</Label>
                    <SearchableSelect options={regimenOptions} value={receiver.fiscal_regime} onValueChange={(v) => setReceiver({ ...receiver, fiscal_regime: v })} placeholder="Régimen" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">C.P. Domicilio Fiscal</Label>
                    <Input value={receiver.tax_zip_code} onChange={(e) => setReceiver({ ...receiver, tax_zip_code: e.target.value })} className="h-9" maxLength={5} />
                  </div>
                </div>
              </div>

              {/* Payment */}
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-foreground">Datos de Pago</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Forma de Pago</Label>
                    <SearchableSelect options={formaOptions} value={paymentForm} onValueChange={setPaymentForm} placeholder="Forma pago" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Método de Pago</Label>
                    <SearchableSelect
                      options={[
                        { value: 'PUE', label: 'PUE - Pago en una sola exhibición' },
                        { value: 'PPD', label: 'PPD - Pago en parcialidades' },
                      ]}
                      value={paymentMethod}
                      onValueChange={setPaymentMethod}
                      placeholder="Método"
                    />
                  </div>
                </div>
              </div>

              {/* Lines preview */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-foreground">Conceptos ({ventaLineas?.length || 0})</h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground">
                        <th className="text-left p-2">Descripción</th>
                        <th className="text-right p-2 w-16">Cant</th>
                        <th className="text-right p-2 w-20">P.U.</th>
                        <th className="text-right p-2 w-16">IVA%</th>
                        <th className="text-right p-2 w-20">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(ventaLineas || []).map((l: any) => (
                        <tr key={l.id} className="border-t border-border">
                          <td className="p-2 truncate max-w-[200px]">{l.descripcion || (l.productos as any)?.nombre}</td>
                          <td className="text-right p-2">{l.cantidad}</td>
                          <td className="text-right p-2">${Number(l.precio_unitario).toFixed(2)}</td>
                          <td className="text-right p-2">{l.iva_pct || 0}%</td>
                          <td className="text-right p-2 font-medium">${Number(l.total || 0).toFixed(2)}</td>
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
                <Button className="flex-1" disabled={timbrating} onClick={handleTimbrar}>
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
