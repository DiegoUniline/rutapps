import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePartner } from '@/hooks/usePartner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

export default function PartnerCupones() {
  const { data: partner } = usePartner();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ codigo: '', descuento_pct: 10, meses_duracion: '', vigencia_fin: '' });

  const { data: cupones } = useQuery({
    queryKey: ['partner-cupones', partner?.id],
    queryFn: async () => {
      if (!partner?.id) return [];
      const { data } = await supabase.from('cupones').select('*').eq('partner_id', partner.id).order('created_at', { ascending: false });
      return data || [];
    },
    enabled: !!partner?.id,
  });

  const create = async () => {
    if (!form.codigo.trim() || !form.descuento_pct) { toast.error('Código y % son obligatorios'); return; }
    const maxPct = partner?.comision_pct ?? 0;
    if (form.descuento_pct > maxPct) {
      toast.error(`El descuento no puede ser mayor que tu comisión (${maxPct}%)`);
      return;
    }
    const { error } = await supabase.from('cupones').insert({
      codigo: form.codigo.trim().toUpperCase(),
      descuento_pct: form.descuento_pct,
      meses_duracion: form.meses_duracion ? Number(form.meses_duracion) : null,
      vigencia_fin: form.vigencia_fin || null,
      partner_id: partner!.id,
      activo: true,
    });
    if (error) { toast.error(error.message); return; }
    toast.success('Cupón creado');
    setOpen(false);
    setForm({ codigo: '', descuento_pct: 10, meses_duracion: '', vigencia_fin: '' });
    qc.invalidateQueries({ queryKey: ['partner-cupones'] });
  };

  const toggle = async (id: string, activo: boolean) => {
    await supabase.from('cupones').update({ activo: !activo }).eq('id', id);
    qc.invalidateQueries({ queryKey: ['partner-cupones'] });
  };

  const del = async (id: string) => {
    if (!confirm('¿Eliminar cupón?')) return;
    await supabase.from('cupones').delete().eq('id', id);
    toast.success('Eliminado');
    qc.invalidateQueries({ queryKey: ['partner-cupones'] });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Mis Cupones</h1>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nuevo</Button>
      </div>
      <p className="text-sm text-muted-foreground">Tu comisión es <strong>{partner?.comision_pct}%</strong>. El descuento del cupón se resta de tu comisión.</p>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Código</TableHead>
              <TableHead>Descuento</TableHead>
              <TableHead>Duración</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead>Usos</TableHead>
              <TableHead>Activo</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(cupones || []).map((c: any) => (
              <TableRow key={c.id}>
                <TableCell className="font-mono font-bold">{c.codigo}</TableCell>
                <TableCell>{c.descuento_pct}%</TableCell>
                <TableCell>{c.meses_duracion ? `${c.meses_duracion} meses` : 'Para siempre'}</TableCell>
                <TableCell>{c.vigencia_fin ? new Date(c.vigencia_fin).toLocaleDateString('es-MX') : '—'}</TableCell>
                <TableCell><Badge variant="outline">{c.usos_actuales || 0}</Badge></TableCell>
                <TableCell><Switch checked={c.activo} onCheckedChange={() => toggle(c.id, c.activo)} /></TableCell>
                <TableCell><Button variant="ghost" size="icon" onClick={() => del(c.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
              </TableRow>
            ))}
            {!cupones?.length && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sin cupones aún</TableCell></TableRow>}
          </TableBody>
        </Table>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo cupón</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Código</Label><Input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value.toUpperCase() })} placeholder="JUAN10" className="uppercase" /></div>
            <div><Label>Descuento % (máx {partner?.comision_pct ?? 0}%)</Label><Input type="number" min={1} max={partner?.comision_pct ?? 100} value={form.descuento_pct} onChange={e => {
              const max = partner?.comision_pct ?? 100;
              let v = Number(e.target.value);
              if (v > max) { v = max; toast.error(`Máximo permitido: ${max}%`); }
              setForm({ ...form, descuento_pct: v });
            }} /></div>
            <div><Label>Duración en meses (vacío = para siempre)</Label><Input type="number" min={1} value={form.meses_duracion} onChange={e => setForm({ ...form, meses_duracion: e.target.value })} /></div>
            <div><Label>Vence el (opcional)</Label><Input type="date" value={form.vigencia_fin} onChange={e => setForm({ ...form, vigencia_fin: e.target.value })} /></div>
            <Button onClick={create} className="w-full">Crear</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
