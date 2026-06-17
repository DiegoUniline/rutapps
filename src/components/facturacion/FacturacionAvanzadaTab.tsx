import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { format } from 'date-fns';
import {
  Receipt, Users, Download, Mail, ShieldCheck, FileSearch, RefreshCw, Loader2, FileDown,
} from 'lucide-react';

/**
 * Secciones avanzadas de facturación (solo super admin).
 * Cada sección se exporta para usarse como vista independiente dentro del módulo.
 */
export default function FacturacionAvanzadaTab() {
  return <ComplementosPagoSection />;
}


// ============================================================
// 1. COMPLEMENTOS DE PAGO (REP)
// ============================================================
function ComplementosPagoSection() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [showDialog, setShowDialog] = useState(false);

  const { data: pagos, isLoading } = useQuery({
    queryKey: ['cfdi_pagos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cfdi_pagos')
        .select('*, cfdi_pago_documentos(*)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Complementos de Pago (REP / Pago 2.0)</CardTitle>
        <Button size="sm" onClick={() => setShowDialog(true)}>
          <Receipt className="h-4 w-4 mr-1.5" />Nuevo complemento
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !pagos?.length ? (
          <p className="text-center text-sm text-muted-foreground py-8">
            No hay complementos de pago emitidos. Crea uno cuando recibas un cobro de una factura PPD.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Folio</TableHead>
                <TableHead>Fecha pago</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>Forma</TableHead>
                <TableHead>UUID</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Archivos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagos.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>{p.serie}-{p.folio}</TableCell>
                  <TableCell>{format(new Date(p.fecha_pago), 'dd/MM/yyyy HH:mm')}</TableCell>
                  <TableCell>{fmt(p.monto)}</TableCell>
                  <TableCell>{p.forma_pago}</TableCell>
                  <TableCell className="text-[10px] font-mono">{p.folio_fiscal?.slice(0, 13)}…</TableCell>
                  <TableCell><Badge variant={p.status === 'timbrado' ? 'default' : 'destructive'}>{p.status}</Badge></TableCell>
                  <TableCell className="flex gap-1">
                    {p.pdf_url && <Button size="sm" variant="ghost" asChild><a href={p.pdf_url} target="_blank" rel="noreferrer">PDF</a></Button>}
                    {p.xml_url && <Button size="sm" variant="ghost" asChild><a href={p.xml_url} target="_blank" rel="noreferrer">XML</a></Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {showDialog && <ComplementoPagoDialog open={showDialog} onClose={() => setShowDialog(false)} />}
    </Card>
  );
}

function ComplementoPagoDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { empresa, user } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [cobroId, setCobroId] = useState<string>('');
  const [fechaPago, setFechaPago] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [formaPago, setFormaPago] = useState('03');
  const [numOperacion, setNumOperacion] = useState('');

  // Lista de cobros PPD pendientes de timbrar REP
  const { data: cobros } = useQuery({
    queryKey: ['cobros-ppd', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cobros')
        .select('id, fecha, monto, metodo_pago, ventas:venta_id(id, folio, total, factura_cfdi_id, cfdis:factura_cfdi_id(id, folio_fiscal, folio, serie, payment_method, currency, status, total, receiver_rfc, receiver_name, receiver_fiscal_regime, receiver_tax_zip_code))')
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data as any[]) || []).filter((c: any) => c.ventas?.cfdis?.payment_method === 'PPD' && c.ventas?.cfdis?.status === 'timbrado');
    },
  });

  const selectedCobro = useMemo(() => cobros?.find((c: any) => c.id === cobroId), [cobros, cobroId]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!selectedCobro) throw new Error('Selecciona un cobro');
      const cfdi = selectedCobro.ventas.cfdis;
      const body = {
        action: 'timbrar_pago',
        empresa_id: empresa!.id,
        cobro_id: selectedCobro.id,
        issuer: {
          fiscal_regime: empresa!.regimen_fiscal,
          rfc: empresa!.rfc,
          name: empresa!.razon_social,
        },
        expedition_place: (empresa as any).cp,
        fecha_pago: new Date(fechaPago).toISOString(),
        forma_pago: formaPago,
        moneda: cfdi.currency || 'MXN',
        tipo_cambio: 1,
        monto: selectedCobro.monto,
        num_operacion: numOperacion || undefined,
        receiver: {
          rfc: cfdi.receiver_rfc,
          name: cfdi.receiver_name,
          fiscal_regime: cfdi.receiver_fiscal_regime,
          tax_zip_code: cfdi.receiver_tax_zip_code,
        },
        related_docs: [{
          cfdi_id: cfdi.id,
          venta_id: selectedCobro.ventas.id,
          cfdi_relacionado_uuid: cfdi.folio_fiscal,
          serie_dr: cfdi.serie,
          folio_dr: cfdi.folio,
          moneda_dr: cfdi.currency || 'MXN',
          tipo_cambio_dr: 1,
          num_parcialidad: 1,
          imp_saldo_ant: cfdi.total,
          imp_pagado: selectedCobro.monto,
          imp_saldo_insoluto: Math.max(0, Number(cfdi.total) - Number(selectedCobro.monto)),
          metodo_pago_dr: 'PPD',
          objeto_imp_dr: '02',
        }],
      };
      const { data, error } = await supabase.functions.invoke('facturama', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Complemento de pago timbrado ✓');
      qc.invalidateQueries({ queryKey: ['cfdi_pagos'] });
      onClose();
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Complemento de Pago</DialogTitle>
          <DialogDescription>Selecciona un cobro asociado a una factura PPD para emitir el REP.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Cobro a complementar</Label>
            <Select value={cobroId} onValueChange={setCobroId}>
              <SelectTrigger><SelectValue placeholder="Selecciona un cobro PPD…" /></SelectTrigger>
              <SelectContent>
                {(cobros || []).map((c: any) => (
                  <SelectItem key={c.id} value={c.id}>
                    {format(new Date(c.fecha), 'dd/MM/yy')} · {fmt(c.monto)} · Folio {c.ventas?.folio} · UUID {c.ventas?.cfdis?.folio_fiscal?.slice(0,8)}…
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Fecha de pago</Label>
              <Input type="datetime-local" value={fechaPago} onChange={e => setFechaPago(e.target.value)} />
            </div>
            <div>
              <Label>Forma de pago</Label>
              <Select value={formaPago} onValueChange={setFormaPago}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="01">01 - Efectivo</SelectItem>
                  <SelectItem value="02">02 - Cheque nominativo</SelectItem>
                  <SelectItem value="03">03 - Transferencia electrónica</SelectItem>
                  <SelectItem value="04">04 - Tarjeta de crédito</SelectItem>
                  <SelectItem value="28">28 - Tarjeta de débito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>No. de operación (opcional)</Label>
            <Input value={numOperacion} onChange={e => setNumOperacion(e.target.value)} placeholder="Referencia bancaria" />
          </div>
          {selectedCobro && (
            <div className="rounded-md border p-3 text-sm bg-muted/30">
              <div>Factura UUID: <span className="font-mono text-xs">{selectedCobro.ventas?.cfdis?.folio_fiscal}</span></div>
              <div>Total factura: {fmt(selectedCobro.ventas?.cfdis?.total)}</div>
              <div>Monto a aplicar: {fmt(selectedCobro.monto)}</div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!cobroId || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Receipt className="h-4 w-4 mr-1.5" />}
            Timbrar REP
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 2. FACTURA GLOBAL
// ============================================================
function FacturaGlobalSection() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const today = new Date();
  const [periodicidad, setPeriodicidad] = useState('04'); // mensual
  const [year, setYear] = useState(String(today.getFullYear()));
  const [mes, setMes] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [fechaInicio, setFechaInicio] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'));
  const [fechaFin, setFechaFin] = useState(format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd'));

  // Ventas POS sin cliente fiscal y no facturadas global
  const { data: ventas, isLoading } = useQuery({
    queryKey: ['ventas-global', empresa?.id, fechaInicio, fechaFin],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, subtotal, iva, ieps, cliente_id, venta_lineas(id, facturado_global)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin + 'T23:59:59')
        .in("status", ["entregado","facturado","confirmado"] as any)
        .order('fecha', { ascending: true });
      if (error) throw error;
      return (data || []).filter((v: any) => v.venta_lineas?.every((l: any) => !l.facturado_global));
    },
  });

  const total = (ventas || []).reduce((s: number, v: any) => s + Number(v.total || 0), 0);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!ventas?.length) throw new Error('No hay ventas para facturar');
      const body = {
        action: 'timbrar_global',
        empresa_id: empresa!.id,
        issuer: {
          fiscal_regime: empresa!.regimen_fiscal,
          rfc: empresa!.rfc,
          name: empresa!.razon_social,
        },
        expedition_place: (empresa as any).cp,
        periodicidad,
        meses: mes,
        year,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        payment_form: '01',
        venta_lines: ventas.map((v: any) => ({
          venta_id: v.id,
          folio: v.folio,
          subtotal: Number(v.subtotal || v.total),
          iva: Number(v.iva || 0),
          ieps: Number(v.ieps || 0),
          total: Number(v.total),
          descripcion: `Venta folio ${v.folio} del ${format(new Date(v.fecha), 'dd/MM/yyyy')}`,
          product_code: '01010101',
          unit: 'Actividad',
          unit_code: 'ACT',
          iva_rate: Number(v.iva || 0) > 0 ? 0.16 : 0,
          ieps_rate: 0,
        })),
      };
      const { data, error } = await supabase.functions.invoke('facturama', { body });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Factura global timbrada ✓');
      qc.invalidateQueries({ queryKey: ['ventas-global'] });
      qc.invalidateQueries({ queryKey: ['cfdis'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Factura Global de Público en General</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <Label>Periodicidad</Label>
            <Select value={periodicidad} onValueChange={setPeriodicidad}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="01">01 - Diario</SelectItem>
                <SelectItem value="02">02 - Semanal</SelectItem>
                <SelectItem value="03">03 - Quincenal</SelectItem>
                <SelectItem value="04">04 - Mensual</SelectItem>
                <SelectItem value="05">05 - Bimestral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mes</Label>
            <Select value={mes} onValueChange={setMes}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0')).map(m => (
                  <SelectItem key={m} value={m}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Año</Label>
            <Input value={year} onChange={e => setYear(e.target.value)} />
          </div>
          <div>
            <Label>Desde</Label>
            <Input type="date" value={fechaInicio} onChange={e => setFechaInicio(e.target.value)} />
          </div>
          <div>
            <Label>Hasta</Label>
            <Input type="date" value={fechaFin} onChange={e => setFechaFin(e.target.value)} />
          </div>
        </div>
        <div className="flex items-center justify-between p-3 rounded-md border bg-muted/30">
          <div>
            <div className="text-sm font-medium">{ventas?.length || 0} ventas en el periodo</div>
            <div className="text-xs text-muted-foreground">Total: {fmt(total)}</div>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!ventas?.length || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Users className="h-4 w-4 mr-1.5" />}
            Generar Factura Global
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : ventas?.length ? (
          <div className="max-h-80 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Folio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.slice(0, 100).map((v: any) => (
                  <TableRow key={v.id}>
                    <TableCell>{v.folio}</TableCell>
                    <TableCell>{format(new Date(v.fecha), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="text-right">{fmt(v.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ============================================================
// 3. DESCARGA MASIVA
// ============================================================
function DescargaMasivaSection() {
  const { empresa } = useAuth();
  const today = new Date();
  const [desde, setDesde] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'));
  const [hasta, setHasta] = useState(format(today, 'yyyy-MM-dd'));
  const [tipo, setTipo] = useState<'todos' | 'I' | 'E' | 'P'>('todos');
  const [formato, setFormato] = useState<'ambos' | 'xml' | 'pdf'>('ambos');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const handleDescarga = async () => {
    setProgress({ done: 0, total: 0 });
    try {
      let query = supabase.from('cfdis')
        .select('id, facturama_id, serie, folio, folio_fiscal, pdf_url, xml_url, cfdi_type, created_at')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'timbrado')
        .gte('created_at', desde)
        .lte('created_at', hasta + 'T23:59:59');
      if (tipo !== 'todos') query = query.eq('cfdi_type', tipo);
      const { data: cfdis, error } = await query;
      if (error) throw error;
      if (!cfdis?.length) { toast.warning('No hay CFDIs en el periodo'); setProgress(null); return; }

      // Carga dinámica de jszip
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      setProgress({ done: 0, total: cfdis.length });

      let done = 0;
      // 5 concurrentes
      const queue = [...cfdis];
      const workers = Array.from({ length: 5 }, async () => {
        while (queue.length) {
          const c = queue.shift()!;
          const baseName = `${c.serie || ''}${c.folio || ''}_${c.folio_fiscal?.slice(0, 8) || c.facturama_id}`;
          try {
            if ((formato === 'ambos' || formato === 'pdf') && c.facturama_id) {
              const { data: r } = await supabase.functions.invoke('facturama', { body: { action: 'descargar', facturama_id: c.facturama_id, type: 'pdf' } });
              if (r?.content) zip.file(`PDF/${baseName}.pdf`, r.content, { base64: true });
            }
            if ((formato === 'ambos' || formato === 'xml') && c.facturama_id) {
              const { data: r } = await supabase.functions.invoke('facturama', { body: { action: 'descargar', facturama_id: c.facturama_id, type: 'xml' } });
              if (r?.content) zip.file(`XML/${baseName}.xml`, r.content, { base64: true });
            }
          } catch (e) { console.error(e); }
          done++;
          setProgress({ done, total: cfdis.length });
        }
      });
      await Promise.all(workers);

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CFDIs_${desde}_${hasta}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`${cfdis.length} CFDIs descargados`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Descarga Masiva de CFDIs</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><Label>Desde</Label><Input type="date" value={desde} onChange={e => setDesde(e.target.value)} /></div>
          <div><Label>Hasta</Label><Input type="date" value={hasta} onChange={e => setHasta(e.target.value)} /></div>
          <div>
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={v => setTipo(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="I">Ingresos</SelectItem>
                <SelectItem value="E">Egresos</SelectItem>
                <SelectItem value="P">Pagos (REP)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Formato</Label>
            <Select value={formato} onValueChange={v => setFormato(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ambos">XML + PDF</SelectItem>
                <SelectItem value="xml">Solo XML</SelectItem>
                <SelectItem value="pdf">Solo PDF</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleDescarga} disabled={!!progress}>
          {progress ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <FileDown className="h-4 w-4 mr-1.5" />}
          {progress ? `${progress.done}/${progress.total}` : 'Descargar ZIP'}
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 4. REENVÍO POR CORREO
// ============================================================
function ReenvioCorreoSection() {
  const { empresa } = useAuth();
  const [cfdiId, setCfdiId] = useState('');
  const [email, setEmail] = useState('');
  const [mensaje, setMensaje] = useState('');
  const qc = useQueryClient();

  const { data: cfdis } = useQuery({
    queryKey: ['cfdis-timbrados', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('cfdis')
        .select('id, serie, folio, folio_fiscal, receiver_name, receiver_rfc, total, enviado_at, enviado_a')
        .eq('empresa_id', empresa!.id)
        .eq('status', 'timbrado')
        .order('created_at', { ascending: false })
        .limit(200);
      return data || [];
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      if (!cfdiId || !email) throw new Error('Selecciona CFDI y captura un correo');
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: { action: 'enviar_correo', cfdi_id: cfdiId, email_to: email, mensaje },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success('Correo encolado ✓');
      qc.invalidateQueries({ queryKey: ['cfdis-timbrados'] });
      setCfdiId(''); setEmail(''); setMensaje('');
    },
    onError: (e: any) => toast.error(e.message),
  });

  const selected = cfdis?.find(c => c.id === cfdiId);

  return (
    <Card>
      <CardHeader><CardTitle>Reenviar CFDI por correo</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div>
          <Label>CFDI</Label>
          <Select value={cfdiId} onValueChange={setCfdiId}>
            <SelectTrigger><SelectValue placeholder="Selecciona un CFDI timbrado…" /></SelectTrigger>
            <SelectContent>
              {(cfdis || []).map(c => (
                <SelectItem key={c.id} value={c.id}>
                  {c.serie}-{c.folio} · {c.receiver_name} · {c.receiver_rfc}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selected?.enviado_at && (
            <p className="text-xs text-muted-foreground mt-1">Último envío: {format(new Date(selected.enviado_at), 'dd/MM/yyyy HH:mm')} a {selected.enviado_a}</p>
          )}
        </div>
        <div>
          <Label>Correo destinatario</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="cliente@dominio.com" />
        </div>
        <div>
          <Label>Mensaje (opcional)</Label>
          <Textarea value={mensaje} onChange={e => setMensaje(e.target.value)} rows={3} />
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Mail className="h-4 w-4 mr-1.5" />}
          Enviar correo
        </Button>
      </CardContent>
    </Card>
  );
}

// ============================================================
// 5. VALIDAR RFC
// ============================================================
function ValidarRfcSection() {
  const [rfc, setRfc] = useState('');
  const [name, setName] = useState('');
  const [zip, setZip] = useState('');
  const [resultado, setResultado] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!rfc) throw new Error('RFC requerido');
      const { data, error } = await supabase.functions.invoke('facturama', {
        body: { action: 'validar_rfc', rfc, name, zip_code: zip },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (data) => {
      setResultado(data);
      if (data.status === 'valido') toast.success('RFC válido ✓');
      else if (data.status === 'inconsistencia') toast.warning('Inconsistencia detectada');
      else toast.error('RFC no encontrado en el SAT');
    },
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader><CardTitle>Validar RFC + Razón Social + CP fiscal</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><Label>RFC</Label><Input value={rfc} onChange={e => setRfc(e.target.value.toUpperCase())} placeholder="XAXX010101000" /></div>
          <div><Label>Razón social</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
          <div><Label>CP fiscal</Label><Input value={zip} onChange={e => setZip(e.target.value)} maxLength={5} /></div>
        </div>
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <ShieldCheck className="h-4 w-4 mr-1.5" />}
          Validar con SAT
        </Button>
        {resultado && (
          <div className="rounded-md border p-3 text-sm">
            <Badge variant={resultado.status === 'valido' ? 'default' : 'destructive'} className="mb-2">{resultado.status}</Badge>
            <pre className="text-[10px] overflow-x-auto">{JSON.stringify(resultado.detalle, null, 2)}</pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// 6. SUSTITUIR CFDI (placeholder UI - requiere wizard completo)
// ============================================================
function SustituirCfdiSection() {
  return (
    <Card>
      <CardHeader><CardTitle>Sustituir CFDI</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          La sustitución guiada (cancelar y re-timbrar con relación 04) se invoca desde la fila del CFDI en la pestaña <strong>Facturas</strong>. Al cancelar con motivo <strong>01</strong> el sistema solicitará los datos del CFDI sustituto, lo timbrará y enviará la cancelación con el folio nuevo automáticamente.
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          <FileSearch className="inline h-3.5 w-3.5 mr-1" />
          Edge function: <code>action: "sustituir"</code> con <code>original_uuid</code>, <code>rfc_emisor</code> y <code>new_invoice</code>.
        </p>
      </CardContent>
    </Card>
  );
}
