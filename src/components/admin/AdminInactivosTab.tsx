import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { AlertTriangle, Trash2, RefreshCw, Loader2, Search, ShieldAlert } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface InactivaRow {
  empresa_id: string;
  nombre: string;
  email: string | null;
  telefono: string | null;
  owner_email: string | null;
  empresa_created_at: string;
  status: string | null;
  trial_ends_at: string | null;
  fecha_vencimiento: string | null;
  current_period_end: string | null;
  last_sign_in_at: string | null;
  last_venta_at: string | null;
  dias_sin_actividad: number;
  dias_vencido: number;
  motivo: string;
  total_ventas: number;
  total_clientes: number;
  total_usuarios: number;
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  trial: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  suspended: 'bg-red-100 text-red-700',
  cancelada: 'bg-muted text-muted-foreground',
  pendiente_pago: 'bg-amber-100 text-amber-700',
};

export default function AdminInactivosTab() {
  const { user } = useAuth();
  const [diasInactivo, setDiasInactivo] = useState(30);
  const [diasVencido, setDiasVencido] = useState(30);
  const [rows, setRows] = useState<InactivaRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  async function load() {
    setLoading(true);
    setSelected(new Set());
    const { data, error } = await supabase.rpc('get_inactive_empresas', {
      p_dias_inactivo: diasInactivo,
      p_dias_vencido: diasVencido,
    });
    if (error) {
      toast.error('Error al cargar: ' + error.message);
    } else {
      setRows((data as InactivaRow[]) || []);
    }
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.nombre.toLowerCase().includes(q) ||
      (r.email || '').toLowerCase().includes(q) ||
      (r.owner_email || '').toLowerCase().includes(q) ||
      (r.telefono || '').toLowerCase().includes(q)
    );
  }, [rows, search]);

  const allSelected = filtered.length > 0 && filtered.every(r => selected.has(r.empresa_id));
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(filtered.map(r => r.empresa_id)));
  };
  const toggleOne = (id: string) => {
    const n = new Set(selected);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelected(n);
  };

  async function handleBulkDelete() {
    if (!user || selected.size === 0) return;
    if (confirmText !== 'ELIMINAR') {
      toast.error('Debes escribir ELIMINAR para confirmar');
      return;
    }
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const { data, error } = await supabase.rpc('delete_empresas_bulk', {
        p_empresa_ids: ids,
        p_deleted_by: user.id,
      });
      if (error) throw error;
      const res = data as any;
      toast.success(`Eliminadas: ${res.eliminadas} · Fallidas: ${res.fallidas}`);
      if (res.fallidas > 0) {
        console.error('Errores:', res.errores);
      }
      setConfirmOpen(false);
      setConfirmText('');
      load();
    } catch (e: any) {
      toast.error('Error: ' + e.message);
    } finally {
      setDeleting(false);
    }
  }

  const fmt = (d: string | null) => d ? format(new Date(d), 'dd/MM/yyyy', { locale: es }) : '—';

  return (
    <Card className="border border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-destructive" />
          Empresas inactivas y vencidas
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Limpieza masiva: identifica empresas sin actividad o con suscripción vencida y elimina toda su data. 
          Los correos y teléfonos quedan en la lista de bloqueo para impedir nuevos registros de prueba.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 bg-primary/5 rounded-lg border border-primary/20">
          <div>
            <Label className="text-xs">Días sin iniciar sesión</Label>
            <Input type="number" min={1} value={diasInactivo} onChange={e => setDiasInactivo(parseInt(e.target.value) || 30)} />
          </div>
          <div>
            <Label className="text-xs">Días vencidos</Label>
            <Input type="number" min={1} value={diasVencido} onChange={e => setDiasVencido(parseInt(e.target.value) || 30)} />
          </div>
          <div className="md:col-span-2 flex items-end gap-2">
            <Button onClick={load} disabled={loading} className="w-full">
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-2" />}
              Buscar empresas
            </Button>
          </div>
        </div>

        {/* Search + actions */}
        <div className="flex flex-col md:flex-row gap-2 items-stretch md:items-center justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nombre, email, teléfono..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {selected.size} seleccionadas de {filtered.length}
            </span>
            <Button
              variant="destructive"
              disabled={selected.size === 0 || deleting}
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Eliminar {selected.size > 0 ? `(${selected.size})` : 'seleccionadas'}
            </Button>
          </div>
        </div>

        {/* Warning banner */}
        <div className="flex items-start gap-2 p-3 rounded-md bg-destructive/10 border border-destructive/30 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
          <div>
            <strong className="text-destructive">Acción irreversible.</strong> Se elimina TODA la data: ventas, clientes, productos, inventario, cobros, facturas, usuarios, etc.
            Los emails y teléfonos se agregan automáticamente a la <strong>lista negra</strong> para que no puedan volver a registrar trial.
          </div>
        </div>

        {/* Table */}
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox checked={allSelected} onCheckedChange={toggleAll} />
                </TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead>Contacto</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Última sesión</TableHead>
                <TableHead>Vencimiento</TableHead>
                <TableHead>Motivo</TableHead>
                <TableHead className="text-right">Datos</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No hay empresas que cumplan los criterios</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.empresa_id} className={selected.has(r.empresa_id) ? 'bg-destructive/5' : ''}>
                  <TableCell>
                    <Checkbox checked={selected.has(r.empresa_id)} onCheckedChange={() => toggleOne(r.empresa_id)} />
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.nombre}</div>
                    <div className="text-xs text-muted-foreground">Creada: {fmt(r.empresa_created_at)}</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{r.owner_email || r.email || '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.telefono || '—'}</div>
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_BADGE[r.status || ''] || 'bg-muted'}>
                      {r.status || 'sin_sub'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{fmt(r.last_sign_in_at)}</div>
                    <div className="text-xs text-muted-foreground">{r.dias_sin_actividad}d</div>
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{fmt(r.fecha_vencimiento) !== '—' ? fmt(r.fecha_vencimiento) : fmt(r.trial_ends_at)}</div>
                    {r.dias_vencido > 0 && <div className="text-xs text-destructive">{r.dias_vencido}d vencida</div>}
                  </TableCell>
                  <TableCell className="text-xs max-w-[200px]">{r.motivo}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    <div>{r.total_ventas} vtas</div>
                    <div>{r.total_clientes} clientes</div>
                    <div>{r.total_usuarios} usuarios</div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>

      {/* Confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirmar eliminación masiva
            </DialogTitle>
            <DialogDescription>
              Estás a punto de eliminar <strong>{selected.size} empresa(s)</strong> con TODA su data. Sus correos y teléfonos quedarán bloqueados para no permitir nuevo trial.
              Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Escribe <strong>ELIMINAR</strong> para confirmar:</Label>
            <Input value={confirmText} onChange={e => setConfirmText(e.target.value)} placeholder="ELIMINAR" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmOpen(false); setConfirmText(''); }}>Cancelar</Button>
            <Button variant="destructive" onClick={handleBulkDelete} disabled={deleting || confirmText !== 'ELIMINAR'}>
              {deleting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Trash2 className="h-4 w-4 mr-2" />}
              Eliminar {selected.size} empresa(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
