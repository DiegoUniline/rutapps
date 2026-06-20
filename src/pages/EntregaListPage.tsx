import { useState, useMemo, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Truck, Search, Package, Zap, PackageCheck, ArrowRightLeft, Calendar, XCircle, ChevronDown } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import SearchableSelect from '@/components/SearchableSelect';
import ModalSelect from '@/components/ModalSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useEntregasList, useVendedoresList, useAsignarEntrega, useCargarEntrega, useAsignarYCargar } from '@/hooks/useEntregas';
import { fmtDate, cn , todayLocal } from '@/lib/utils';
import { toast } from 'sonner';
import { ClienteLink } from '@/components/links/EntityLinks';
import BulkEntregasActionsDialog, { type BulkAction } from '@/components/entregas/BulkEntregasActionsDialog';
import PedidosTabs from '@/components/PedidosTabs';

const STATUS_BADGE: Record<string, { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive'; className?: string }> = {
  borrador: { label: 'Borrador', variant: 'secondary' },
  surtido: { label: 'Surtido', variant: 'default' },
  asignado: { label: 'Asignado', variant: 'default' },
  cargado: { label: 'Cargado', variant: 'default' },
  en_ruta: { label: 'En ruta', variant: 'outline', className: 'bg-amber-500 text-white border-transparent hover:bg-amber-500/90' },
  hecho: { label: 'Entregado', variant: 'outline', className: 'bg-success text-success-foreground border-transparent hover:bg-success/90' },
  no_entregado: { label: 'No entregado', variant: 'destructive' },
  cancelado: { label: 'Cancelado', variant: 'destructive' },
};

export default function EntregaListPage() {
  const { empresa, user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [vendedorFilter, setVendedorFilter] = useState('todos');
  const [rutaFilter, setRutaFilter] = useState('todos');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSurtirDialog, setShowSurtirDialog] = useState(false);
  const [showAsignarDialog, setShowAsignarDialog] = useState(false);
  const [almacenId, setAlmacenId] = useState('');
  const [vendedorRutaId, setVendedorRutaId] = useState('');
  const [bulkAction, setBulkAction] = useState<BulkAction | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [cargarProgress, setCargarProgress] = useState<{ current: number; total: number; folio?: string; title?: string } | null>(null);

  // Always fetch ALL entregas (no status filter) so counts are correct
  const { data: allEntregas, isLoading } = useEntregasList(search, vendedorFilter);
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
    total: allEntregas?.length ?? 0,
    borrador: allEntregas?.filter(e => (e as any).status === 'borrador').length ?? 0,
    surtido: allEntregas?.filter(e => (e as any).status === 'surtido').length ?? 0,
    asignado: allEntregas?.filter(e => (e as any).status === 'asignado').length ?? 0,
    cargado: allEntregas?.filter(e => (e as any).status === 'cargado').length ?? 0,
    en_ruta: allEntregas?.filter(e => (e as any).status === 'en_ruta').length ?? 0,
    hecho: allEntregas?.filter(e => (e as any).status === 'hecho').length ?? 0,
    no_entregado: allEntregas?.filter(e => (e as any).status === 'no_entregado').length ?? 0,
  };

  // Filter locally by selected tab + extra filters
  const filtered = useMemo(() => {
    let list = allEntregas ?? [];
    if (statusFilter !== 'todos') list = list.filter((e: any) => e.status === statusFilter);
    if (rutaFilter !== 'todos') list = list.filter((e: any) => (e.vendedor_ruta_id ?? '') === (rutaFilter === 'sin_ruta' ? '' : rutaFilter));
    if (fechaDesde) list = list.filter((e: any) => (e.fecha ?? '').slice(0, 10) >= fechaDesde);
    if (fechaHasta) list = list.filter((e: any) => (e.fecha ?? '').slice(0, 10) <= fechaHasta);
    return list;
  }, [allEntregas, statusFilter, rutaFilter, fechaDesde, fechaHasta]);

  // borrador, surtido, asignado can be bulk-processed
  const selectableIds = useMemo(() =>
    new Set(filtered.filter((e: any) => !['hecho', 'cancelado'].includes(e.status)).map((e: any) => e.id)),
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

  // Determine what bulk actions are available based on selected statuses
  const selectedStatuses = useMemo(() => {
    const statuses = new Set<string>();
    selectedEntregas.forEach((e: any) => statuses.add(e.status));
    return statuses;
  }, [selectedEntregas]);

  const allSurtido = selectedStatuses.size > 0 && [...selectedStatuses].every(s => s === 'surtido');
  const allAsignado = selectedStatuses.size > 0 && [...selectedStatuses].every(s => s === 'asignado');
  const hasBorrador = selectedStatuses.has('borrador');

  // Bulk surtir + asignar
  const surtirAsignarMut = useMutation({
    mutationFn: async () => {
      if (selectedEntregas.length === 0) throw new Error('Selecciona al menos una entrega');
      if (!almacenId) throw new Error('Selecciona un almacén origen');

      const today = todayLocal();

      for (const entrega of selectedEntregas) {
        const eid = (entrega as any).id;
        const estatus = (entrega as any).status;

        // If borrador → surtir (deduct stock atomically via RPC, mark lines, set surtido)
        if (estatus === 'borrador') {
          const { data: lineas } = await supabase
            .from('entrega_lineas')
            .select('id, producto_id, cantidad_pedida, hecho')
            .eq('entrega_id', eid);

          const pendientes = (lineas ?? []).filter((l: any) => !l.hecho);

          // Use atomic RPC for each line — this correctly:
          //  • locks stock_almacen row (FOR UPDATE) preventing race conditions
          //  • deducts from stock_almacen (per-warehouse stock used by Ubicaciones view)
          //  • inserts movimiento in kardex
          //  • updates entrega_lineas (cantidad_entregada, almacen_origen_id, hecho)
          //  • validates stock against vender_sin_stock flag
          for (const l of pendientes) {
            const { error: rpcError } = await supabase.rpc('surtir_linea_entrega', {
              p_linea_id: l.id,
              p_producto_id: l.producto_id,
              p_almacen_origen_id: almacenId,
              p_cantidad_surtida: l.cantidad_pedida,
              p_entrega_id: eid,
              p_empresa_id: empresa!.id,
              p_user_id: user?.id,
            });
            if (rpcError) throw new Error(rpcError.message);
          }

          // Update status
          if (vendedorRutaId) {
            await supabase.from('entregas').update({
              status: 'asignado',
              almacen_id: almacenId,
              vendedor_ruta_id: vendedorRutaId,
              fecha_asignacion: new Date().toISOString(),
            } as any).eq('id', eid);
          } else {
            await supabase.from('entregas').update({ status: 'surtido', almacen_id: almacenId } as any).eq('id', eid);
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
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario'] });
      qc.invalidateQueries({ queryKey: ['kardex-ubicacion'] });
      setSelectedIds(new Set());
      setShowSurtirDialog(false);
      setAlmacenId('');
      setVendedorRutaId('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Helper: get vendedor's almacen_id from profiles
  const getVendedorAlmacen = async (vendId: string) => {
    const { data } = await supabase.from('profiles').select('almacen_id').eq('id', vendId).maybeSingle();
    return data?.almacen_id ?? null;
  };

  // Helper: upsert stock_almacen
  const upsertStockAlmacen = async (empresaId: string, almacenId: string, productoId: string, qty: number) => {
    const { data: existing } = await supabase.from('stock_almacen')
      .select('id, cantidad').eq('almacen_id', almacenId).eq('producto_id', productoId).maybeSingle();
    if (existing) {
      await supabase.from('stock_almacen').update({ cantidad: existing.cantidad + qty, updated_at: new Date().toISOString() } as any).eq('id', existing.id);
    } else {
      await supabase.from('stock_almacen').insert({ empresa_id: empresaId, almacen_id: almacenId, producto_id: productoId, cantidad: qty } as any);
    }
  };

  // Bulk asignar
  const bulkAsignarMut = useMutation({
    mutationFn: async ({ cargarTambien }: { cargarTambien: boolean }) => {
      if (!vendedorRutaId) throw new Error('Selecciona un repartidor');
      const today = todayLocal();
      const almDestinoId = await getVendedorAlmacen(vendedorRutaId);
      if (cargarTambien && !almDestinoId) throw new Error('El vendedor no tiene almacén asignado');

      for (const entrega of selectedEntregas) {
        const eid = (entrega as any).id;
        await supabase.from('entregas').update({
          status: 'asignado',
          vendedor_ruta_id: vendedorRutaId,
          fecha_asignacion: new Date().toISOString(),
        } as any).eq('id', eid);
        if (cargarTambien && almDestinoId) {
          // El trigger de BD (trg_apply_entrega_cargado_inventory) hace SALIDA del origen y ENTRADA al destino
          await supabase.from('entregas').update({ status: 'cargado', fecha_carga: new Date().toISOString() } as any).eq('id', eid);
        }
      }
    },
    onSuccess: (_, vars) => {
      toast.success(`${selectedEntregas.length} entrega(s) ${vars.cargarTambien ? 'asignadas y cargadas' : 'asignadas a ruta'}`);
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      setSelectedIds(new Set()); setShowAsignarDialog(false); setVendedorRutaId('');
    },
    onError: (err: any) => toast.error(err.message),
  });

  const bulkCargarMut = useMutation({
    mutationFn: async () => {
      let saltadas = 0;
      const errores: string[] = [];
      const total = selectedEntregas.length;
      setCargarProgress({ current: 0, total });
      for (let i = 0; i < selectedEntregas.length; i++) {
        const entrega = selectedEntregas[i];
        const eid = (entrega as any).id;
        const folio = (entrega as any).folio || eid.slice(0, 8);
        setCargarProgress({ current: i, total, folio });
        const vendId = (entrega as any).vendedor_ruta_id || (entrega as any).vendedor_id;
        const pedidoId = (entrega as any).pedido_id;
        let almOrigen = (entrega as any).almacen_id as string | null;

        if (!vendId) { errores.push(`${folio}: sin vendedor de ruta asignado`); continue; }

        // Idempotencia: re-leer status
        const { data: fresh } = await supabase.from('entregas').select('status, almacen_id').eq('id', eid).maybeSingle();
        if (!fresh) { errores.push(`${folio}: no encontrada`); continue; }
        if (['cargado', 'entregado', 'hecho'].includes(fresh.status as string)) { saltadas++; continue; }
        almOrigen = almOrigen || (fresh as any).almacen_id;

        // Verificar perfil de vendedor con almacén
        const { data: prof } = await supabase.from('profiles').select('almacen_id').eq('id', vendId).maybeSingle();
        if (!prof?.almacen_id) { errores.push(`${folio}: el vendedor de ruta no tiene almacén asignado en su perfil`); continue; }

        // Asegurar que existen líneas surtidas. Si no, intentar seedearlas desde el pedido.
        const { data: lineas } = await supabase
          .from('entrega_lineas')
          .select('id, hecho, cantidad_pedida, cantidad_entregada, almacen_origen_id, producto_id')
          .eq('entrega_id', eid);

        const lineasHechas = (lineas ?? []).filter((l: any) => l.hecho && Number(l.cantidad_entregada) > 0);

        if (lineasHechas.length === 0) {
          if (!pedidoId) { errores.push(`${folio}: sin líneas surtidas y sin pedido para regenerar`); continue; }
          if (!almOrigen) { errores.push(`${folio}: falta almacén origen. Surte la entrega manualmente antes de cargar.`); continue; }

          let toSurtir: { id: string; producto_id: string; cantidad_pedida: number }[] = [];

          if (!lineas || lineas.length === 0) {
            const { data: vLineas, error: vErr } = await supabase
              .from('venta_lineas')
              .select('producto_id, cantidad, unidad_id')
              .eq('venta_id', pedidoId);
            if (vErr) { errores.push(`${folio}: ${vErr.message}`); continue; }
            if (!vLineas || vLineas.length === 0) { errores.push(`${folio}: el pedido no tiene productos`); continue; }

            const { data: insertadas, error: insErr } = await supabase
              .from('entrega_lineas')
              .insert(vLineas.map((l: any) => ({
                entrega_id: eid,
                producto_id: l.producto_id,
                unidad_id: l.unidad_id ?? null,
                cantidad_pedida: Number(l.cantidad) || 0,
                cantidad_entregada: 0,
                hecho: false,
              })) as any)
              .select('id, producto_id, cantidad_pedida');
            if (insErr) { errores.push(`${folio}: no se pudieron crear líneas (${insErr.message})`); continue; }
            toSurtir = (insertadas ?? []).map((l: any) => ({ id: l.id, producto_id: l.producto_id, cantidad_pedida: Number(l.cantidad_pedida) || 0 }));
          } else {
            toSurtir = lineas
              .filter((l: any) => !l.hecho || Number(l.cantidad_entregada) <= 0)
              .map((l: any) => ({ id: l.id, producto_id: l.producto_id, cantidad_pedida: Number(l.cantidad_pedida) || 0 }));
          }

          let surtirError: string | null = null;
          for (const l of toSurtir) {
            if (l.cantidad_pedida <= 0) continue;
            const { error: rpcErr } = await supabase.rpc('surtir_linea_entrega', {
              p_linea_id: l.id,
              p_producto_id: l.producto_id,
              p_almacen_origen_id: almOrigen,
              p_cantidad_surtida: l.cantidad_pedida,
              p_entrega_id: eid,
              p_empresa_id: empresa!.id,
              p_user_id: user?.id,
            });
            if (rpcErr) { surtirError = rpcErr.message; break; }
          }
          if (surtirError) { errores.push(`${folio}: ${surtirError}`); continue; }
        }

        // El trigger de BD aplica entrada al almacén destino del vendedor
        const { error: updErr } = await supabase
          .from('entregas')
          .update({ status: 'cargado', fecha_carga: new Date().toISOString() } as any)
          .eq('id', eid);
        if (updErr) { errores.push(`${folio}: ${updErr.message}`); continue; }
      }
      return { saltadas, errores };
    },
    onSuccess: ({ saltadas, errores }) => {
      const ok = selectedEntregas.length - saltadas - errores.length;
      if (ok > 0) {
        toast.success(`${ok} entrega(s) cargadas${saltadas ? ` · ${saltadas} ya estaban cargadas` : ''}`);
      } else if (saltadas > 0 && errores.length === 0) {
        toast.info(`${saltadas} entrega(s) ya estaban cargadas`);
      }
      if (errores.length > 0) {
        toast.error(`No se pudieron cargar ${errores.length}: ${errores.slice(0, 3).join(' · ')}${errores.length > 3 ? '…' : ''}`, { duration: 9000 });
      }
      qc.invalidateQueries({ queryKey: ['entregas-list'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      setSelectedIds(new Set());
    },
    onError: (err: any) => toast.error(err.message),
    onSettled: () => setCargarProgress(null),
  });

  // Bloquear recargar/cerrar mientras se cargan entregas
  useEffect(() => {
    if (!cargarProgress) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [cargarProgress]);

  const handleBulkCargar = () => {
    if (bulkCargarMut.isPending) return;
    bulkCargarMut.mutate();
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      {cargarProgress && (
        <div className="fixed inset-0 z-[80] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-primary animate-pulse" />
              <h3 className="text-[14px] font-semibold text-foreground">Cargando camión…</h3>
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[12px]">
                <span className="text-muted-foreground">
                  {Math.min(cargarProgress.current + 1, cargarProgress.total)} de {cargarProgress.total}
                  {cargarProgress.folio ? ` · ${cargarProgress.folio}` : ''}
                </span>
                <span className="font-semibold text-foreground">
                  {Math.round((cargarProgress.current / Math.max(cargarProgress.total, 1)) * 100)}%
                </span>
              </div>
              <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${(cargarProgress.current / Math.max(cargarProgress.total, 1)) * 100}%` }}
                />
              </div>
            </div>
            <p className="text-[11px] text-destructive font-medium leading-snug">
              ⚠️ No recargues ni salgas de esta pantalla hasta que termine.
            </p>
          </div>
        </div>
      )}
      <PedidosTabs />
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Truck className="h-5 w-5" /> Entregas
        </h1>
      </div>

      {/* Status Tabs */}
      <div className="flex border-b border-border gap-0 overflow-x-auto">
        {[
          { key: 'todos', label: 'Todos', count: counts.total },
          { key: 'borrador', label: 'Borrador', count: counts.borrador },
          { key: 'surtido', label: 'Surtidos', count: counts.surtido },
          { key: 'asignado', label: 'Asignados', count: counts.asignado },
          { key: 'cargado', label: 'Cargados', count: counts.cargado },
          { key: 'en_ruta', label: 'En ruta', count: counts.en_ruta },
          { key: 'hecho', label: 'Entregadas', count: counts.hecho },
          { key: 'no_entregado', label: 'No entregadas', count: counts.no_entregado },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors",
              statusFilter === tab.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
            )}
          >
            {tab.label}
            <span className="ml-1.5 text-xs text-muted-foreground">({tab.count})</span>
          </button>
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
        <div className="min-w-[180px]">
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Ruta asignada</label>
          <SearchableSelect
            options={[
              { value: 'todos', label: 'Todas' },
              { value: 'sin_ruta', label: 'Sin ruta asignada' },
              ...(vendedores ?? []).map(v => ({ value: v.id, label: v.nombre })),
            ]}
            value={rutaFilter}
            onChange={setRutaFilter}
            placeholder="Ruta..."
          />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Fecha desde</label>
          <Input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} className="w-[160px]" />
        </div>
        <div>
          <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1">Fecha hasta</label>
          <Input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} className="w-[160px]" />
        </div>
        {(rutaFilter !== 'todos' || fechaDesde || fechaHasta || vendedorFilter !== 'todos') && (
          <Button variant="ghost" size="sm" onClick={() => { setRutaFilter('todos'); setFechaDesde(''); setFechaHasta(''); setVendedorFilter('todos'); }}>
            Limpiar
          </Button>
        )}

        {/* Surtir rápido — only when borrador selected */}
        {selectedIds.size > 0 && hasBorrador && (
          <Button onClick={() => setShowSurtirDialog(true)} className="gap-1.5">
            <Zap className="h-4 w-4" />
            Surtir rápido ({selectedIds.size})
          </Button>
        )}

        {/* Asignar ruta — only when all selected are surtido */}
        {selectedIds.size > 0 && allSurtido && (
          <>
            <Button onClick={() => { setVendedorRutaId(''); setShowAsignarDialog(true); }} variant="outline" className="gap-1.5">
              <Package className="h-4 w-4" />
              Asignar ruta ({selectedIds.size})
            </Button>
            <Button onClick={() => { setVendedorRutaId(''); setShowAsignarDialog(true); }} className="gap-1.5">
              <Zap className="h-4 w-4" />
              Asignar y cargar ({selectedIds.size})
            </Button>
          </>
        )}

        {/* Cargar camión — only when all selected are asignado */}
        {selectedIds.size > 0 && allAsignado && (
          <Button onClick={handleBulkCargar} className="gap-1.5" disabled={bulkCargarMut.isPending}>
            <Truck className="h-4 w-4" />
            Cargar camión ({selectedIds.size})
          </Button>
        )}

        {/* Acciones masivas universales (con preview e inventario automático) */}
        {selectedIds.size > 0 && (
          <>
            <Button onClick={() => setBulkAction('reasignar')} variant="outline" className="gap-1.5">
              <ArrowRightLeft className="h-4 w-4" /> Reasignar ({selectedIds.size})
            </Button>
            <Button onClick={() => setBulkAction('reprogramar')} variant="outline" className="gap-1.5">
              <Calendar className="h-4 w-4" /> Reprogramar ({selectedIds.size})
            </Button>
            <Button onClick={() => setBulkAction('cancelar')} variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
              <XCircle className="h-4 w-4" /> Cancelar ({selectedIds.size})
            </Button>
          </>
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
              <TableHead className="text-[11px]">Almacén origen</TableHead>
              <TableHead className="text-[11px]">Almacén destino</TableHead>
              <TableHead className="text-[11px]">Ruta asignada</TableHead>
              <TableHead className="text-[11px]">Fecha pedido</TableHead>
              <TableHead className="text-[11px]">Fecha programada</TableHead>
              <TableHead className="text-[11px]">Fecha real</TableHead>
              <TableHead className="text-[11px] text-center">Status</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow><TableCell colSpan={13} className="text-center text-muted-foreground py-8">Cargando...</TableCell></TableRow>
            )}
            {!isLoading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={13} className="text-center text-muted-foreground py-12">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  No hay entregas
                </TableCell>
              </TableRow>
            )}
            {filtered.map((e: any) => {
              const badge = STATUS_BADGE[e.status] ?? STATUS_BADGE.borrador;
              const canSelect = selectableIds.has(e.id);

              // Derive unique origin warehouses from lines (real source of stock)
              const lineOrigins = new Map<string, string>();
              for (const l of (e.entrega_lineas ?? [])) {
                const id = l?.almacen_origen_id;
                const nombre = l?.almacenes?.nombre;
                if (id && nombre) lineOrigins.set(id, nombre);
              }
              const originNames = Array.from(lineOrigins.values());
              const headerOriginName = e.almacenes?.nombre as string | undefined;

              let originLabel: string;
              let originTitle: string | undefined;
              if (originNames.length === 0) {
                originLabel = headerOriginName ?? '—';
              } else if (originNames.length === 1) {
                originLabel = originNames[0];
              } else {
                originLabel = `${originNames[0]} +${originNames.length - 1}`;
                originTitle = originNames.join(', ');
              }

              // Destino = almacén-ruta del vendedor asignado (vendedor_ruta_id) o, si no hay, del vendedor original
              const destinoNombre =
                e.vendedor_ruta?.almacen_destino?.nombre ??
                e.vendedores?.almacen_destino?.nombre ??
                null;

              const isExpanded = expandedId === e.id;
              const lineas = e.entrega_lineas ?? [];

              return (
                <Fragment key={e.id}>
                <TableRow
                  key={e.id}
                  className={cn(
                    "cursor-pointer hover:bg-accent/50 transition-colors",
                    (selectedIds.has(e.id) || isExpanded) && "bg-primary/5"
                  )}
                  onClick={() => setExpandedId(isExpanded ? null : e.id)}
                >
                  <TableCell className="text-center py-2" onClick={e2 => e2.stopPropagation()}>
                    {canSelect && (
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={() => toggleSelect(e.id)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] font-bold py-2">{e.folio ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{e.ventas?.folio ?? '—'}</TableCell>
                  <TableCell className="text-[12px] font-medium py-2" onClick={e2 => e2.stopPropagation()}>
                    <ClienteLink id={e.cliente_id ?? e.clientes?.id}>{e.clientes?.nombre ?? '—'}</ClienteLink>
                  </TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{e.vendedores?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2" title={originTitle}>{originLabel}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{destinoNombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{e.vendedor_ruta?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{e.ventas?.fecha ? fmtDate(e.ventas.fecha) : '—'}</TableCell>
                  <TableCell className="text-[12px] text-muted-foreground py-2">{fmtDate(e.fecha)}</TableCell>
                  <TableCell className="text-[12px] py-2">{e.fecha_entrega ? <span className="text-success font-medium">{fmtDate(e.fecha_entrega)}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-center py-2">
                    <Badge variant={badge.variant} className={`text-[10px] ${badge.className ?? ''}`}>{badge.label}</Badge>
                  </TableCell>
                  <TableCell className="text-center py-2 w-8">
                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform inline-block", isExpanded && "rotate-180")} />
                  </TableCell>
                </TableRow>
                {isExpanded && (
                  <TableRow key={`exp-${e.id}`} className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={13} className="p-0">
                      <div className="px-6 py-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h3 className="text-[12px] font-semibold text-foreground flex items-center gap-1.5">
                            <Package className="h-3.5 w-3.5" />
                            Productos ({lineas.length})
                          </h3>
                          <Button size="sm" variant="outline" onClick={(ev) => { ev.stopPropagation(); navigate(`/logistica/entregas/${e.id}`); }}>
                            Abrir entrega
                          </Button>
                        </div>
                        {lineas.length === 0 ? (
                          <p className="text-[12px] text-muted-foreground py-2">Sin productos</p>
                        ) : (
                          <div className="bg-card border border-border rounded-lg overflow-hidden">
                            <table className="w-full text-[12px]">
                              <thead>
                                <tr className="border-b border-border bg-muted/40 text-left">
                                  <th className="py-1.5 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Código</th>
                                  <th className="py-1.5 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Producto</th>
                                  <th className="py-1.5 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Almacén origen</th>
                                  <th className="py-1.5 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Pedido</th>
                                  <th className="py-1.5 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right">Entregado</th>
                                  <th className="py-1.5 px-3 text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-center">Hecho</th>
                                </tr>
                              </thead>
                              <tbody>
                                {lineas.map((l: any) => (
                                  <tr key={l.id} className="border-b border-border last:border-b-0">
                                    <td className="py-1.5 px-3 font-mono text-muted-foreground">{l.productos?.codigo ?? '—'}</td>
                                    <td className="py-1.5 px-3 text-foreground">{l.productos?.nombre ?? '—'}</td>
                                    <td className="py-1.5 px-3 text-muted-foreground">{l.almacenes?.nombre ?? '—'}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums">{l.cantidad_pedida ?? 0}</td>
                                    <td className="py-1.5 px-3 text-right tabular-nums font-medium">{l.cantidad_entregada ?? 0}</td>
                                    <td className="py-1.5 px-3 text-center">
                                      {l.hecho ? (
                                        <Badge variant="outline" className="text-[10px] bg-success/10 text-success border-success/30">Sí</Badge>
                                      ) : (
                                        <Badge variant="outline" className="text-[10px]">No</Badge>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                </Fragment>
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
            <div className="bg-card rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
              {selectedEntregas.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-[12px]">
                  <span className="font-mono font-bold">{e.folio}</span>
                  <ClienteLink id={e.cliente_id ?? e.clientes?.id} className="text-muted-foreground">{e.clientes?.nombre ?? "—"}</ClienteLink>
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

      {/* ─── Dialog: Asignar ruta ─── */}
      <Dialog open={showAsignarDialog} onOpenChange={setShowAsignarDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 text-primary" />
              Asignar ruta
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Selecciona el repartidor para <span className="font-bold text-foreground">{selectedIds.size}</span> entrega(s).
            </p>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide block mb-1.5">
                Vendedor de ruta *
              </label>
              <ModalSelect
                options={vendedorOptions}
                value={vendedorRutaId}
                onChange={setVendedorRutaId}
                placeholder="Seleccionar repartidor..."
              />
            </div>
            <div className="bg-card rounded-lg p-3 space-y-1 max-h-32 overflow-y-auto">
              {selectedEntregas.map((e: any) => (
                <div key={e.id} className="flex items-center justify-between text-[12px]">
                  <span className="font-mono font-bold">{e.folio}</span>
                  <ClienteLink id={e.cliente_id ?? e.clientes?.id} className="text-muted-foreground">{e.clientes?.nombre ?? "—"}</ClienteLink>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2 pt-4 border-t">
            <Button variant="ghost" onClick={() => setShowAsignarDialog(false)} disabled={bulkAsignarMut.isPending} className="text-destructive mr-auto">
              Cancelar
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkAsignarMut.mutate({ cargarTambien: false })}
              disabled={!vendedorRutaId || bulkAsignarMut.isPending}
              className="gap-1.5"
            >
              <Package className="h-3.5 w-3.5" />
              Asignar
            </Button>
            <Button
              size="sm"
              onClick={() => bulkAsignarMut.mutate({ cargarTambien: true })}
              disabled={!vendedorRutaId || bulkAsignarMut.isPending}
              className="gap-1.5"
            >
              <Zap className="h-3.5 w-3.5" />
              Asignar y cargar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {bulkAction && (
        <BulkEntregasActionsDialog
          action={bulkAction}
          entregaIds={Array.from(selectedIds)}
          onClose={() => setBulkAction(null)}
          onDone={() => { setBulkAction(null); setSelectedIds(new Set()); }}
        />
      )}
    </div>
  );
}
