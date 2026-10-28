import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { abrirArchivoCfdi } from '@/lib/cfdiArchivos';
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
 * Secciones avanzadas de facturación (por permiso facturacion.cfdi, D-016).
 * Cada sección se exporta para usarse como vista independiente dentro del módulo.
 */
export default function FacturacionAvanzadaTab() {
  return <ComplementosPagoSection />;
}


// ============================================================
// 1. COMPLEMENTOS DE PAGO (REP, D-015)
// Lista de cobros pendientes de complemento (fecha límite día 5 del mes siguiente) y los REP emitidos.
// El servidor calcula parcialidad, saldos e impuestos de cada factura pagada.
// ============================================================
async function invocarFacturama(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('facturama', { body });
  if (error) {
    let msg = error.message;
    try { const b = await (error as any).context?.json?.(); if (b?.error) msg = b.error; } catch { /* sin cuerpo */ }
    throw new Error(msg);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

const REP_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  timbrado: { label: 'Timbrado', variant: 'default' },
  timbrando: { label: 'Timbrando', variant: 'secondary' },
  incierto: { label: 'Timbrado incierto', variant: 'destructive' },
  error: { label: 'Error', variant: 'destructive' },
  cancelado: { label: 'Cancelado', variant: 'outline' },
  cancelacion_pendiente: { label: 'Cancel. pendiente', variant: 'secondary' },
  cancelacion_rechazada: { label: 'Cancel. rechazada', variant: 'destructive' },
};

export function ComplementosPagoSection() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [cobroId, setCobroId] = useState<string | null>(null);
  const [accion, setAccion] = useState<string | null>(null);
  const hoy = format(new Date(), 'yyyy-MM-dd');

  const { data: pendientes, isLoading: cargandoPend } = useQuery({
    queryKey: ['rep-pendientes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => (await invocarFacturama({ action: 'rep_pendientes', empresa_id: empresa!.id })).pendientes as any[],
  });

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

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['rep-pendientes'] });
    qc.invalidateQueries({ queryKey: ['cfdi_pagos'] });
  };

  async function reconciliarRep(id: string) {
    setAccion(id);
    try {
      const r = await invocarFacturama({ action: 'reconciliar', tabla: 'cfdi_pagos', id });
      toast.success(r.resultado === 'ligado' ? 'Complemento encontrado en Facturama y ligado' : 'No se timbró: el cobro vuelve a pendientes');
      refrescar();
    } catch (e: any) { toast.error(e.message); } finally { setAccion(null); }
  }

  async function cancelarRep(id: string) {
    if (!confirm('¿Cancelar este complemento de pago ante el SAT (motivo 02)? El cobro se podrá volver a editar.')) return;
    setAccion(id);
    try {
      const r = await invocarFacturama({ action: 'cancelar', tabla: 'cfdi_pagos', id, motivo: '02' });
      toast.success(r.message || 'Cancelación procesada');
      refrescar();
    } catch (e: any) { toast.error(e.message); } finally { setAccion(null); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader><CardTitle>Cobros pendientes de complemento</CardTitle></CardHeader>
        <CardContent>
          {cargandoPend ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !pendientes?.length ? (
            <p className="text-center text-sm text-muted-foreground py-6">No hay cobros de facturas PPD pendientes de complemento.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha cobro</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Cobro</TableHead>
                  <TableHead>Fecha límite</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendientes.map((p: any) => (
                  <TableRow key={p.cobro_id}>
                    <TableCell>{p.fecha}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{p.cliente || '—'}</TableCell>
                    <TableCell className="text-right">{fmt(p.monto)}</TableCell>
                    <TableCell className={p.fecha_limite < hoy ? 'text-destructive font-medium' : ''}>{p.fecha_limite}</TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => setCobroId(p.cobro_id)}><Receipt className="h-4 w-4 mr-1.5" />Timbrar</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Complementos emitidos</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : !pagos?.length ? (
            <p className="text-center text-sm text-muted-foreground py-8">Aún no hay complementos de pago.</p>
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
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagos.map((p: any) => {
                  const st = REP_STATUS[p.status] ?? { label: p.status, variant: 'secondary' as const };
                  return (
                    <TableRow key={p.id}>
                      <TableCell>{p.serie}-{p.folio}</TableCell>
                      <TableCell>{p.fecha_pago ? String(p.fecha_pago).slice(0, 10) : '—'}</TableCell>
                      <TableCell>{fmt(p.monto)}</TableCell>
                      <TableCell>{p.forma_pago}</TableCell>
                      <TableCell className="text-[10px] font-mono">{p.folio_fiscal ? `${p.folio_fiscal.slice(0, 13)}…` : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={st.variant}>{st.label}</Badge>
                        {p.status === 'error' && p.error_detalle && <p className="text-[10px] text-destructive mt-0.5 max-w-[220px] truncate" title={p.error_detalle}>{p.error_detalle}</p>}
                      </TableCell>
                      <TableCell className="flex gap-1 flex-wrap">
                        {p.pdf_url && <Button size="sm" variant="ghost" onClick={(e) => abrirArchivoCfdi(e, 'cfdi_pagos', p.id, 'pdf', p.pdf_url)}>PDF</Button>}
                        {p.xml_url && <Button size="sm" variant="ghost" onClick={(e) => abrirArchivoCfdi(e, 'cfdi_pagos', p.id, 'xml', p.xml_url)}>XML</Button>}
                        {(p.status === 'incierto' || p.status === 'timbrando') && (
                          <Button size="sm" variant="outline" disabled={accion === p.id} onClick={() => reconciliarRep(p.id)}>Reconciliar</Button>
                        )}
                        {['timbrado', 'cancelacion_rechazada'].includes(p.status) && (
                          <Button size="sm" variant="ghost" className="text-destructive" disabled={accion === p.id} onClick={() => cancelarRep(p.id)}>Cancelar</Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      {cobroId && <TimbrarRepDialog cobroId={cobroId} onClose={() => setCobroId(null)} onDone={refrescar} />}
    </div>
  );
}

function TimbrarRepDialog({ cobroId, onClose, onDone }: { cobroId: string; onClose: () => void; onDone: () => void }) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const [formaPago, setFormaPago] = useState<string>('');
  const [timbrando, setTimbrando] = useState(false);

  const { data: formas } = useQuery({
    queryKey: ['cat_forma_pago_active'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_forma_pago').select('clave, descripcion').eq('activo', true).order('clave');
      return (data || []).filter((f: any) => f.clave !== '99');
    },
  });

  const { data: prep, isFetching } = useQuery({
    queryKey: ['rep-preparar', cobroId, formaPago],
    enabled: !!empresa?.id,
    queryFn: async () => invocarFacturama({ action: 'rep_preparar', empresa_id: empresa!.id, cobro_id: cobroId, forma_pago: formaPago || undefined }),
  });

  async function timbrar() {
    setTimbrando(true);
    try {
      const r = await invocarFacturama({ action: 'timbrar_rep', empresa_id: empresa!.id, cobro_id: cobroId, forma_pago: prep?.forma_pago });
      toast.success(`Complemento timbrado · UUID ${String(r.folio_fiscal || '').slice(0, 8)}…`);
      onDone();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
      onDone();
    } finally {
      setTimbrando(false);
    }
  }

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Complemento de pago</DialogTitle>
          <DialogDescription>
            {prep?.cobro ? `Cobro del ${prep.cobro.fecha} · ${prep.cobro.cliente || ''} · ${fmt(prep.cobro.monto)} (${prep.cobro.metodo_pago})` : 'Calculando…'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label>Forma de pago</Label>
              <Select value={formaPago || prep?.forma_pago || ''} onValueChange={setFormaPago}>
                <SelectTrigger><SelectValue placeholder="Elige la forma de pago" /></SelectTrigger>
                <SelectContent>
                  {(formas || []).map((f: any) => <SelectItem key={f.clave} value={f.clave}>{f.clave} - {f.descripcion}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Monto del complemento</Label>
              <Input value={prep ? fmt(prep.monto) : ''} readOnly className="bg-muted/40" />
            </div>
          </div>
          {isFetching && !prep ? (
            <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : prep?.documentos?.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Factura</TableHead>
                  <TableHead className="text-right">Parc.</TableHead>
                  <TableHead className="text-right">Saldo ant.</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Saldo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {prep.documentos.map((d: any) => (
                  <TableRow key={d.cfdi_id}>
                    <TableCell className="font-mono text-xs">{d.serie ? `${d.serie}-` : ''}{d.folio || d.uuid?.slice(0, 8)}</TableCell>
                    <TableCell className="text-right">{d.num_parcialidad}</TableCell>
                    <TableCell className="text-right">{fmt(d.imp_saldo_ant)}</TableCell>
                    <TableCell className="text-right font-medium">{fmt(d.imp_pagado)}</TableCell>
                    <TableCell className="text-right">{fmt(d.imp_saldo_insoluto)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : null}
          {prep?.errores?.length ? (
            <ul className="text-xs text-destructive list-disc pl-5 space-y-0.5">
              {prep.errores.map((e: string, i: number) => <li key={i}>{e}</li>)}
            </ul>
          ) : null}
          <p className="text-[11px] text-muted-foreground">Fecha límite para emitirlo: {prep?.fecha_limite ?? '—'}. Mientras el complemento esté vigente, el cobro no se puede editar ni cancelar.</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={timbrando}>Cerrar</Button>
          <Button onClick={timbrar} disabled={timbrando || isFetching || !prep || prep.errores?.length > 0}>
            {timbrando ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Receipt className="h-4 w-4 mr-1.5" />}
            Timbrar complemento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// 2. FACTURA GLOBAL (público en general, D-015): ventas elegidas a mano, sin ninguna factura.
// ============================================================
export function FacturaGlobalSection() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const today = new Date();
  const [periodicidad, setPeriodicidad] = useState('04'); // mensual
  const [year, setYear] = useState(String(today.getFullYear()));
  const [mes, setMes] = useState(String(today.getMonth() + 1).padStart(2, '0'));
  const [formaPago, setFormaPago] = useState('01');
  const [fechaInicio, setFechaInicio] = useState(format(new Date(today.getFullYear(), today.getMonth(), 1), 'yyyy-MM-dd'));
  const [fechaFin, setFechaFin] = useState(format(new Date(today.getFullYear(), today.getMonth() + 1, 0), 'yyyy-MM-dd'));
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());

  const meses = periodicidad === '05'
    ? ['13', '14', '15', '16', '17', '18']
    : Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));

  const { data: formas } = useQuery({
    queryKey: ['cat_forma_pago_active'],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from('cat_forma_pago').select('clave, descripcion').eq('activo', true).order('clave');
      return (data || []).filter((f: any) => f.clave !== '99');
    },
  });

  // Ventas del periodo sin ninguna factura (ninguna línea en factura vigente, en proceso o global).
  const { data: ventas, isLoading } = useQuery({
    queryKey: ['ventas-global', empresa?.id, fechaInicio, fechaFin],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, clientes(nombre), venta_lineas(id, facturado, facturado_global, factura_cfdi_id)')
        .eq('empresa_id', empresa!.id)
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin + 'T23:59:59')
        .in('status', ['entregado', 'facturado', 'confirmado'] as any)
        .order('fecha', { ascending: true })
        .limit(1000);
      if (error) throw error;
      return (data || []).filter((v: any) => (v.venta_lineas || []).length > 0
        && v.venta_lineas.every((l: any) => !l.facturado && !l.facturado_global && !l.factura_cfdi_id));
    },
  });

  const elegidas = (ventas || []).filter((v: any) => seleccion.has(v.id));
  const total = elegidas.reduce((s: number, v: any) => s + Number(v.total || 0), 0);
  const toggle = (id: string) => setSeleccion(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleTodas = () => setSeleccion(prev => prev.size === (ventas || []).length ? new Set() : new Set((ventas || []).map((v: any) => v.id)));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!elegidas.length) throw new Error('Elige las ventas de la factura global');
      return invocarFacturama({
        action: 'timbrar_global', empresa_id: empresa!.id, venta_ids: elegidas.map((v: any) => v.id),
        periodicidad, meses: mes, anio: Number(year), payment_form: formaPago,
      });
    },
    onSuccess: (r: any) => {
      toast.success(`Factura global timbrada · UUID ${String(r.folio_fiscal || '').slice(0, 8)}…`);
      setSeleccion(new Set());
      qc.invalidateQueries({ queryKey: ['ventas-global'] });
      qc.invalidateQueries({ queryKey: ['cfdis'] });
    },
    onError: (e: any) => { toast.error(e.message); qc.invalidateQueries({ queryKey: ['cfdis'] }); },
  });

  return (
    <Card>
      <CardHeader><CardTitle>Factura Global de Público en General</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <div>
            <Label>Periodicidad</Label>
            <Select value={periodicidad} onValueChange={(v) => { setPeriodicidad(v); setMes(v === '05' ? '13' : String(today.getMonth() + 1).padStart(2, '0')); }}>
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
                {meses.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Año</Label>
            <Input value={year} onChange={e => setYear(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
          <div>
            <Label>Forma de pago</Label>
            <Select value={formaPago} onValueChange={setFormaPago}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(formas || []).map((f: any) => <SelectItem key={f.clave} value={f.clave}>{f.clave} - {f.descripcion}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2">
            <Label>Rango de fechas</Label>
            <DateRangePicker from={fechaInicio} to={fechaFin} onChange={(f, t) => { setFechaInicio(f); setFechaFin(t); setSeleccion(new Set()); }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-md border bg-muted/30">
          <div>
            <div className="text-sm font-medium">{elegidas.length} de {ventas?.length || 0} ventas sin factura elegidas</div>
            <div className="text-xs text-muted-foreground">Total: {fmt(total)}</div>
          </div>
          <Button onClick={() => mutation.mutate()} disabled={!elegidas.length || mutation.isPending}>
            {mutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Users className="h-4 w-4 mr-1.5" />}
            Timbrar factura global
          </Button>
        </div>
        {isLoading ? (
          <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : ventas?.length ? (
          <div className="max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <input type="checkbox" aria-label="Elegir todas" checked={seleccion.size > 0 && seleccion.size === ventas.length} onChange={toggleTodas} />
                  </TableHead>
                  <TableHead>Folio</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventas.map((v: any) => (
                  <TableRow key={v.id} className="cursor-pointer" onClick={() => toggle(v.id)}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Elegir ${v.folio}`} checked={seleccion.has(v.id)} onChange={() => toggle(v.id)} />
                    </TableCell>
                    <TableCell>{v.folio}</TableCell>
                    <TableCell>{format(new Date(v.fecha), 'dd/MM/yyyy')}</TableCell>
                    <TableCell className="truncate max-w-[200px]">{v.clientes?.nombre || '—'}</TableCell>
                    <TableCell className="text-right">{fmt(v.total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">No hay ventas sin factura en el periodo.</p>
        )}
      </CardContent>
    </Card>
  );
}

// ============================================================
// 3. DESCARGA MASIVA
// ============================================================
export function DescargaMasivaSection() {
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
          <div className="col-span-2"><Label>Rango de fechas</Label><DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} /></div>
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
export function ReenvioCorreoSection() {
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
export function ValidarRfcSection() {
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
// 6. SUSTITUIR CFDI (D-015)
// ============================================================
export function SustituirCfdiSection() {
  return (
    <Card>
      <CardHeader><CardTitle>Sustituir CFDI</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          Abre la factura timbrada y usa <strong>Sustituir</strong>. Se crea un borrador con las mismas cantidades; corrígelo y tímbralo.
          Al timbrarse se relaciona con la original (tipo 04) y la original se cancela con motivo <strong>01</strong>.
        </p>
        <p className="text-xs text-muted-foreground mt-3">
          <FileSearch className="inline h-3.5 w-3.5 mr-1" />
          Mientras la cancelación de la original no se confirme, ambas aparecen en la venta.
        </p>
      </CardContent>
    </Card>
  );
}
