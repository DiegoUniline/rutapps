import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  useCotizacion, useSaveCotizacion, useSetCotizacionEstado,
  validarStockCotizacion, type Cotizacion, type CotizacionLinea,
} from '@/hooks/useCotizaciones';
import { useClientes } from '@/hooks/useClientes';
import { useProductosForSelect, useAlmacenes } from '@/hooks/useData';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtMoney } from '@/lib/currency';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Save, FileDown, Send, CheckCircle2, ShoppingCart, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { buildCotizacionPdf, buildCotizacionWhatsappMessage, cotizacionPublicUrl } from '@/lib/cotizacionPdf';

function emptyLinea(): Partial<CotizacionLinea> {
  return { cantidad: 1, precio_unitario: 0, descuento_pct: 0, impuesto_pct: 0, subtotal: 0, impuesto: 0, total: 0 };
}

function todayISO() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function recalcLinea(l: Partial<CotizacionLinea>): Partial<CotizacionLinea> {
  const cant = Number(l.cantidad ?? 0);
  const precio = Number(l.precio_unitario ?? 0);
  const desc = Number(l.descuento_pct ?? 0);
  const imp = Number(l.impuesto_pct ?? 0);
  const sub = +(cant * precio * (1 - desc / 100)).toFixed(2);
  const impuesto = +(sub * (imp / 100)).toFixed(2);
  return { ...l, subtotal: sub, impuesto, total: +(sub + impuesto).toFixed(2) };
}

export default function CotizacionFormPage() {
  const { id } = useParams();
  const isNew = !id || id === 'nuevo';
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { empresa, user } = useAuth();
  const { data: existing, isLoading } = useCotizacion(isNew ? undefined : id);
  const { data: clientes } = useClientes();
  const { data: productos } = useProductosForSelect();
  const { data: almacenes } = useAlmacenes();
  const save = useSaveCotizacion();
  const setEstado = useSetCotizacionEstado();
  const { symbol } = useCurrency();

  const [form, setForm] = useState<Partial<Cotizacion>>({
    fecha: todayISO(), vigencia_dias: 15, estado: 'borrador',
    subtotal: 0, descuento: 0, impuestos: 0, total: 0,
  });
  const [lineas, setLineas] = useState<Partial<CotizacionLinea>[]>([emptyLinea()]);
  const [stockDialog, setStockDialog] = useState<{ open: boolean; rows: any[]; ok: boolean }>({ open: false, rows: [], ok: true });
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (existing) {
      setForm({
        ...existing,
        fecha: existing.fecha?.slice(0, 10) ?? todayISO(),
      });
      setLineas(existing.cotizacion_lineas?.length ? existing.cotizacion_lineas : [emptyLinea()]);
    }
  }, [existing?.id]);

  const totals = useMemo(() => {
    const subtotal = lineas.reduce((s, l) => s + Number(l.subtotal ?? 0), 0);
    const impuestos = lineas.reduce((s, l) => s + Number(l.impuesto ?? 0), 0);
    const total = +(subtotal + impuestos).toFixed(2);
    return { subtotal: +subtotal.toFixed(2), impuestos: +impuestos.toFixed(2), descuento: 0, total };
  }, [lineas]);

  const readOnly = !isNew && (form.estado === 'convertida' || form.estado === 'cancelada');

  function updateLinea(idx: number, patch: Partial<CotizacionLinea>) {
    setLineas(prev => prev.map((l, i) => i === idx ? recalcLinea({ ...l, ...patch }) : l));
  }

  function selectProducto(idx: number, productoId: string) {
    const p = productos?.find((x: any) => x.id === productoId);
    if (!p) return;
    const iva = Number(p.tiene_iva ? p.iva_pct ?? 0 : 0);
    updateLinea(idx, {
      producto_id: productoId,
      descripcion: p.nombre,
      precio_unitario: Number(p.precio_principal ?? 0),
      impuesto_pct: iva,
      producto_snapshot: { nombre: p.nombre, codigo: p.codigo },
    });
  }

  async function handleSave(estadoOverride?: Cotizacion['estado']) {
    const payload: Partial<Cotizacion> = {
      ...form,
      ...totals,
      estado: estadoOverride ?? form.estado ?? 'borrador',
      id: isNew ? undefined : (form.id as string),
    };
    try {
      const newId = await save.mutateAsync({ cotizacion: payload, lineas });
      toast.success('Cotización guardada');
      if (isNew) {
        navigate(`/cotizaciones/${newId}`, { replace: true });
      } else {
        qc.invalidateQueries({ queryKey: ['cotizacion', newId] });
      }
      return newId;
    } catch (e: any) {
      toast.error(e?.message || 'Error');
      return null;
    }
  }

  async function handleDownloadPdf() {
    if (isNew || !form.id) {
      toast.info('Guarda la cotización primero.');
      return;
    }
    const { data: emp } = await supabase.from('empresas')
      .select('nombre, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, razon_social')
      .eq('id', empresa!.id).maybeSingle();
    const { data: cot } = await supabase.from('cotizaciones')
      .select('*, clientes:cliente_id(nombre, telefono, rfc, direccion), cotizacion_lineas(*)')
      .eq('id', form.id).single();
    const blob = await buildCotizacionPdf(cot as any, emp as any, symbol);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${cot.folio}.pdf`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function handleSendWhatsApp() {
    const newId = isNew ? await handleSave('enviada') : (form.id as string);
    if (!newId) return;
    const { data: emp } = await supabase.from('empresas')
      .select('nombre, rfc, direccion, colonia, ciudad, estado, cp, telefono, email, logo_url, razon_social')
      .eq('id', empresa!.id).maybeSingle();
    const { data: cot } = await supabase.from('cotizaciones')
      .select('*, clientes:cliente_id(nombre, telefono, rfc, direccion), cotizacion_lineas(*)')
      .eq('id', newId).single();
    if (!cot) return;
    const tel = (cot as any).clientes?.telefono?.replace(/\D/g, '') ?? '';
    if (!tel) { toast.error('El cliente no tiene teléfono'); return; }
    const msg = buildCotizacionWhatsappMessage(cot as any, empresa?.nombre || 'Rutapp', symbol);

    // Try sending via empresa's configured WhatsApp API
    const { data: cfg } = await supabase.from('whatsapp_config')
      .select('activo').eq('empresa_id', empresa!.id).maybeSingle();

    let sentViaApi = false;
    if (cfg?.activo) {
      try {
        const { sendDocumentWhatsApp } = await import('@/lib/whatsappDocument');
        const blob = await buildCotizacionPdf(cot as any, emp as any, symbol);
        const res = await sendDocumentWhatsApp({
          blob,
          fileName: `${(cot as any).folio}.pdf`,
          empresaId: empresa!.id,
          phone: tel,
          caption: msg,
          tipo: 'cotizacion',
          referencia_id: newId,
        });
        if (res.success) {
          sentViaApi = true;
          toast.success('Cotización enviada por WhatsApp');
        } else {
          toast.error(res.error || 'No se pudo enviar por API, abriendo WhatsApp Web');
        }
      } catch (e: any) {
        toast.error(e?.message || 'Error enviando por API');
      }
    }

    if (!sentViaApi) {
      const url = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
      window.open(url, '_blank');
    }

    if ((cot as any).estado === 'borrador') {
      await setEstado.mutateAsync({ id: newId, estado: 'enviada', extra: { enviada_wa_at: new Date().toISOString() } });
      setForm(f => ({ ...f, estado: 'enviada' }));
    } else {
      await supabase.from('cotizaciones').update({ enviada_wa_at: new Date().toISOString() }).eq('id', newId);
    }
  }

  async function handleApprove() {
    if (!form.id) return;
    await setEstado.mutateAsync({ id: form.id as string, estado: 'aprobada' });
    setForm(f => ({ ...f, estado: 'aprobada' }));
    toast.success('Cotización aprobada');
  }

  async function handleConvertToSale() {
    if (!form.id) { toast.info('Guarda primero'); return; }
    if (!form.almacen_id) { toast.error('Selecciona un almacén para validar stock'); return; }
    setConverting(true);
    try {
      const rows = await validarStockCotizacion(form.id as string, form.almacen_id as string);
      const allOk = rows.every(r => r.ok);
      setStockDialog({ open: true, rows, ok: allOk });
    } catch (e: any) {
      toast.error(e?.message || 'Error validando stock');
    } finally {
      setConverting(false);
    }
  }

  async function confirmConvertToSale() {
    if (!form.id || !empresa?.id) return;
    try {
      const cliId = form.cliente_id;
      // 1. Create venta
      const ventaPayload: any = {
        empresa_id: empresa.id,
        cliente_id: cliId ?? null,
        vendedor_id: form.vendedor_id ?? user?.id ?? null,
        tarifa_id: form.tarifa_id ?? null,
        almacen_id: form.almacen_id ?? null,
        fecha: form.fecha,
        tipo: 'pedido',
        status: 'borrador',
        condicion_pago: 'por_definir',
        subtotal: form.subtotal ?? 0,
        descuento_total: form.descuento ?? 0,
        iva_total: form.impuestos ?? 0,
        ieps_total: 0,
        total: form.total ?? 0,
        saldo_pendiente: form.total ?? 0,
        notas: form.notas ? `[Conv. de ${form.folio}] ${form.notas}` : `Conv. de ${form.folio}`,
      };
      const { data: venta, error } = await supabase.from('ventas').insert(ventaPayload).select('id, folio').single();
      if (error) throw error;

      // 2. Create venta_lineas from cotizacion_lineas
      const ventaLineas = lineas
        .filter(l => l.producto_id || l.descripcion)
        .map(l => ({
          venta_id: venta.id,
          producto_id: l.producto_id ?? null,
          descripcion: l.descripcion ?? null,
          cantidad: Number(l.cantidad ?? 0),
          precio_unitario: Number(l.precio_unitario ?? 0),
          descuento_pct: Number(l.descuento_pct ?? 0),
          subtotal: Number(l.subtotal ?? 0),
          iva_pct: Number(l.impuesto_pct ?? 0),
          iva_monto: Number(l.impuesto ?? 0),
          ieps_pct: 0,
          ieps_monto: 0,
          total: Number(l.total ?? 0),
        }));
      if (ventaLineas.length) {
        const { error: errL } = await supabase.from('venta_lineas').insert(ventaLineas);
        if (errL) throw errL;
      }

      // 3. Mark cotizacion as convertida
      await supabase.from('cotizaciones').update({
        estado: 'convertida', venta_id: venta.id,
      }).eq('id', form.id);

      toast.success(`Convertida a venta ${venta.folio || ''}`);
      qc.invalidateQueries({ queryKey: ['ventas'] });
      qc.invalidateQueries({ queryKey: ['cotizaciones'] });
      setStockDialog({ open: false, rows: [], ok: true });
      navigate(`/ventas/${venta.id}`);
    } catch (e: any) {
      toast.error(e?.message || 'Error al convertir');
    }
  }

  if (!isNew && isLoading) {
    return <div className="p-6 text-muted-foreground">Cargando…</div>;
  }

  return (
    <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/cotizaciones')}><ArrowLeft className="h-4 w-4" /></Button>
          <div>
            <h1 className="text-xl font-bold">{isNew ? 'Nueva cotización' : (form.folio || 'Cotización')}</h1>
            <p className="text-xs text-muted-foreground uppercase">{form.estado}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!readOnly && (
            <Button onClick={() => handleSave()} disabled={save.isPending}><Save className="h-4 w-4 mr-1" /> Guardar</Button>
          )}
          {!isNew && (
            <>
              <Button variant="outline" onClick={handleDownloadPdf}><FileDown className="h-4 w-4 mr-1" /> PDF</Button>
              <Button variant="outline" onClick={handleSendWhatsApp}><Send className="h-4 w-4 mr-1" /> Enviar por WhatsApp</Button>
              {form.estado !== 'aprobada' && form.estado !== 'convertida' && (
                <Button variant="outline" onClick={handleApprove}><CheckCircle2 className="h-4 w-4 mr-1" /> Aprobar</Button>
              )}
              {form.estado !== 'convertida' && (
                <Button onClick={handleConvertToSale} disabled={converting}>
                  <ShoppingCart className="h-4 w-4 mr-1" /> Convertir a venta
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Header */}
      <div className="bg-card border border-border rounded-lg p-4 grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        <div>
          <Label>Cliente</Label>
          <Select
            value={form.cliente_id ?? ''}
            onValueChange={(v) => setForm({ ...form, cliente_id: v })}
            disabled={readOnly}
          >
            <SelectTrigger><SelectValue placeholder="Selecciona cliente" /></SelectTrigger>
            <SelectContent>
              {(clientes ?? []).map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Fecha</Label>
          <Input
            type="date" value={form.fecha ?? ''} disabled={readOnly}
            onChange={(e) => setForm({ ...form, fecha: e.target.value })}
          />
        </div>
        <div>
          <Label>Vigencia (días)</Label>
          <Input
            type="number" min={1} value={form.vigencia_dias ?? 15} disabled={readOnly}
            onChange={(e) => setForm({ ...form, vigencia_dias: Number(e.target.value) })}
          />
        </div>
        <div>
          <Label>Almacén (para validar stock)</Label>
          <Select
            value={form.almacen_id ?? ''}
            onValueChange={(v) => setForm({ ...form, almacen_id: v })}
            disabled={readOnly}
          >
            <SelectTrigger><SelectValue placeholder="Selecciona almacén" /></SelectTrigger>
            <SelectContent>
              {(almacenes ?? []).map((a: any) => (
                <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Lines */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-2 py-2 min-w-[200px]">Producto</th>
                <th className="text-right px-2 py-2 w-24">Cantidad</th>
                <th className="text-right px-2 py-2 w-28">Precio</th>
                <th className="text-right px-2 py-2 w-20">Desc. %</th>
                <th className="text-right px-2 py-2 w-20">Imp. %</th>
                <th className="text-right px-2 py-2 w-28">Total</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-2 py-1">
                    <Select
                      value={l.producto_id ?? ''}
                      onValueChange={(v) => selectProducto(i, v)}
                      disabled={readOnly}
                    >
                      <SelectTrigger className="h-9"><SelectValue placeholder="Selecciona producto" /></SelectTrigger>
                      <SelectContent>
                        {(productos ?? []).map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>{p.codigo ? `${p.codigo} · ` : ''}{p.nombre}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {!l.producto_id && (
                      <Input className="mt-1 h-8" placeholder="Descripción libre"
                        value={l.descripcion ?? ''} disabled={readOnly}
                        onChange={(e) => updateLinea(i, { descripcion: e.target.value })}
                      />
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.001" min={0} className="text-right h-9" disabled={readOnly}
                      value={l.cantidad ?? 0}
                      onChange={(e) => updateLinea(i, { cantidad: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} className="text-right h-9" disabled={readOnly}
                      value={l.precio_unitario ?? 0}
                      onChange={(e) => updateLinea(i, { precio_unitario: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} max={100} className="text-right h-9" disabled={readOnly}
                      value={l.descuento_pct ?? 0}
                      onChange={(e) => updateLinea(i, { descuento_pct: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-1">
                    <Input type="number" step="0.01" min={0} max={100} className="text-right h-9" disabled={readOnly}
                      value={l.impuesto_pct ?? 0}
                      onChange={(e) => updateLinea(i, { impuesto_pct: Number(e.target.value) })} />
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums font-medium">{fmtMoney(Number(l.total ?? 0))}</td>
                  <td className="px-2">
                    <Button variant="ghost" size="icon" disabled={readOnly}
                      onClick={() => setLineas(prev => prev.filter((_, x) => x !== i))}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <div className="p-2 border-t border-border bg-muted/30">
            <Button variant="ghost" size="sm" onClick={() => setLineas(prev => [...prev, emptyLinea()])}>
              <Plus className="h-4 w-4 mr-1" /> Agregar línea
            </Button>
          </div>
        )}
      </div>

      {/* Totals + Notes */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="bg-card border border-border rounded-lg p-4">
          <Label>Notas</Label>
          <Textarea rows={4} placeholder="Condiciones, observaciones…" disabled={readOnly}
            value={form.notas ?? ''}
            onChange={(e) => setForm({ ...form, notas: e.target.value })}
          />
        </div>
        <div className="bg-card border border-border rounded-lg p-4 space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span className="tabular-nums">{fmtMoney(totals.subtotal)}</span></div>
          {totals.impuestos > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Impuestos</span><span className="tabular-nums">{fmtMoney(totals.impuestos)}</span></div>}
          <div className="flex justify-between border-t border-border pt-2 text-base font-bold"><span>TOTAL</span><span className="tabular-nums">{fmtMoney(totals.total)}</span></div>
          {form.token_publico && (
            <div className="pt-2 border-t border-border text-xs text-muted-foreground">
              Enlace público: <a className="text-primary underline break-all" target="_blank" rel="noreferrer" href={cotizacionPublicUrl(form.token_publico)}>{cotizacionPublicUrl(form.token_publico)}</a>
            </div>
          )}
        </div>
      </div>

      {/* Stock validation dialog */}
      <Dialog open={stockDialog.open} onOpenChange={(o) => setStockDialog(s => ({ ...s, open: o }))}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {stockDialog.ok ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertTriangle className="h-5 w-5 text-amber-500" />}
              Validación de stock
            </DialogTitle>
            <DialogDescription>
              {stockDialog.ok
                ? 'Hay stock suficiente en el almacén seleccionado. Puedes convertir a venta.'
                : 'Algunas líneas no tienen stock suficiente. Puedes continuar bajo tu responsabilidad o cancelar.'}
            </DialogDescription>
          </DialogHeader>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="text-left px-2 py-1.5">Producto</th>
                <th className="text-right px-2 py-1.5">Solicitada</th>
                <th className="text-right px-2 py-1.5">Disponible</th>
                <th className="text-right px-2 py-1.5">Faltante</th>
              </tr>
            </thead>
            <tbody>
              {stockDialog.rows.map((r, i) => (
                <tr key={i} className={`border-t border-border ${!r.ok ? 'bg-destructive/5' : ''}`}>
                  <td className="px-2 py-1.5">{r.descripcion}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.cantidad_solicitada)}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{Number(r.stock_disponible)}</td>
                  <td className={`px-2 py-1.5 text-right tabular-nums ${!r.ok ? 'text-destructive font-semibold' : ''}`}>{Number(r.faltante)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStockDialog({ open: false, rows: [], ok: true })}>Cancelar</Button>
            <Button onClick={confirmConvertToSale} className={stockDialog.ok ? '' : 'bg-amber-600 hover:bg-amber-700'}>
              {stockDialog.ok ? 'Convertir a venta' : 'Convertir de todos modos'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
