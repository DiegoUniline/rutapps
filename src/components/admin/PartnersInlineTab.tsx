import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Wallet, Inbox, Users, Check, X, Copy, Pencil, Eye } from 'lucide-react';
import { toast } from 'sonner';

const REF_BASE = 'https://rutapp.mx/?ref=';

const fmt = (n: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric' });

export default function PartnersInlineTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pagoOpen, setPagoOpen] = useState<any>(null);
  const [aprobarOpen, setAprobarOpen] = useState<any>(null);
  const [editOpen, setEditOpen] = useState<any>(null);
  const [editForm, setEditForm] = useState({ comision_pct: 20, ref_slug: '', estado: 'activo' });
  const [clientesOpen, setClientesOpen] = useState<any>(null);
  const [aprobarForm, setAprobarForm] = useState({ slug: '', comision_pct: 20 });
  const [pagoForm, setPagoForm] = useState({ monto: 0, metodo: '', referencia: '', notas: '' });
  const [form, setForm] = useState({ nombre: '', email: '', telefono: '', comision_pct: 20, ref_slug: '', user_id: '' });

  const { data: clientesPartner } = useQuery({
    queryKey: ['admin-partner-clientes', clientesOpen?.partner_id],
    enabled: !!clientesOpen?.partner_id,
    queryFn: async () => {
      const { data } = await supabase
        .from('partner_atribuciones')
        .select('created_at, metodo, ref_slug, empresas(id, nombre, created_at)')
        .eq('partner_id', clientesOpen.partner_id)
        .order('created_at', { ascending: false });
      return data || [];
    },
  });

  const copyUrl = (slug: string) => {
    const url = REF_BASE + slug;
    navigator.clipboard.writeText(url);
    toast.success('URL copiada: ' + url);
  };

  const openEdit = (p: any) => {
    setEditOpen(p);
    setEditForm({ comision_pct: Number(p.comision_pct), ref_slug: p.ref_slug, estado: p.estado });
  };

  const saveEdit = async () => {
    if (!editOpen) return;
    if (!editForm.ref_slug.trim()) { toast.error('Slug obligatorio'); return; }
    const { error } = await supabase.from('partners').update({
      comision_pct: editForm.comision_pct,
      ref_slug: editForm.ref_slug.trim().toLowerCase(),
      estado: editForm.estado,
    }).eq('id', editOpen.partner_id);
    if (error) { toast.error(error.message); return; }
    toast.success('Partner actualizado · el % aplica solo a comisiones nuevas');
    setEditOpen(null);
    qc.invalidateQueries({ queryKey: ['admin-partners'] });
  };

  const { data: partners } = useQuery({
    queryKey: ['admin-partners'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('partner_resumen').select('*').order('nombre');
      return data || [];
    },
  });

  const { data: solicitudes } = useQuery({
    queryKey: ['admin-partner-solicitudes'],
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase.from('partner_solicitudes').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });

  const pendientes = (solicitudes || []).filter((s: any) => s.status === 'pending');

  const create = async () => {
    if (!form.nombre.trim() || !form.ref_slug.trim()) { toast.error('Nombre y slug son obligatorios'); return; }
    const { error } = await supabase.from('partners').insert({
      nombre: form.nombre.trim(),
      email: form.email.trim() || null,
      telefono: form.telefono.trim() || null,
      comision_pct: form.comision_pct,
      ref_slug: form.ref_slug.trim().toLowerCase(),
      user_id: form.user_id.trim() || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Partner creado');
    setOpen(false);
    setForm({ nombre: '', email: '', telefono: '', comision_pct: 20, ref_slug: '', user_id: '' });
    qc.invalidateQueries({ queryKey: ['admin-partners'] });
  };

  const aprobar = async () => {
    if (!aprobarOpen || !aprobarForm.slug.trim()) { toast.error('Slug obligatorio'); return; }
    const { error } = await supabase.rpc('aprobar_solicitud_partner', {
      _solicitud_id: aprobarOpen.id,
      _slug: aprobarForm.slug.trim().toLowerCase(),
      _comision_pct: aprobarForm.comision_pct,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Solicitud aprobada · partner creado');
    setAprobarOpen(null);
    setAprobarForm({ slug: '', comision_pct: 20 });
    qc.invalidateQueries({ queryKey: ['admin-partner-solicitudes'] });
    qc.invalidateQueries({ queryKey: ['admin-partners'] });
  };

  const rechazar = async (s: any) => {
    const motivo = prompt('Motivo del rechazo (opcional):') || '';
    const { error } = await supabase.rpc('rechazar_solicitud_partner', {
      _solicitud_id: s.id,
      _motivo: motivo || null,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Solicitud rechazada');
    qc.invalidateQueries({ queryKey: ['admin-partner-solicitudes'] });
  };

  const registrarPago = async () => {
    if (!pagoOpen || !pagoForm.monto) { toast.error('Monto requerido'); return; }
    const { data: pendientesCom } = await supabase
      .from('partner_comisiones').select('id').eq('partner_id', pagoOpen.partner_id).eq('status', 'pendiente');
    const { error } = await supabase.rpc('pagar_comisiones_partner', {
      p_partner_id: pagoOpen.partner_id,
      p_monto: pagoForm.monto,
      p_metodo: pagoForm.metodo || null,
      p_referencia: pagoForm.referencia || null,
      p_notas: pagoForm.notas || null,
      p_comision_ids: (pendientesCom || []).map(p => p.id),
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Pago registrado');
    setPagoOpen(null);
    setPagoForm({ monto: 0, metodo: '', referencia: '', notas: '' });
    qc.invalidateQueries({ queryKey: ['admin-partners'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Partners / Revendedores</h2>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo Partner</Button>
      </div>

      <Tabs defaultValue="partners">
        <TabsList>
          <TabsTrigger value="partners" className="gap-1.5"><Users className="h-4 w-4" /> Partners activos</TabsTrigger>
          <TabsTrigger value="solicitudes" className="gap-1.5">
            <Inbox className="h-4 w-4" /> Solicitudes
            {pendientes.length > 0 && <Badge variant="destructive" className="ml-1">{pendientes.length}</Badge>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="partners" className="mt-4">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partner</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>%</TableHead>
                  <TableHead>Empresas</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Pagado</TableHead>
                  <TableHead className="text-right">Pendiente</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(partners || []).map((p: any) => (
                  <TableRow key={p.partner_id}>
                    <TableCell className="font-medium">
                      {p.nombre}
                      {p.email && <div className="text-[10px] text-muted-foreground font-normal">{p.email}</div>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <code className="text-xs bg-muted px-2 py-0.5 rounded">{p.ref_slug}</code>
                        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => copyUrl(p.ref_slug)} title={REF_BASE + p.ref_slug}>
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{p.comision_pct}%</TableCell>
                    <TableCell>
                      <button className="text-primary hover:underline font-medium" onClick={() => setClientesOpen(p)}>
                        {p.empresas_referidas}
                      </button>
                    </TableCell>
                    <TableCell className="text-right">{fmt(Number(p.total_generado))}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{fmt(Number(p.total_pagado))}</TableCell>
                    <TableCell className="text-right font-bold text-primary">{fmt(Number(p.saldo_pendiente))}</TableCell>
                    <TableCell><Badge variant={p.estado === 'activo' ? 'default' : 'secondary'}>{p.estado}</Badge></TableCell>
                    <TableCell>
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="ghost" onClick={() => setClientesOpen(p)} title="Ver clientes">
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" disabled={Number(p.saldo_pendiente) <= 0}
                          onClick={() => { setPagoOpen(p); setPagoForm({ ...pagoForm, monto: Number(p.saldo_pendiente) }); }}>
                          <Wallet className="h-3 w-3 mr-1" /> Pagar
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!partners?.length && <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">Sin partners</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="solicitudes" className="mt-4 space-y-3">
          {(solicitudes || []).length === 0 && (
            <Card className="p-8 text-center text-muted-foreground">Sin solicitudes</Card>
          )}
          {(solicitudes || []).map((s: any) => (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-[260px]">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold">{s.nombre}</h3>
                    {s.status === 'pending' && <Badge variant="outline">Pendiente</Badge>}
                    {s.status === 'approved' && <Badge className="bg-emerald-600">Aprobada</Badge>}
                    {s.status === 'rejected' && <Badge variant="destructive">Rechazada</Badge>}
                  </div>
                  <div className="text-sm text-muted-foreground">{s.email} · {s.telefono || 'Sin tel.'} · {fmtDate(s.created_at)}</div>
                  {s.motivo && <div className="text-sm mt-2"><b>Motivo:</b> {s.motivo}</div>}
                  {s.experiencia && <div className="text-sm"><b>Experiencia:</b> {s.experiencia}</div>}
                  {s.redes && <div className="text-sm"><b>Redes:</b> {s.redes}</div>}
                  {s.notas_admin && <div className="text-sm text-destructive mt-2"><b>Nota admin:</b> {s.notas_admin}</div>}
                </div>
                {s.status === 'pending' && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => {
                      setAprobarOpen(s);
                      setAprobarForm({ slug: s.email.split('@')[0].replace(/[^a-z0-9-]/gi, '').toLowerCase(), comision_pct: 20 });
                    }}>
                      <Check className="h-3.5 w-3.5 mr-1" /> Aprobar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => rechazar(s)}>
                      <X className="h-3.5 w-3.5 mr-1" /> Rechazar
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </TabsContent>
      </Tabs>

      <Dialog open={!!aprobarOpen} onOpenChange={v => !v && setAprobarOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Aprobar a {aprobarOpen?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Se creará el partner con el correo <b>{aprobarOpen?.email}</b>. Si ya tiene cuenta en Rutapp se vincula automáticamente; si no, se vinculará al registrarse.
            </p>
            <div>
              <Label>Slug de referido (link: rutapp.mx/?ref=...)</Label>
              <Input value={aprobarForm.slug} onChange={e => setAprobarForm({ ...aprobarForm, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} />
            </div>
            <div>
              <Label>Comisión %</Label>
              <Input type="number" min={0} max={100} value={aprobarForm.comision_pct}
                onChange={e => setAprobarForm({ ...aprobarForm, comision_pct: Number(e.target.value) })} />
            </div>
            <Button onClick={aprobar} className="w-full">Aprobar y crear partner</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo Partner (manual)</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label><Input value={form.nombre} onChange={e => setForm({ ...form, nombre: e.target.value })} /></div>
            <div><Label>Slug de referido *</Label><Input value={form.ref_slug} onChange={e => setForm({ ...form, ref_slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })} /></div>
            <div><Label>Email</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div><Label>Teléfono</Label><Input value={form.telefono} onChange={e => setForm({ ...form, telefono: e.target.value })} /></div>
            <div><Label>Comisión %</Label><Input type="number" min={0} max={100} value={form.comision_pct} onChange={e => setForm({ ...form, comision_pct: Number(e.target.value) })} /></div>
            <Button onClick={create} className="w-full">Crear</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!pagoOpen} onOpenChange={v => !v && setPagoOpen(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Pagar a {pagoOpen?.nombre}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Monto</Label><Input type="number" value={pagoForm.monto} onChange={e => setPagoForm({ ...pagoForm, monto: Number(e.target.value) })} /></div>
            <div><Label>Método</Label><Input value={pagoForm.metodo} onChange={e => setPagoForm({ ...pagoForm, metodo: e.target.value })} placeholder="Transferencia / Efectivo" /></div>
            <div><Label>Referencia</Label><Input value={pagoForm.referencia} onChange={e => setPagoForm({ ...pagoForm, referencia: e.target.value })} placeholder="Folio de transferencia" /></div>
            <div><Label>Notas</Label><Input value={pagoForm.notas} onChange={e => setPagoForm({ ...pagoForm, notas: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">Todas las comisiones pendientes se marcarán como pagadas.</p>
            <Button onClick={registrarPago} className="w-full">Registrar pago</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
