import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Search, Package, Zap } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SearchableSelect from '@/components/SearchableSelect';
import ModalSelect from '@/components/ModalSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useEntregasList, useVendedoresList } from '@/hooks/useEntregas';
import { fmtDate, cn } from '@/lib/utils';
import { toast } from 'sonner';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  surtido: { label: 'Surtido', variant: 'default' },
  asignado: { label: 'Asignado', variant: 'default' },
  cargado: { label: 'Cargado', variant: 'default' },
  en_ruta: { label: 'En ruta', variant: 'default' },
  hecho: { label: 'Hecho', variant: 'outline' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
};

export default function EntregaListPage() {
  const { empresa, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('todos');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSurtirDialog, setShowSurtirDialog] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [vendedorRutaId, setVendedorRutaId] = useState('');

  const { data: entregas, isLoading } = useEntregasList(search, vendedorFilter, statusFilter);
  const { data: vendedores } = useVendedoresList();

  const { data: almacenesList } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const almacenOptions = (almacenesList ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const vendedorOptions = (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }));

  const counts = {
    total: entregas?.length ?? 0,
    borrador: entregas?.filter(e => (e as any).status === 'borrador').length ?? 0,
    surtido: entregas?.filter(e => (e as any).status === 'surtido').length ?? 0,
    asignado: entregas?.filter(e => ['asignado', 'cargado', 'en_ruta'].includes((e as any).status)).length ?? 0,
    hecho: entregas?.filter(e => (e as any).status === 'hecho').length ?? 0,
  };

  const filtered = useMemo(() => entregas ?? [], [entregas]);

  // Only borrador/surtido can be bulk-processed
  const selectableIds = useMemo(() =>
    new Set(filtered.filter((e: any) => e.status === 'borrador' || e.status === 'surtido').map((e: any) => e.id)),
    [filtered]
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === selectableIds.size && selectableIds.size > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectableIds));
    }
  };

  const selectedEntregas = filtered.filter((e: any) => selectedIds.has(e.id));

  // Bulk surtir + asignar
  const surtirAsignarMut = useMutation({
    mutationFn: async () => {
      if (selectedEntregas.length === 0) throw new Error('Selecciona al menos una entrega');
      if (!almacenId) throw new Error('Selecciona un almacén origen');

      const today = new Date().toISOString().slice(0, 10);

      for (const entrega of selectedEntregas) {
        const eid = (entrega as any).id;
        const estatus = (entrega as any).status;

        // If borrador → surtir (deduct stock, mark lines, set surtido)
        if (estatus === 'borrador') {
          // Get lines
          const { data: lineas } = await supabase
            .from('entrega_lineas')
            .select('id, producto_id, cantidad_pedida, hecho')
            .eq('entrega_id', eid);

          const pendientes = (lineas ?? []).filter((l: any) => !l.hecho);

          // Validate stock
          for (const l of pendientes) {
            const { data: prod } = await supabase.from('productos').select('cantidad, nombre').eq('id', l.producto_id).single();
            const stock = prod?.cantidad ?? 0;
            if (l.cantidad_pedida > stock) {
              throw new Error(`Stock insuficiente para "${prod?.nombre}". Disponible: ${stock}, Pedido: ${l.cantidad_pedida}`);
            }
          }

          // Process
          for (const l of pendientes) {
            const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
            const stock = prod?.cantidad ?? 0;

            await supabase.from('productos').update({
              cantidad: Math.max(0, stock - l.cantidad_pedida),
            } as any).eq('id', l.producto_id);

            await supabase.from('entrega_lineas').update({
              cantidad_entregada: l.cantidad_pedida,
              almacen_origen_id: almacenId,
              hecho: true,
            } as any).eq('id', l.id);

            await supabase.from('movimientos_inventario').insert({
              empresa_id: empresa!.id,
              tipo: 'salida',
              producto_id: l.producto_id,
              cantidad: l.cantidad_pedida,
              almacen_origen_id: almacenId,
              referencia_tipo: 'entrega',
              referencia_id: eid,
              user_id: user?.id,
              fecha: today,
              notas: 'Surtido rápido masivo',
            } as any);
          }

          // Update status
          if (vendedorRutaId) {
            await supabase.from('entregas').update({
              status: 'asignado',
              vendedor_ruta_id: vendedorRutaId,
              fecha_asignacion: new Date().toISOString(),
            } as any).eq('id', eid);
          } else {
            await supabase.from('entregas').update({ status: 'surtido' } as any).eq('id', eid);
          }
        }

        // If already surtido and vendedor selected → assign
        if (estatus === 'surtido' && vendedorRutaId) {
          await supabase.from('entregas').update({
            status: 'asignado',
            vendedor_ruta_id: vendedorRutaId,
            fecha_asignacion: new Date().toISOString(),
          } as any).eq('id', eid);
        }
      }
    },
    onSuccess: () => {
      const action = vendedorRutaId ? 'surtidas y asignadas' : 'surtidas';
      toast.success(`${selectedEntregas.length} entrega(s) ${action}`);
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      setSelectedIds(new Set());
      setShowSurtirDialog(false);
      setAlmacenId('');
      setVendedorRutaId('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <div className="p-4 space-y-4 min-h-full">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5" /> Entregas
        </h1>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-5 gap-3">
        {[
          { label: 'Total', value: counts.total },
          { label: 'Borrador', value: counts.borrador },
          { label: 'Surtido', value: counts.surtido },
          { label: 'Asignado', value: counts.asignado },
          { label: 'Hecho', value: counts.hecho },
        ].map(k => (
          <div key={k.label} className="bg-card border border-border rounded-lg p-4">
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{k.label}</p>
            <p className="text-2xl font-bold text-foreground">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Bulk action */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Buscar por folio..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Vendedor</label>
          <SearchableSelect
            options={[{ value: 'todos', label: 'Todos' }, ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }))]}
            value={vendedorFilter}
            onChange={setVendedorFilter}
            placeholder="Vendedor..."
          />
        </div>
        <div className="min-w-[150px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Status</label>
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'borrador', label: 'Borrador' },
              { value: 'surtido', label: 'Surtido' },
              { value: 'asignado', label: 'Asignado' },
              { value: 'cargado', label: 'Cargado' },
              { value: 'en_ruta', label: 'En ruta' },
              { value: 'hecho', label: 'Hecho' },
              { value: 'cancelado', label: 'Cancelado' },
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Status..."
          />
        </div>

        {selectedIds.size > 0 && (
          <Button
            onClick={() => setShowSurtirDialog(true)}
            className="gap-1.5"
          >
            <Zap className="h-4 w-4" />
            Surtir rápido ({selectedIds.size})
          </Button>
        )}
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10 text-center">
                <Checkbox
                  checked={selectableIds.size > 0 && selectedIds.size === selectableIds.size}
                  onCheckedChange={toggleAll}
                />
              </TableHead>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Pedido origen</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px] text-center">Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
            )}
            {!isLoading && (entregas ?? []).length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay entregas
                </TableCell>
              </TableRow>
            )}
            {(entregas ?? []).map((e: any) => {
              const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.borrador;
              const canSelect = selectableIds.has(e.id);
              return (
                <TableRow
                  key={e.id}
                  className={cn(
                    "cursor-pointer hover:bg-accent/50 transition-colors",
                    selectedIds.has(e.id) && "bg-primary/5"
                  )}
                >
                  <TableCell className="text-center py-2" onClick={e2 => e2.stopPropagation()}>
                    {canSelect && (
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={() => toggleSelect(e.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell
                    className="font-mono text-[11px] font-bold py-2"
                    onClick={() => navigate(`/logistica/entregas/${e.id}`)}
                  >{e.folio ?? '—'}</TableCell>
                  <TableCell
                    className="text-[12px] text-muted-foreground py-2"
                    onClick={() => navigate(`/logistica/entregas/${e.id}`)}
                  >{e.ventas?.folio ?? '—'}</TableCell>
                  <TableCell
                    className="text-[12px] font-medium py-2"
                    onClick={() => navigate(`/logistica/entregas/${e.id}`)}
                  >{e.clientes?.nombre ?? '—'}</TableCell>
                  <TableCell
                    className="text-[12px] text-muted-foreground py-2"
                    onClick={() => navigate(`/logistica/entregas/${e.id}`)}
                  >{e.vendedores?.nombre ?? '—'}</TableCell>
                  <TableCell
                    className="text-[12px] text-muted-foreground py-2"
                    onClick={() => navigate(`/logistica/entregas/${e.id}`)}
                  >{fmtDate(e.fecha)}</TableCell>
                  <TableCell
                    className="text-center py-2"
                    onClick={() => navigate(`/logistica/entregas/${e.id}`)}
                  >
                    <Badge variant={badge.variant} className="text-[10px]">{badge.label}</Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* ─── Dialog: Surtir rápido ─── */}
      <Dialog open={showSurtirDialog} onOpenChange={setShowSurtirDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Surtir rápido
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Se surtirán <span className="font-bold text-foreground">{selectedIds.size}</span> entrega(s),
              descontando stock del almacén seleccionado.
            </p>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                Almacén origen *
              </label>
              <ModalSelect
                options={almacenOptions}
                value={almacenId}
                onChange={setAlmacenId}
                placeholder="Seleccionar almacén..."
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                Asignar vendedor de ruta (opcional)
              </label>
              <ModalSelect
                options={vendedorOptions}
                value={vendedorRutaId}
                onChange={setVendedorRutaId}
                placeholder="Sin asignar..."
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                Si seleccionas un vendedor, las entregas pasarán a <strong>asignado</strong> directamente.
              </p>
            </div>

            {/* Summary */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
              {selectedEntregas.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-[12px]">
                  <span className="font-mono font-bold">{e.folio}</span>
                  <span className="text-muted-foreground">{e.clientes?.nombre ?? '—'}</span>
                  <Badge variant="secondary" className="text-[10px]">{e.status}</Badge>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSurtirDialog(false)}>
              Cancelar
            </Button>
            <Button
              onClick={() => surtirAsignarMut.mutate()}
              disabled={!almacenId || surtirAsignarMut.isPending}
            >
              {surtirAsignarMut.isPending ? 'Procesando...' : vendedorRutaId ? 'Surtir y asignar' : 'Surtir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
