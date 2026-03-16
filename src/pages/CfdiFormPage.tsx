import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowLeft, FileCheck, Loader2, Trash2, Save, AlertTriangle, Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import SearchableSelect from '@/components/SearchableSelect';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { generarCfdiPdf } from '@/lib/cfdiPdf';
import { loadLogoBase64 } from '@/lib/pdfBase';

const CFDI_STEPS = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'timbrado', label: 'Timbrado' },
  { key: 'cancelado', label: 'Cancelado' },
];

function r2(n: number) { return Math.round(n * 100) / 100; }

interface CfdiLinea {
  id: string;
  cfdi_id: string;
  venta_linea_id?: string;
  producto_id?: string;
  descripcion: string;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
  iva_pct: number;
  ieps_pct: number;
  iva_monto: number;
  ieps_monto: number;
  total: number;
  product_code: string;
  unit_code: string;
  unit_name: string;
}

function calcLinea(l: Partial<CfdiLinea>): Partial<CfdiLinea> {
  const cant = Number(l.cantidad) || 0;
  const pu = Number(l.precio_unitario) || 0;
  const ivaPct = Number(l.iva_pct) || 0;
  const iepsPct = Number(l.ieps_pct) || 0;
  const subtotal = r2(cant * pu);
  const ieps_monto = r2(subtotal * iepsPct / 100);
  const iva_monto = r2((subtotal + ieps_monto) * ivaPct / 100);
  const total = r2(subtotal + ieps_monto + iva_monto);
  return { ...l, subtotal, iva_monto, ieps_monto, total };
}

export default function CfdiFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa } = useAuth();
  const queryClient = useQueryClient();

  // Load CFDI
  const { data: cfdi, isLoading } = useQuery({
    queryKey: ['cfdi', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cfdis')
        .select('*')
        .eq('id', id!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Load lines
  const { data: lineasDb, isLoading: lineasLoading } = useQuery({
    queryKey: ['cfdi-lineas', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cfdi_lineas')
        .select('*')
        .eq('cfdi_id', id!)
        .order('created_at');
      if (error) throw error;
      return data as CfdiLinea[];
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

  const [lineas, setLineas] = useState<Partial<CfdiLinea>[]>([]);
  const [receiver, setReceiver] = useState({
    rfc: '', name: '', cfdi_use: 'G01', fiscal_regime: '601', tax_zip_code: '',
  });
  const [paymentForm, setPaymentForm] = useState('01');
  const [paymentMethod, setPaymentMethod] = useState('PUE');
  const [saving, setSaving] = useState(false);
  const [timbring, setTimbring] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [errorDialog, setErrorDialog] = useState<string | null>(null);

  const readOnly = cfdi?.status !== 'borrador';

  useEffect(() => {
    if (lineasDb) setLineas(lineasDb);
  }, [lineasDb]);

  useEffect(() => {
    if (cfdi) {
      setReceiver({
        rfc: cfdi.receiver_rfc || '',
        name: cfdi.receiver_name || '',
        cfdi_use: cfdi.receiver_cfdi_use || 'G01',
        fiscal_regime: cfdi.receiver_fiscal_regime || '601',
        tax_zip_code: cfdi.receiver_tax_zip_code || '',
      });
      setPaymentForm(cfdi.payment_form || '01');
      setPaymentMethod(cfdi.payment_method || 'PUE');
    }
  }, [cfdi]);

  // Update line field
  const updateLine = useCallback((idx: number, field: string, value: any) => {
    setLineas(prev => {
      const next = [...prev];
      next[idx] = calcLinea({ ...next[idx], [field]: value });
      return next;
    });
    setDirty(true);
  }, []);

  const removeLine = useCallback((idx: number) => {
    setLineas(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }, []);

  // Totals
  const totals = useMemo(() => {
    const subtotal = lineas.reduce((s, l) => s + (l.subtotal || 0), 0);
    const iva = lineas.reduce((s, l) => s + (l.iva_monto || 0), 0);
    const ieps = lineas.reduce((s, l) => s + (l.ieps_monto || 0), 0);
    const total = lineas.reduce((s, l) => s + (l.total || 0), 0);
    return { subtotal: r2(subtotal), iva: r2(iva), ieps: r2(ieps), total: r2(total) };
  }, [lineas]);

  // Save draft
  const handleSave = async () => {
    if (!cfdi || readOnly) return;
    setSaving(true);
    try {
      // Update CFDI header
      await supabase.from('cfdis').update({
        receiver_rfc: receiver.rfc.toUpperCase().trim(),
        receiver_name: receiver.name.trim(),
        receiver_cfdi_use: receiver.cfdi_use,
        receiver_fiscal_regime: receiver.fiscal_regime,
        receiver_tax_zip_code: receiver.tax_zip_code,
        payment_form: paymentForm,
        payment_method: paymentMethod,
        subtotal: totals.subtotal,
        iva_total: totals.iva,
        ieps_total: totals.ieps,
        total: totals.total,
        updated_at: new Date().toISOString(),
      }).eq('id', cfdi.id);

      // Upsert lines: delete all then re-insert
      await supabase.from('cfdi_lineas').delete().eq('cfdi_id', cfdi.id);
      if (lineas.length > 0) {
        const rows = lineas.map(l => ({
          cfdi_id: cfdi.id,
          venta_linea_id: l.venta_linea_id || null,
          producto_id: l.producto_id || null,
          descripcion: l.descripcion || '',
          cantidad: l.cantidad || 0,
          precio_unitario: l.precio_unitario || 0,
          subtotal: l.subtotal || 0,
          iva_pct: l.iva_pct || 0,
          ieps_pct: l.ieps_pct || 0,
          iva_monto: l.iva_monto || 0,
          ieps_monto: l.ieps_monto || 0,
          total: l.total || 0,
          product_code: l.product_code || '01010101',
          unit_code: l.unit_code || 'H87',
          unit_name: l.unit_name || 'Pieza',
        }));
        const { error } = await supabase.from('cfdi_lineas').insert(rows);
        if (error) throw error;
      }

      toast.success('Borrador guardado');
      setDirty(false);
      queryClient.invalidateQueries({ queryKey: ['cfdi-lineas', cfdi.id] });
      queryClient.invalidateQueries({ queryKey: ['cfdi', cfdi.id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Timbrar
  const handleTimbrar = async () => {
    if (!cfdi || !empresa) return;
    if (!empresa.rfc || !empresa.razon_social || !empresa.regimen_fiscal || !empresa.cp) {
      toast.error('Configura los datos fiscales del emisor primero');
      return;
    }
    if (!receiver.rfc || !receiver.name) {
      toast.error('RFC y nombre del receptor son obligatorios');
      return;
    }
    if (lineas.length === 0) {
      toast.error('Agrega al menos una línea');
      return;
    }

    // Save first if dirty
    if (dirty) await handleSave();

    setTimbring(true);
    try {
      const items = lineas.map(l => ({
        product_code: l.product_code || '01010101',
        description: l.descripcion || 'Producto',
        unit: l.unit_name || 'Pieza',
        unit_code: l.unit_code || 'H87',
        unit_price: l.precio_unitario,
        quantity: l.cantidad,
        iva_rate: (l.iva_pct || 0) / 100,
        ieps_rate: (l.ieps_pct || 0) / 100,
        iva_ret_rate: 0,
        isr_ret_rate: 0,
      }));

      const { data, error } = await supabase.functions.invoke('facturama', {
        body: {
          action: 'timbrar',
          cfdi_id: cfdi.id,
          empresa_id: empresa.id,
          venta_id: cfdi.venta_id || null,
          folio: cfdi.folio || '',
          serie: cfdi.serie || 'A',
          name_id: '1',
          cfdi_type: cfdi.cfdi_type || 'I',
          currency: cfdi.currency || 'MXN',
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

      // Check for errors - data.error contains the real Facturama message
      if (data?.error) throw new Error(data.error);
      if (error) throw new Error(data?.error || error.message || 'Error desconocido al timbrar');
      if (!data?.success) throw new Error(data?.error || 'Respuesta inesperada del servidor');

      // Mark venta_lineas as facturado
      for (const l of lineas) {
        if (l.venta_linea_id) {
          await supabase.from('venta_lineas').update({ facturado: true, factura_cfdi_id: cfdi.id }).eq('id', l.venta_linea_id);
        }
      }

      toast.success(`¡Factura timbrada! UUID: ${data.folio_fiscal?.substring(0, 8)}...`);
      queryClient.invalidateQueries({ queryKey: ['cfdis'] });
      queryClient.invalidateQueries({ queryKey: ['cfdi', cfdi.id] });
      queryClient.invalidateQueries({ queryKey: ['cfdi-lineas', cfdi.id] });
      queryClient.invalidateQueries({ queryKey: ['venta'] });
      queryClient.invalidateQueries({ queryKey: ['ventas'] });
      navigate('/facturacion-cfdi');
    } catch (e: any) {
      let errorMsg = 'No se pudo timbrar la factura.';

      try {
        if (e instanceof FunctionsHttpError) {
          const responseBody = await e.context.json();
          if (responseBody?.error) {
            errorMsg = responseBody.error;
          } else if (responseBody?.Message) {
            errorMsg = responseBody.Message;
          } else {
            errorMsg = JSON.stringify(responseBody);
          }
        } else if (e?.data?.error) {
          errorMsg = e.data.error;
        } else if (e?.error?.Message) {
          errorMsg = e.error.Message;
        } else if (e?.message) {
          errorMsg = e.message;
        }

        const match = errorMsg.match(/Facturama rechazó: (.*)/);
        if (match) {
          const parsed = JSON.parse(match[1]);
          if (parsed.ModelState) {
            const details = Object.entries(parsed.ModelState)
              .map(([key, msgs]: [string, any]) => {
                const field = key.replace('cfdiToCreate.', '');
                return `• ${field}: ${Array.isArray(msgs) ? msgs.join(', ') : msgs}`;
              })
              .join('\n');
            errorMsg = `${parsed.Message || 'Error de validación'}\n\n${details}`;
          } else if (parsed.Message) {
            errorMsg = parsed.Message;
          }
        }
      } catch {
        errorMsg = e?.message || errorMsg;
      }

      setErrorDialog(errorMsg);
    } finally {
      setTimbring(false);
    }
  };

  const fmt = (v: number) => `$${v.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const formaOptions = (formasPago || []).map((f: any) => ({ value: f.clave, label: `${f.clave} - ${f.descripcion}` }));
  const usoOptions = (usoCfdiList || []).map((u: any) => ({ value: u.clave, label: `${u.clave} - ${u.descripcion}` }));
  const regimenOptions = (regimenesList || []).map((r: any) => ({ value: r.clave, label: `${r.clave} - ${r.descripcion}` }));

  if (isLoading || lineasLoading) {
    return (
      <div className="p-6">
        <TableSkeleton rows={6} cols={5} />
      </div>
    );
  }

  if (!cfdi) {
    return (
      <div className="p-6 text-center">
        <p className="text-muted-foreground">CFDI no encontrado</p>
        <Button variant="link" onClick={() => navigate('/facturacion-cfdi')}>Volver</Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/facturacion-cfdi')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-foreground">
              CFDI {cfdi.serie ? `${cfdi.serie}-` : ''}{cfdi.folio || 'Borrador'}
            </h1>
            <Badge variant={cfdi.status === 'timbrado' ? 'default' : cfdi.status === 'borrador' ? 'secondary' : 'destructive'}>
              {cfdi.status === 'borrador' ? 'Borrador' : cfdi.status === 'timbrado' ? 'Timbrado' : cfdi.status}
            </Badge>
          </div>
          {cfdi.folio_fiscal && (
            <p className="text-xs text-muted-foreground font-mono mt-0.5">UUID: {cfdi.folio_fiscal}</p>
          )}
        </div>
      </div>

      {/* Statusbar */}
      <OdooStatusbar steps={CFDI_STEPS} current={cfdi.status} onStepClick={() => {}} />

      {/* Receptor & Pago */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Receptor</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium">RFC</label>
                <Input
                  value={receiver.rfc}
                  onChange={e => { setReceiver({ ...receiver, rfc: e.target.value }); setDirty(true); }}
                  disabled={readOnly}
                  className="font-mono uppercase h-8 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium">C.P. Fiscal</label>
                <Input
                  value={receiver.tax_zip_code}
                  onChange={e => { setReceiver({ ...receiver, tax_zip_code: e.target.value }); setDirty(true); }}
                  disabled={readOnly}
                  className="h-8 text-sm"
                  maxLength={5}
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">Razón Social</label>
              <Input
                value={receiver.name}
                onChange={e => { setReceiver({ ...receiver, name: e.target.value }); setDirty(true); }}
                disabled={readOnly}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium">Régimen Fiscal</label>
                <SearchableSelect options={regimenOptions} value={receiver.fiscal_regime} onChange={v => { setReceiver({ ...receiver, fiscal_regime: v }); setDirty(true); }} placeholder="Régimen" />
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-muted-foreground font-medium">Uso CFDI</label>
                <SearchableSelect options={usoOptions} value={receiver.cfdi_use} onChange={v => { setReceiver({ ...receiver, cfdi_use: v }); setDirty(true); }} placeholder="Uso" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4 space-y-3">
            <h3 className="text-sm font-semibold text-foreground">Datos de Pago</h3>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">Forma de Pago</label>
              <SearchableSelect options={formaOptions} value={paymentForm} onChange={v => { setPaymentForm(v); setDirty(true); }} placeholder="Forma pago" />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground font-medium">Método de Pago</label>
              <SearchableSelect
                options={[
                  { value: 'PUE', label: 'PUE - Pago en una sola exhibición' },
                  { value: 'PPD', label: 'PPD - Pago en parcialidades' },
                ]}
                value={paymentMethod}
                onChange={v => { setPaymentMethod(v); setDirty(true); }}
                placeholder="Método"
              />
            </div>

            {/* Totals summary */}
            <div className="border-t border-border pt-3 mt-3 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmt(totals.subtotal)}</span></div>
              {totals.ieps > 0 && <div className="flex justify-between"><span className="text-muted-foreground">IEPS</span><span>{fmt(totals.ieps)}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">IVA</span><span>{fmt(totals.iva)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-1"><span>Total</span><span>{fmt(totals.total)}</span></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Lines table */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Conceptos ({lineas.length})</h3>
          </div>
          <div className="border rounded-lg overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-muted/50 border-b">
                  <th className="py-2 px-2 text-left text-[11px] font-medium text-muted-foreground w-8">#</th>
                  <th className="py-2 px-2 text-left text-[11px] font-medium text-muted-foreground">Descripción</th>
                  <th className="py-2 px-2 text-left text-[11px] font-medium text-muted-foreground w-20">Clave SAT</th>
                  <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-20">Cantidad</th>
                  <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-24">P. Unitario</th>
                  <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-16">IVA%</th>
                  <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-16">IEPS%</th>
                  <th className="py-2 px-2 text-right text-[11px] font-medium text-muted-foreground w-24">Total</th>
                  {!readOnly && <th className="py-2 px-2 w-10" />}
                </tr>
              </thead>
              <tbody>
                {lineas.map((l, idx) => (
                  <tr key={l.id || idx} className="border-b border-border/50 hover:bg-muted/20">
                    <td className="py-1.5 px-2 text-muted-foreground text-xs">{idx + 1}</td>
                    <td className="py-1.5 px-2">
                      {readOnly ? (
                        <span className="text-[12px]">{l.descripcion}</span>
                      ) : (
                        <Input
                          value={l.descripcion || ''}
                          onChange={e => updateLine(idx, 'descripcion', e.target.value)}
                          className="h-7 text-[12px] border-0 bg-transparent px-1 focus:bg-background focus:border focus:border-primary"
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {readOnly ? (
                        <span className="font-mono text-[11px]">{l.product_code}</span>
                      ) : (
                        <Input
                          value={l.product_code || ''}
                          onChange={e => updateLine(idx, 'product_code', e.target.value)}
                          className="h-7 text-[11px] font-mono border-0 bg-transparent px-1 focus:bg-background focus:border focus:border-primary"
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {readOnly ? (
                        <span className="text-right block">{l.cantidad}</span>
                      ) : (
                        <Input
                          type="number"
                          value={l.cantidad ?? ''}
                          onChange={e => updateLine(idx, 'cantidad', parseFloat(e.target.value) || 0)}
                          className="h-7 text-[12px] text-right border-0 bg-transparent px-1 focus:bg-background focus:border focus:border-primary"
                          min={0}
                          step="any"
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {readOnly ? (
                        <span className="text-right block">{fmt(l.precio_unitario || 0)}</span>
                      ) : (
                        <Input
                          type="number"
                          value={l.precio_unitario ?? ''}
                          onChange={e => updateLine(idx, 'precio_unitario', parseFloat(e.target.value) || 0)}
                          className="h-7 text-[12px] text-right border-0 bg-transparent px-1 focus:bg-background focus:border focus:border-primary"
                          min={0}
                          step="any"
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {readOnly ? (
                        <span className="text-right block">{l.iva_pct}%</span>
                      ) : (
                        <Input
                          type="number"
                          value={l.iva_pct ?? ''}
                          onChange={e => updateLine(idx, 'iva_pct', parseFloat(e.target.value) || 0)}
                          className="h-7 text-[12px] text-right border-0 bg-transparent px-1 focus:bg-background focus:border focus:border-primary"
                          min={0}
                          step="any"
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2">
                      {readOnly ? (
                        <span className="text-right block">{l.ieps_pct}%</span>
                      ) : (
                        <Input
                          type="number"
                          value={l.ieps_pct ?? ''}
                          onChange={e => updateLine(idx, 'ieps_pct', parseFloat(e.target.value) || 0)}
                          className="h-7 text-[12px] text-right border-0 bg-transparent px-1 focus:bg-background focus:border focus:border-primary"
                          min={0}
                          step="any"
                        />
                      )}
                    </td>
                    <td className="py-1.5 px-2 text-right font-medium">{fmt(l.total || 0)}</td>
                    {!readOnly && (
                      <td className="py-1.5 px-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive/60 hover:text-destructive" onClick={() => removeLine(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-muted/30 border-t">
                  <td colSpan={readOnly ? 7 : 7} className="py-2 px-2 text-right text-[12px] font-semibold">Total</td>
                  <td className="py-2 px-2 text-right font-bold text-sm">{fmt(totals.total)}</td>
                  {!readOnly && <td />}
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Timbrado info */}
          {cfdi.status === 'timbrado' && (
            <div className="mt-4 flex gap-2 flex-wrap">
              <Button
                variant="default"
                size="sm"
                onClick={async () => {
                  try {
                    const logo = empresa?.logo_url ? await loadLogoBase64(empresa.logo_url) : null;
                    // Get catalog labels
                    const formaLabel = formasPago?.find((f: any) => f.clave === cfdi.payment_form);
                    const usoLabel = usoCfdiList?.find((u: any) => u.clave === cfdi.receiver_cfdi_use);
                    const regEmisorLabel = regimenesList?.find((r: any) => r.clave === empresa?.regimen_fiscal);
                    const regReceptorLabel = regimenesList?.find((r: any) => r.clave === cfdi.receiver_fiscal_regime);

                    const blob = await generarCfdiPdf({
                      empresa: {
                        nombre: empresa?.nombre || '',
                        razon_social: empresa?.razon_social,
                        rfc: empresa?.rfc,
                        direccion: empresa?.direccion,
                        colonia: empresa?.colonia,
                        ciudad: empresa?.ciudad,
                        estado: empresa?.estado,
                        cp: empresa?.cp,
                        telefono: empresa?.telefono,
                        email: empresa?.email,
                        logo_url: empresa?.logo_url,
                        regimen_fiscal: empresa?.regimen_fiscal,
                      },
                      logoBase64: logo,
                      cfdi: {
                        serie: cfdi.serie,
                        folio: cfdi.folio,
                        folio_fiscal: cfdi.folio_fiscal,
                        cfdi_type: cfdi.cfdi_type,
                        currency: cfdi.currency,
                        payment_form: cfdi.payment_form,
                        payment_method: cfdi.payment_method,
                        expedition_place: cfdi.expedition_place,
                        subtotal: Number(cfdi.subtotal),
                        iva_total: Number(cfdi.iva_total),
                        ieps_total: Number(cfdi.ieps_total),
                        retenciones_total: Number(cfdi.retenciones_total),
                        total: Number(cfdi.total),
                        created_at: cfdi.created_at,
                        status: cfdi.status,
                      },
                      receiver: {
                        rfc: cfdi.receiver_rfc || '',
                        name: cfdi.receiver_name || '',
                        cfdi_use: cfdi.receiver_cfdi_use,
                        fiscal_regime: cfdi.receiver_fiscal_regime,
                        tax_zip_code: cfdi.receiver_tax_zip_code,
                      },
                      lineas: (lineas as any[]).map(l => ({
                        descripcion: l.descripcion || '',
                        product_code: l.product_code || '01010101',
                        unit_code: l.unit_code || 'H87',
                        unit_name: l.unit_name || 'Pieza',
                        cantidad: l.cantidad || 0,
                        precio_unitario: l.precio_unitario || 0,
                        subtotal: l.subtotal || 0,
                        iva_pct: l.iva_pct || 0,
                        ieps_pct: l.ieps_pct || 0,
                        iva_monto: l.iva_monto || 0,
                        ieps_monto: l.ieps_monto || 0,
                        total: l.total || 0,
                      })),
                      formasPagoLabel: formaLabel ? `${formaLabel.clave} - ${formaLabel.descripcion}` : undefined,
                      metodoPagoLabel: cfdi.payment_method === 'PUE' ? 'PUE - Pago en una sola exhibición' : cfdi.payment_method === 'PPD' ? 'PPD - Pago en parcialidades' : undefined,
                      usoCfdiLabel: usoLabel ? `${usoLabel.clave} - ${usoLabel.descripcion}` : undefined,
                      regimenEmisorLabel: regEmisorLabel ? `${regEmisorLabel.clave} - ${regEmisorLabel.descripcion}` : undefined,
                      regimenReceptorLabel: regReceptorLabel ? `${regReceptorLabel.clave} - ${regReceptorLabel.descripcion}` : undefined,
                    });

                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `Factura_${cfdi.serie || 'A'}-${cfdi.folio || 'borrador'}.pdf`;
                    a.click();
                    URL.revokeObjectURL(url);
                  } catch (e: any) {
                    toast.error('Error al generar PDF: ' + e.message);
                  }
                }}
              >
                <Download className="h-4 w-4 mr-1.5" />
                Descargar PDF
              </Button>
              {cfdi.xml_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={cfdi.xml_url} target="_blank" rel="noopener noreferrer">
                    <FileText className="h-4 w-4 mr-1.5" />
                    Descargar XML
                  </a>
                </Button>
              )}
              {cfdi.pdf_url && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={cfdi.pdf_url} target="_blank" rel="noopener noreferrer">
                    PDF Facturama (original)
                  </a>
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      {!readOnly && (
        <div className="flex gap-2 justify-end sticky bottom-4">
          <Button variant="outline" onClick={handleSave} disabled={saving || !dirty}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
            Guardar borrador
          </Button>
          <Button onClick={handleTimbrar} disabled={timbring || lineas.length === 0}>
            {timbring ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileCheck className="h-4 w-4 mr-1.5" />}
            {timbring ? 'Timbrando...' : `Timbrar CFDI (${fmt(totals.total)})`}
          </Button>
        </div>
      )}

      {/* Error dialog */}
      <Dialog open={!!errorDialog} onOpenChange={() => setErrorDialog(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Error al timbrar
            </DialogTitle>
            <DialogDescription>
              Revisa el detalle exacto que devolvió el sistema de facturación.
            </DialogDescription>
          </DialogHeader>
          <div className="whitespace-pre-wrap text-sm text-muted-foreground bg-destructive/5 border border-destructive/20 rounded-lg p-4 max-h-[300px] overflow-y-auto">
            {errorDialog}
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setErrorDialog(null)}>Cerrar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
