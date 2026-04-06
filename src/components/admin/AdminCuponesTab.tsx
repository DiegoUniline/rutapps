import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Pencil, Ticket, Users, Eye, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface Cupon {
  id: string;
  codigo: string;
  descripcion: string;
  descuento_pct: number;
  planes_aplicables: string[];
  uso_maximo: number | null;
  uso_por_empresa: number;
  usos_actuales: number;
  meses_duracion: number | null;
  acumulable: boolean;
  activo: boolean;
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  created_at: string;
}

interface CuponUso {
  id: string;
  cupon_id: string;
  empresa_id: string;
  aplicado_at: string;
  meses_restantes: number | null;
  empresas?: { nombre: string } | null;
}

const PLANES_OPTIONS = [
  { value: 'mensual', label: 'Mensual' },
  { value: 'semestral', label: 'Semestral' },
  { value: 'anual', label: 'Anual' },
];

const emptyCupon = {
  codigo: '',
  descripcion: '',
  descuento_pct: 10,
  planes_aplicables: [] as string[],
  uso_maximo: null as number | null,
  uso_por_empresa: 1,
  meses_duracion: null as number | null,
  acumulable: false,
  activo: true,
  vigencia_inicio: '',
  vigencia_fin: '',
};

export default function AdminCuponesTab() {
  const [cupones, setCupones] = useState<Cupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyCupon });
  const [saving, setSaving] = useState(false);

  // Usage detail
  const [showUsos, setShowUsos] = useState<string | null>(null);
  const [usos, setUsos] = useState<CuponUso[]>([]);
  const [usosLoading, setUsosLoading] = useState(false);

  useEffect(() => { loadCupones(); }, []);

  async function loadCupones() {
    setLoading(true);
    const { data } = await supabase
      .from('cupones')
      .select('*')
      .order('created_at', { ascending: false });
    setCupones((data as any[]) || []);
    setLoading(false);
  }

  function openCreate() {
    setEditId(null);
    setForm({ ...emptyCupon });
    setShowForm(true);
  }

  function openEdit(c: Cupon) {
    setEditId(c.id);
    setForm({
      codigo: c.codigo,
      descripcion: c.descripcion || '',
      descuento_pct: c.descuento_pct,
      planes_aplicables: c.planes_aplicables || [],
      uso_maximo: c.uso_maximo,
      uso_por_empresa: c.uso_por_empresa,
      meses_duracion: c.meses_duracion,
      acumulable: c.acumulable,
      activo: c.activo,
      vigencia_inicio: c.vigencia_inicio || '',
      vigencia_fin: c.vigencia_fin || '',
    });
    setShowForm(true);
  }

  async function handleSave() {
    if (!form.codigo.trim()) { toast.error('El código es requerido'); return; }
    if (form.descuento_pct <= 0 || form.descuento_pct > 100) { toast.error('El descuento debe ser entre 1 y 100'); return; }

    setSaving(true);
    const payload = {
      codigo: form.codigo.trim().toUpperCase(),
      descripcion: form.descripcion,
      descuento_pct: form.descuento_pct,
      planes_aplicables: form.planes_aplicables,
      uso_maximo: form.uso_maximo || null,
      uso_por_empresa: form.uso_por_empresa || 1,
      meses_duracion: form.meses_duracion || null,
      acumulable: form.acumulable,
      activo: form.activo,
      vigencia_inicio: form.vigencia_inicio || null,
      vigencia_fin: form.vigencia_fin || null,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from('cupones').update(payload).eq('id', editId));
    } else {
      ({ error } = await supabase.from('cupones').insert(payload));
    }

    if (error) {
      toast.error(error.message.includes('cupones_codigo_unique') ? 'Ya existe un cupón con ese código' : error.message);
    } else {
      toast.success(editId ? 'Cupón actualizado' : 'Cupón creado');
      setShowForm(false);
      loadCupones();
    }
    setSaving(false);
  }

  async function toggleActive(c: Cupon) {
    await supabase.from('cupones').update({ activo: !c.activo }).eq('id', c.id);
    loadCupones();
  }

  async function loadUsos(cuponId: string) {
    setShowUsos(cuponId);
    setUsosLoading(true);
    const { data } = await supabase
      .from('cupon_usos')
      .select('*, empresas:empresa_id(nombre)')
      .eq('cupon_id', cuponId)
      .order('aplicado_at', { ascending: false });
    setUsos((data as any[]) || []);
    setUsosLoading(false);
  }

  function togglePlan(plan: string) {
    setForm(f => ({
      ...f,
      planes_aplicables: f.planes_aplicables.includes(plan)
        ? f.planes_aplicables.filter(p => p !== plan)
        : [...f.planes_aplicables, plan],
    }));
  }

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold flex items-center gap-2"><Ticket className="h-5 w-5 text-primary" /> Cupones de descuento</h2>
        <Button onClick={openCreate} size="sm"><Plus className="h-4 w-4 mr-1" /> Nuevo cupón</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descuento</TableHead>
                <TableHead>Planes</TableHead>
                <TableHead>Usos</TableHead>
                <TableHead>Meses</TableHead>
                <TableHead>Acumulable</TableHead>
                <TableHead>Vigencia</TableHead>
                <TableHead>Activo</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cupones.map(c => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono font-bold">{c.codigo}</TableCell>
                  <TableCell><Badge variant="secondary">{c.descuento_pct}%</Badge></TableCell>
                  <TableCell className="text-xs">
                    {c.planes_aplicables?.length ? c.planes_aplicables.join(', ') : 'Todos'}
                  </TableCell>
                  <TableCell>
                    {c.usos_actuales}{c.uso_maximo ? `/${c.uso_maximo}` : '/∞'}
                    <span className="text-xs text-muted-foreground ml-1">(máx {c.uso_por_empresa}/emp)</span>
                  </TableCell>
                  <TableCell>{c.meses_duracion ? `${c.meses_duracion} meses` : 'Permanente'}</TableCell>
                  <TableCell>{c.acumulable ? <Badge className="bg-green-600 text-white text-[10px]">Sí</Badge> : <Badge variant="outline" className="text-[10px]">No</Badge>}</TableCell>
                  <TableCell className="text-xs">
                    {c.vigencia_inicio && c.vigencia_fin
                      ? `${format(new Date(c.vigencia_inicio), 'dd/MM/yy')} - ${format(new Date(c.vigencia_fin), 'dd/MM/yy')}`
                      : c.vigencia_inicio ? `Desde ${format(new Date(c.vigencia_inicio), 'dd/MM/yy')}`
                      : c.vigencia_fin ? `Hasta ${format(new Date(c.vigencia_fin), 'dd/MM/yy')}`
                      : 'Sin límite'}
                  </TableCell>
                  <TableCell>
                    <Switch checked={c.activo} onCheckedChange={() => toggleActive(c)} />
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => loadUsos(c.id)}><Eye className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {cupones.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    No hay cupones creados aún
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar cupón' : 'Nuevo cupón'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Código</Label>
              <Input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value.toUpperCase() }))} placeholder="BIENVENIDO20" className="font-mono" />
            </div>
            <div>
              <Label>Descripción (nota interna)</Label>
              <Textarea value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Descuento %</Label>
                <Input type="number" min={1} max={100} value={form.descuento_pct} onChange={e => setForm(f => ({ ...f, descuento_pct: Number(e.target.value) }))} />
              </div>
              <div>
                <Label>Meses de duración</Label>
                <Input type="number" min={0} value={form.meses_duracion ?? ''} onChange={e => setForm(f => ({ ...f, meses_duracion: e.target.value ? Number(e.target.value) : null }))} placeholder="∞ permanente" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Uso máximo total</Label>
                <Input type="number" min={0} value={form.uso_maximo ?? ''} onChange={e => setForm(f => ({ ...f, uso_maximo: e.target.value ? Number(e.target.value) : null }))} placeholder="∞ ilimitado" />
              </div>
              <div>
                <Label>Usos por empresa</Label>
                <Input type="number" min={1} value={form.uso_por_empresa} onChange={e => setForm(f => ({ ...f, uso_por_empresa: Number(e.target.value) || 1 }))} />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Planes aplicables (vacío = todos)</Label>
              <div className="flex gap-3">
                {PLANES_OPTIONS.map(p => (
                  <label key={p.value} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <Checkbox checked={form.planes_aplicables.includes(p.value)} onCheckedChange={() => togglePlan(p.value)} />
                    {p.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Vigencia inicio</Label>
                <Input type="date" value={form.vigencia_inicio} onChange={e => setForm(f => ({ ...f, vigencia_inicio: e.target.value }))} />
              </div>
              <div>
                <Label>Vigencia fin</Label>
                <Input type="date" value={form.vigencia_fin} onChange={e => setForm(f => ({ ...f, vigencia_fin: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.acumulable} onCheckedChange={v => setForm(f => ({ ...f, acumulable: v }))} />
                Acumulable con descuento empresa
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch checked={form.activo} onCheckedChange={v => setForm(f => ({ ...f, activo: v }))} />
                Activo
              </label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              {editId ? 'Guardar' : 'Crear cupón'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Usage Detail Dialog */}
      <Dialog open={!!showUsos} onOpenChange={() => setShowUsos(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Users className="h-5 w-5" /> Empresas que usaron este cupón</DialogTitle>
          </DialogHeader>
          {usosLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : usos.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Nadie ha usado este cupón aún</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Meses restantes</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usos.map(u => (
                  <TableRow key={u.id}>
                    <TableCell>{(u.empresas as any)?.nombre || u.empresa_id.slice(0, 8)}</TableCell>
                    <TableCell className="text-sm">{format(new Date(u.aplicado_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                    <TableCell>{u.meses_restantes === null ? 'Permanente' : u.meses_restantes}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
