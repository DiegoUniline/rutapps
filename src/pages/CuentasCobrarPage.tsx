import { pagadoRealVenta } from '@/lib/ventaCerrada';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { CreditCard, Banknote, Plus, Upload, Trash2 } from 'lucide-react';
import { VentaCobroQuickModal } from '@/components/venta/VentaCobroQuickModal';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { cn, fmtDate } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { toast } from 'sonner';
import { ClienteLink } from '@/components/links/EntityLinks';
import SaldoInicialModal from '@/components/SaldoInicialModal';
import SaldoInicialImportDialog from '@/components/SaldoInicialImportDialog';
import { CobranzaTabs } from '@/components/CobranzaTabs';
import { OdooFilterBar, FilterOption } from '@/components/OdooFilterBar';
import { useListPreferences } from '@/hooks/useListPreferences';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useRealtimeInvalidate } from '@/hooks/useRealtimeInvalidate';
import { usePinAuth } from '@/hooks/usePinAuth';

function useCuentasCobrar() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cuentas-cobrar', empresa?.id],
    enabled: !!empresa?.id,
    networkMode: 'always',
    queryFn: async () => {
      const readCache = async () => {
        try {
          const { offlineDb } = await import('@/lib/offlineDb');
          const ventas = await offlineDb.ventas
            .where('empresa_id').equals(empresa!.id).toArray();
          return (ventas as any[])
            .filter(v => (v.saldo_pendiente ?? 0) > 0 && v.status !== 'cancelado')
            .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? ''));
        } catch { return [] as any[]; }
      };

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return await readCache();
      }

      try {
        const { data, error } = await supabase
          .from('ventas')
          .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status, es_saldo_inicial, concepto, cliente_id, vendedor_id, clientes(id, nombre, codigo), vendedores:profiles!vendedor_id(nombre), cobro_aplicaciones(monto_aplicado, cobros!inner(status))')
          .eq('empresa_id', empresa!.id)
          .gt('saldo_pendiente', 0)
          .neq('status', 'cancelado')
          .order('fecha', { ascending: true });
        if (error) throw error;
        return data ?? [];
      } catch (err) {
        const cached = await readCache();
        if (cached.length > 0) return cached;
        throw err;
      }
    },
  });
}

function antiguedadBucket(fecha: string): { value: string; label: string } {
  const dias = Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000);
  if (dias <= 15) return { value: 'corriente', label: 'Corriente' };
  if (dias <= 30) return { value: 'd30', label: '16-30 días' };
  if (dias <= 60) return { value: 'd60', label: '31-60 días' };
  if (dias <= 90) return { value: 'd90', label: '61-90 días' };
  return { value: 'masD90', label: '+90 días' };
}

export default function CuentasCobrarPage() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { requestPin, PinDialog } = usePinAuth();
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { filters, toggleFilterValue, setFilter, clearFilters } = useListPreferences('cuentas-cobrar');
  const { data: cuentas, isLoading } = useCuentasCobrar();
  useRealtimeInvalidate({ table: 'ventas', empresaId: empresa?.id, queryKeys: [['cuentas-cobrar']] });
  useRealtimeInvalidate({ table: 'cobros', empresaId: empresa?.id, queryKeys: [['cuentas-cobrar'], ['saldos-iniciales']] });
  const [showModal, setShowModal] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [cobrarVenta, setCobrarVenta] = useState<any | null>(null);

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('ventas').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Saldo inicial eliminado');
      qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
      qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
      setDeleteId(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const filterOptions: FilterOption[] = useMemo(() => {
    const clientesMap = new Map<string, string>();
    const vendedoresMap = new Map<string, string>();
    const condicionesSet = new Set<string>();
    (cuentas ?? []).forEach(v => {
      const cId = (v as any).cliente_id ?? (v.clientes as any)?.id;
      const cNombre = (v.clientes as any)?.nombre;
      if (cId && cNombre) clientesMap.set(cId, cNombre);
      const vId = (v as any).vendedor_id;
      const vNombre = (v.vendedores as any)?.nombre;
      if (vId && vNombre) vendedoresMap.set(vId, vNombre);
      if (v.condicion_pago) condicionesSet.add(v.condicion_pago);
    });
    return [
      {
        key: 'cliente',
        label: 'Cliente',
        options: Array.from(clientesMap.entries())
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        key: 'vendedor',
        label: 'Vendedor',
        options: Array.from(vendedoresMap.entries())
          .map(([value, label]) => ({ value, label }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      },
      {
        key: 'condicion_pago',
        label: 'Condición',
        options: Array.from(condicionesSet).map(v => ({ value: v, label: v })),
      },
      {
        key: 'antiguedad',
        label: 'Antigüedad',
        options: [
          { value: 'corriente', label: 'Corriente' },
          { value: 'd30', label: '16-30 días' },
          { value: 'd60', label: '31-60 días' },
          { value: 'd90', label: '61-90 días' },
          { value: 'masD90', label: '+90 días' },
        ],
      },
      {
        key: 'tipo',
        label: 'Tipo',
        options: [
          { value: 'saldo_inicial', label: 'Saldo inicial' },
          { value: 'venta', label: 'Venta' },
        ],
      },
    ];
  }, [cuentas]);

  const filtered = useMemo(() => {
    let list = cuentas ?? [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(v =>
        (v.folio ?? '').toLowerCase().includes(s) ||
        ((v.clientes as any)?.nombre ?? '').toLowerCase().includes(s)
      );
    }
    const clienteF = filters['cliente'] ?? [];
    if (clienteF.length) list = list.filter(v => clienteF.includes(((v as any).cliente_id ?? (v.clientes as any)?.id) ?? ''));
    const vendedorF = filters['vendedor'] ?? [];
    if (vendedorF.length) list = list.filter(v => vendedorF.includes((v as any).vendedor_id ?? ''));
    const condF = filters['condicion_pago'] ?? [];
    if (condF.length) list = list.filter(v => condF.includes(v.condicion_pago ?? ''));
    const antigF = filters['antiguedad'] ?? [];
    if (antigF.length) list = list.filter(v => antigF.includes(antiguedadBucket(v.fecha).value));
    const tipoF = filters['tipo'] ?? [];
    if (tipoF.length) list = list.filter(v => {
      const tipo = v.es_saldo_inicial ? 'saldo_inicial' : 'venta';
      return tipoF.includes(tipo);
    });
    if (desde) list = list.filter(v => v.fecha >= desde);
    if (hasta) list = list.filter(v => v.fecha <= hasta);
    return list;
  }, [cuentas, search, filters, desde, hasta]);

  const totalPendiente = filtered.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
  const totalVentas = filtered.reduce((s, v) => s + (v.total ?? 0), 0);

  const today = new Date();
  const aging = { corriente: 0, d30: 0, d60: 0, d90: 0, masD90: 0 };
  filtered.forEach(v => {
    const dias = Math.floor((today.getTime() - new Date(v.fecha).getTime()) / 86400000);
    const saldo = v.saldo_pendiente ?? 0;
    if (dias <= 15) aging.corriente += saldo;
    else if (dias <= 30) aging.d30 += saldo;
    else if (dias <= 60) aging.d60 += saldo;
    else if (dias <= 90) aging.d90 += saldo;
    else aging.masD90 += saldo;
  });

  return (
    <div className="p-4 space-y-4 min-h-full">
      <CobranzaTabs />
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <CreditCard className="h-5 w-5" /> Cuentas por cobrar
          <HelpButton title={HELP.cuentasCobrar.title} sections={HELP.cuentasCobrar.sections} />
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowImport(true)} className="gap-1.5">
            <Upload className="h-3.5 w-3.5" /> Importar saldos
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowModal(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" /> Saldo inicial
          </Button>
          <Button onClick={() => navigate('/finanzas/aplicar-pagos')} className="gap-2" size="sm">
            <Banknote className="h-4 w-4" /> Aplicar pagos
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total pendiente</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendiente)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Documentos</p>
          <p className="text-2xl font-bold text-foreground">{filtered.length}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Venta total</p>
          <p className="text-2xl font-bold text-foreground">{fmt(totalVentas)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">% Cobrado</p>
          <p className="text-2xl font-bold text-success">{totalVentas > 0 ? Math.round(((totalVentas - totalPendiente) / totalVentas) * 100) : 0}%</p>
        </div>
      </div>

      {/* Aging */}
      <div className="bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold mb-3">Antigüedad de saldos</h3>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-center">
          {[
            { label: 'Corriente', val: aging.corriente, color: 'text-success' },
            { label: '16-30 días', val: aging.d30, color: 'text-warning' },
            { label: '31-60 días', val: aging.d60, color: 'text-orange-500' },
            { label: '61-90 días', val: aging.d90, color: 'text-destructive' },
            { label: '+90 días', val: aging.masD90, color: 'text-destructive font-bold' },
          ].map(a => (
            <div key={a.label} className="min-w-0">
              <p className="text-[10px] text-muted-foreground truncate">{a.label}</p>
              <p className={cn("text-xs sm:text-sm font-bold truncate", a.color)}>{fmt(a.val)}</p>
            </div>
          ))}
        </div>
      </div>

      <OdooFilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar por folio o cliente..."
        filterOptions={filterOptions}
        activeFilters={filters}
        onToggleFilter={toggleFilterValue}
        onSetFilter={setFilter}
        dateFrom={desde}
        dateTo={hasta}
        onDateFromChange={setDesde}
        onDateToChange={setHasta}
        onClearFilters={() => { clearFilters(); setDesde(''); setHasta(''); }}
      />

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Folio</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Vendedor</TableHead>
              <TableHead className="text-[11px]">Fecha</TableHead>
              <TableHead className="text-[11px]">Condición</TableHead>
              <TableHead className="text-[11px] text-right">Total</TableHead>
              <TableHead className="text-[11px] text-right">Pagado</TableHead>
              <TableHead className="text-[11px] text-right">Pendiente</TableHead>
              <TableHead className="text-[11px] w-32 text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(v => {
              const pagado = pagadoRealVenta(v);
              const esSaldo = v.es_saldo_inicial === true;
              const canDelete = esSaldo && (v.saldo_pendiente ?? 0) === (v.total ?? 0);
              return (
                <TableRow key={v.id}>
                  <TableCell className="font-mono text-[11px]">
                    {v.folio ?? v.id.slice(0, 8)}
                    {esSaldo && (
                      <Badge variant="secondary" className="ml-1.5 text-[9px] px-1 py-0">Saldo Inicial</Badge>
                    )}
                  </TableCell>
                  <TableCell className="font-medium text-[12px]"><ClienteLink id={(v as any).cliente_id ?? (v.clientes as any)?.id}>{(v.clientes as any)?.nombre ?? '—'}</ClienteLink></TableCell>
                  <TableCell className="text-[12px] text-muted-foreground">{(v.vendedores as any)?.nombre ?? '—'}</TableCell>
                  <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-[10px]">
                      {esSaldo ? (v.concepto || 'Saldo anterior') : v.condicion_pago}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-[12px]">{fmt(v.total ?? 0)}</TableCell>
                  <TableCell className="text-right text-[12px] text-success">{fmt(pagado)}</TableCell>
                  <TableCell className="text-right font-bold text-destructive">{fmt(v.saldo_pendiente ?? 0)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1 justify-end">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 gap-1 text-[11px] border-success/40 text-success hover:bg-success/10 hover:text-success"
                        onClick={(e) => { e.stopPropagation(); setCobrarVenta(v); }}
                      >
                        <Banknote className="h-3.5 w-3.5" /> Cobrar
                      </Button>
                      {canDelete && (
                        <button
                          onClick={() => setDeleteId(v.id)}
                          className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                          title="Eliminar saldo inicial"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {isLoading && <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">Sin cuentas pendientes 🎉</TableCell></TableRow>
            )}
          </TableBody>
          {!!filtered.length && (() => {
            const sumTotal = filtered.reduce((s, v) => s + (v.total ?? 0), 0);
            const sumPagado = filtered.reduce((s, v) => s + pagadoRealVenta(v), 0);
            const sumPend = filtered.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
            return (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={5} className="text-[11px] text-muted-foreground font-semibold">Totales ({filtered.length})</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmt(sumTotal)}</TableCell>
                  <TableCell className="text-right font-bold text-success tabular-nums">{fmt(sumPagado)}</TableCell>
                  <TableCell className="text-right font-bold text-destructive tabular-nums">{fmt(sumPend)}</TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            );
          })()}
        </Table>
      </div>

      <SaldoInicialModal open={showModal} onOpenChange={setShowModal} />
      <SaldoInicialImportDialog open={showImport} onOpenChange={setShowImport} />

      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar saldo inicial?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Solo se puede eliminar si no tiene abonos aplicados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = deleteId;
                if (!id) return;
                setDeleteId(null);
                requestPin(
                  'Eliminar saldo inicial',
                  'Ingresa el PIN de administrador para confirmar.',
                  () => deleteMut.mutate(id),
                );
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PinDialog />
      {cobrarVenta && (
        <VentaCobroQuickModal
          open={!!cobrarVenta}
          onClose={() => setCobrarVenta(null)}
          venta={{
            id: cobrarVenta.id,
            folio: cobrarVenta.folio,
            cliente_id: cobrarVenta.cliente_id ?? (cobrarVenta.clientes as any)?.id,
            saldo_pendiente: cobrarVenta.saldo_pendiente,
            total: cobrarVenta.total,
            status: cobrarVenta.status,
          }}
          fmt={fmt}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ['cuentas-cobrar'] });
            qc.invalidateQueries({ queryKey: ['saldos-iniciales'] });
          }}
        />
      )}
    </div>
  );
}
