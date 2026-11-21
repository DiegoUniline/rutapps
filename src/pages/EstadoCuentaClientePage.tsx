import { pagadoRealVenta, saldoRealVenta, totalEfectivoVenta } from '@/lib/ventaCerrada';
import { useSortableTable, useSortState, ordenarFilas, SortableTableHead } from '@/hooks/useSortableTable';
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { Users, ChevronRight, CreditCard, FileText, Banknote, Download, ArrowLeft, Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import { CobranzaTabs } from '@/components/CobranzaTabs';
import { OdooFilterBar, FilterOption } from '@/components/OdooFilterBar';
import { useListPreferences } from '@/hooks/useListPreferences';
import AplicarPagoClienteDialog from '@/components/finanzas/AplicarPagoClienteDialog';

/* ── hooks ── */
type RpcSinTipos<T> = (fn: string, args: Record<string, unknown>) => Promise<{ data: T | null; error: { message: string } | null }>;

function useClientesSaldo(desde: string, hasta: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-saldo-resumen', empresa?.id, desde, hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      // La BD agrega por cliente (vendido, saldo pendiente, saldo a favor): sin tope de 1 000 renglones
      // y sin sumar dinero en el navegador. Un borrador no participa en vendido ni saldos.
      type Fila = {
        cliente_id: string; nombre: string; codigo: string | null; telefono: string | null; credito: boolean;
        dias_credito: number; limite_credito: number; rfc: string | null; direccion: string | null;
        total_vendido: number; saldo_pendiente: number; docs: number; saldo_favor: number;
      };
      const { data, error } = await (supabase.rpc.bind(supabase) as unknown as RpcSinTipos<Fila[]>)(
        'resumen_saldos_clientes', { p_desde: desde || null, p_hasta: hasta || null });
      if (error) throw error;
      return (data ?? []).map(r => {
        const saldoPendiente = Number(r.saldo_pendiente) || 0;
        const saldoFavor = Number(r.saldo_favor) || 0;
        return {
          id: r.cliente_id, nombre: r.nombre ?? 'Cliente', codigo: r.codigo, telefono: r.telefono,
          credito: !!r.credito, dias_credito: Number(r.dias_credito) || 0, limite_credito: Number(r.limite_credito) || 0,
          rfc: r.rfc, direccion: r.direccion,
          totalVendido: Number(r.total_vendido) || 0, saldoPendiente, saldoFavor,
          saldoNeto: Math.round((saldoPendiente - saldoFavor) * 100) / 100, docs: Number(r.docs) || 0,
        };
      }).sort((a, b) => b.saldoNeto - a.saldoNeto);
    },
  });
}

interface ExcedenteRow {
  id: string;
  tipo: 'saldo_favor' | 'reembolso';
  origen: 'correccion' | 'cancelacion' | 'previo';
  monto: number;
  created_at: string;
  turno_id: string | null;
  ventas: { folio: string | null } | null;
}
interface NotaCreditoRow {
  id: string;
  fecha: string;
  created_at: string | null;
  cancelado_at: string | null;
  turno_id: string | null;
  ventas: { folio: string | null } | null;
  devolucion_lineas: { monto_credito: number | null; accion: string | null; aplica_venta: boolean | null }[] | null;
}
const ORIGEN_EXCEDENTE: Record<ExcedenteRow['origen'], string> = {
  cancelacion: 'Venta cancelada',
  correccion: 'Corrección de venta',
  previo: 'Registro anterior',
};

function useClienteDetalle(clienteId: string | null) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cliente-estado-cuenta', empresa?.id, clienteId],
    enabled: !!empresa?.id && !!clienteId,
    queryFn: async () => {
      const [ventasRes, cobrosRes] = await Promise.all([
        // Estado de cuenta sólo incluye ventas confirmadas/finalizadas; nunca borradores.
        supabase
          .from('ventas')
          .select('id, folio, fecha, total, total_efectivo, cerrado_at, cerrado_snapshot, saldo_pendiente, condicion_pago, status, cobro_aplicaciones(monto_aplicado, cobros!inner(status))')
          .eq('empresa_id', empresa!.id)
          .eq('cliente_id', clienteId!)
          .in('status', ['confirmado', 'entregado', 'facturado'])
          .order('fecha', { ascending: false }),
        supabase
          .from('cobros')
          .select('id, fecha, monto, metodo_pago, referencia')
          .eq('empresa_id', empresa!.id)
          .eq('cliente_id', clienteId!)
          .eq('status', 'activo')
          .order('fecha', { ascending: false }),
      ]);
      if (ventasRes.error) throw ventasRes.error;
      if (cobrosRes.error) throw cobrosRes.error;

      // Saldo a favor y devoluciones de dinero (F1b): de dónde salió y en qué se usó.
      const [excRes, ncRes] = await Promise.all([
        supabase
          .from('cobro_excedentes' as never)
          .select('id, tipo, origen, monto, created_at, turno_id, ventas(folio)')
          .eq('empresa_id', empresa!.id)
          .eq('cliente_id', clienteId!)
          .order('created_at', { ascending: false }),
        supabase
          .from('devoluciones' as never)
          .select('id, fecha, created_at, cancelado_at, turno_id, ventas(folio), devolucion_lineas(monto_credito, accion, aplica_venta)')
          .eq('empresa_id', empresa!.id)
          .eq('cliente_id', clienteId!),
      ]);
      if (excRes.error) throw excRes.error;
      if (ncRes.error) throw ncRes.error;
      const excedentes = (excRes.data ?? []) as unknown as ExcedenteRow[];
      const devsVivas = ((ncRes.data ?? []) as unknown as NotaCreditoRow[]).filter(d => !d.cancelado_at);
      const sumaLineas = (d: NotaCreditoRow, pred: (l: NonNullable<NotaCreditoRow['devolucion_lineas']>[number]) => boolean) =>
        (d.devolucion_lineas ?? []).filter(pred).reduce((s, l) => s + (Number(l.monto_credito) || 0), 0);
      // D-049: la nota aplicada a la venta se muestra como tal (y su uso como pago, abajo).
      const notasCredito = devsVivas
        .flatMap(d => [
          { fecha: d.created_at ?? d.fecha, folio: d.ventas?.folio ?? null, aplicada: false, monto: sumaLineas(d, l => l.accion === 'nota_credito' && !l.aplica_venta) },
          { fecha: d.created_at ?? d.fecha, folio: d.ventas?.folio ?? null, aplicada: true, monto: sumaLineas(d, l => l.accion === 'nota_credito' && !!l.aplica_venta) },
        ])
        .filter(n => n.monto > 0.009);
      // Dinero devuelto por devoluciones de producto (D-032: con turno = retiro de caja).
      const dineroDevoluciones = devsVivas
        .map(d => ({ id: d.id, created_at: d.created_at ?? d.fecha, folio: d.ventas?.folio ?? null, turno_id: d.turno_id, monto: sumaLineas(d, l => l.accion === 'devolucion_dinero') }))
        .filter(n => n.monto > 0.009);
      return { ventas: ventasRes.data ?? [], cobros: cobrosRes.data ?? [], excedentes, notasCredito, dineroDevoluciones };
    },
  });
}

/* ── page ── */
export default function EstadoCuentaClientePage() {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const { filters, toggleFilterValue, setFilter, clearFilters } = useListPreferences('saldos-cliente');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAplicarPago, setShowAplicarPago] = useState(false);

  const { data: clientes, isLoading } = useClientesSaldo(desde, hasta);
  const { data: detalle, isLoading: loadingDetalle } = useClienteDetalle(selectedId);

  const filterOptions: FilterOption[] = useMemo(() => {
    const clientesOpts = (clientes ?? [])
      .map(c => ({ value: c.id, label: c.nombre }))
      .sort((a, b) => a.label.localeCompare(b.label));
    return [
      { key: 'cliente', label: 'Cliente', options: clientesOpts },
      { key: 'credito', label: 'Crédito', options: [
        { value: 'si', label: 'Con crédito' },
        { value: 'no', label: 'Sin crédito' },
      ]},
      { key: 'saldo', label: 'Saldo', options: [
        { value: 'con', label: 'Con saldo pendiente' },
        { value: 'favor', label: 'A favor' },
        { value: 'sin', label: 'Sin saldo' },
      ]},
    ];
  }, [clientes]);

  const filtered = useMemo(() => {
    let list = clientes ?? [];
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(c =>
        c.nombre.toLowerCase().includes(s) ||
        (c.codigo ?? '').toLowerCase().includes(s)
      );
    }
    const clienteF = filters['cliente'] ?? [];
    if (clienteF.length) list = list.filter(c => clienteF.includes(c.id));
    const credF = filters['credito'] ?? [];
    if (credF.length) list = list.filter(c => credF.includes(c.credito ? 'si' : 'no'));
    const saldoF = filters['saldo'] ?? [];
    if (saldoF.length) list = list.filter(c => {
      if (c.saldoNeto > 0.01) return saldoF.includes('con');
      if (c.saldoNeto < -0.01) return saldoF.includes('favor');
      return saldoF.includes('sin');
    });
    return list;
  }, [clientes, search, filters]);

  const selected = clientes?.find(c => c.id === selectedId);

  const totalPendienteGlobal = clientes?.reduce((s, c) => s + c.saldoPendiente, 0) ?? 0;
  const totalFavorGlobal = clientes?.reduce((s, c) => s + c.saldoFavor, 0) ?? 0;
  const clientesConSaldo = clientes?.filter(c => c.saldoNeto > 0.01).length ?? 0;
  const clientesConFavor = clientes?.filter(c => c.saldoFavor > 0.01).length ?? 0;

  // Una venta sólo está liquidada si los cobros activos aplicados cubren su total real.
  // Nunca usamos saldo_pendiente=0 como prueba de pago porque datos históricos/pedidos
  // pueden tener ese campo en cero sin una aplicación de cobro real.
  const ventasPendientes = detalle?.ventas.filter(v => saldoRealVenta(v) > 0.01) ?? [];
  const ventasPagadas = detalle?.ventas.filter(v =>
    totalEfectivoVenta(v) > 0.01 && saldoRealVenta(v) <= 0.01
  ) ?? [];

  const valorVenta = (v: any, k: string) => {
    if (k === 'folio') return v.folio ?? v.id;
    if (k === 'total') return totalEfectivoVenta(v);
    if (k === 'pagado') return pagadoRealVenta(v);
    if (k === 'pendiente') return saldoRealVenta(v);
    return v[k];
  };
  const ordenClientes = useSortableTable(filtered, undefined, undefined, 'estado-cuenta-clientes');
  const ordenPendientes = useSortableTable(ventasPendientes, valorVenta, undefined, 'estado-cuenta-pendientes');
  const ordenPagadas = useSortableTable(ventasPagadas, valorVenta, undefined, 'estado-cuenta-pagadas');
  const ordenCobros = useSortableTable(detalle?.cobros ?? [], undefined, undefined, 'estado-cuenta-cobros');
  // Estas dos listas se arman dentro de la vista de detalle: solo se guarda aquí el orden elegido.
  const ordenFavor = useSortState('estado-cuenta-favor');
  const ordenReembolsos = useSortState('estado-cuenta-reembolsos');

  const handleDescargarPdf = async () => {
    if (!selected || !detalle || !empresa) return;
    const blob = await generarEstadoCuentaPdf({
      empresa: {
        nombre: empresa.nombre ?? '',
        telefono: empresa.telefono ?? '',
        direccion: empresa.direccion ?? '',
        rfc: empresa.rfc ?? '',
        moneda: empresa.moneda ?? 'MXN',
      },
      cliente: {
        nombre: selected.nombre,
        codigo: selected.codigo ?? undefined,
        telefono: selected.telefono ?? undefined,
        direccion: selected.direccion ?? undefined,
        rfc: selected.rfc ?? undefined,
        credito: selected.credito,
        limite_credito: selected.limite_credito,
        dias_credito: selected.dias_credito,
      },
      ventas: detalle.ventas.map(v => {
        const totalReal = totalEfectivoVenta(v);
        return {
          folio: v.folio ?? v.id.slice(0, 8),
          fecha: v.fecha,
          total: totalReal,
          saldo_pendiente: saldoRealVenta(v),
          status: v.status,
          condicion_pago: v.condicion_pago ?? '',
        };
      }),
      cobros: detalle.cobros.map(c => ({
        fecha: c.fecha,
        monto: c.monto ?? 0,
        metodo_pago: c.metodo_pago ?? '',
        referencia: c.referencia ?? undefined,
      })),
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `EdoCuenta_${selected.nombre.replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Detail view ──
  if (selectedId && selected) {
    // Los KPIs usan el mismo universo contable para que cuadren:
    // vendido real = liquidado + saldo pendiente.
    const totalVentas = detalle?.ventas.reduce((sum, v) => sum + totalEfectivoVenta(v), 0) ?? 0;
    const totalSaldo = detalle?.ventas.reduce((sum, v) => sum + saldoRealVenta(v), 0) ?? 0;
    const totalLiquidado = Math.max(0, totalVentas - totalSaldo);
    const totalCobrosRegistrados = detalle?.cobros.reduce((s, c) => s + (c.monto ?? 0), 0) ?? 0;
    // Saldo a favor: + notas de crédito y pagos que quedaron a favor; − lo usado como pago.
    const movFavor = [
      ...(detalle?.notasCredito ?? []).map(n => ({ fecha: n.fecha, concepto: n.aplicada ? 'Nota de crédito (devolución) aplicada a la venta' : 'Nota de crédito (devolución)', folio: n.folio, monto: n.monto })),
      ...(detalle?.excedentes ?? []).filter(e => e.tipo === 'saldo_favor')
        .map(e => ({ fecha: e.created_at, concepto: `${ORIGEN_EXCEDENTE[e.origen]}: pago a favor`, folio: e.ventas?.folio ?? null, monto: Number(e.monto) })),
      ...(detalle?.cobros ?? []).filter(c => c.metodo_pago === 'saldo_favor')
        .map(c => ({ fecha: c.fecha, concepto: 'Usado como pago', folio: c.referencia ?? null, monto: -(Number(c.monto) || 0) })),
    ].sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
    const reembolsos = [
      ...(detalle?.excedentes ?? []).filter(e => e.tipo === 'reembolso')
        .map(e => ({ id: e.id, created_at: e.created_at, motivo: ORIGEN_EXCEDENTE[e.origen], folio: e.ventas?.folio ?? null, turno_id: e.turno_id, monto: Number(e.monto) })),
      ...(detalle?.dineroDevoluciones ?? [])
        .map(d => ({ id: d.id, created_at: d.created_at, motivo: 'Devolución de producto', folio: d.folio, turno_id: d.turno_id, monto: d.monto })),
    ].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));

    return (
      <div className="p-3 sm:p-4 space-y-3 sm:space-y-4 min-h-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Estado de cuenta</h1>
            <p className="text-sm text-muted-foreground">{selected.nombre} {selected.codigo ? `· ${selected.codigo}` : ''}</p>
          </div>
          <Button variant="outline" size="sm" className="btn-pdf gap-2" onClick={handleDescargarPdf} disabled={loadingDetalle}>
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" className="gap-2" onClick={() => setShowAplicarPago(true)}>
            <Banknote className="h-3.5 w-3.5" /> Aplicar pago
          </Button>
          <AplicarPagoClienteDialog
            open={showAplicarPago}
            onOpenChange={setShowAplicarPago}
            cliente={{ id: selected.id, nombre: selected.nombre, codigo: selected.codigo }}
          />
        </div>

        <div className="bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total vendido</p>
              <p className="text-lg font-bold text-foreground">{fmt(totalVentas)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total liquidado</p>
              <p className="text-lg font-bold text-success">{fmt(totalLiquidado)}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Cobros registrados: {fmt(totalCobrosRegistrados)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Saldo pendiente</p>
              <p className="text-lg font-bold text-success">{fmt(totalSaldo)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Crédito</p>
              <p className="text-lg font-bold text-foreground">
                {selected.credito ? `${selected.dias_credito}d · ${fmt(selected.limite_credito)}` : 'No'}
              </p>
            </div>
          </div>
          {(selected.telefono || selected.rfc) && (
            <div className="flex gap-4 mt-3 pt-3 border-t border-border text-xs text-muted-foreground">
              {selected.telefono && <span>Tel: {selected.telefono}</span>}
              {selected.rfc && <span>RFC: {selected.rfc}</span>}
            </div>
          )}
        </div>

        {(movFavor.length > 0 || reembolsos.length > 0) && (
          <div className="grid gap-4 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Wallet className="h-4 w-4 text-primary" /> Saldo a favor
                <span className="ml-auto text-[12px] font-normal text-muted-foreground">Disponible <strong className="text-primary text-sm">{fmt(selected.saldoFavor)}</strong></span>
              </h3>
              <div className="bg-card border border-border rounded overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="fecha" sort={ordenFavor.sort} onToggle={ordenFavor.toggle} className="text-[11px]">Fecha</SortableTableHead>
                      <SortableTableHead sortKey="concepto" sort={ordenFavor.sort} onToggle={ordenFavor.toggle} className="text-[11px]">Concepto</SortableTableHead>
                      <SortableTableHead sortKey="folio" sort={ordenFavor.sort} onToggle={ordenFavor.toggle} className="text-[11px]">Venta</SortableTableHead>
                      <SortableTableHead sortKey="monto" sort={ordenFavor.sort} onToggle={ordenFavor.toggle} align="right" className="text-[11px] text-right">Monto</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenarFilas(movFavor, ordenFavor.sort).map((m, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-[12px]">{fmtDate(m.fecha)}</TableCell>
                        <TableCell className="text-[12px]">{m.concepto}</TableCell>
                        <TableCell className="font-mono text-[11px]">{m.folio ?? '—'}</TableCell>
                        <TableCell className={cn('text-right text-[12px] font-semibold tabular-nums', m.monto < 0 ? 'text-destructive' : 'text-success')}>
                          {m.monto < 0 ? '−' : '+'}{fmt(Math.abs(m.monto))}
                        </TableCell>
                      </TableRow>
                    ))}
                    {movFavor.length === 0 && (
                      <TableRow><TableCell colSpan={4} className="text-center py-4 text-muted-foreground text-sm">Sin movimientos</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div>
              <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                <Banknote className="h-4 w-4 text-destructive" /> Devoluciones de dinero
                <span className="ml-auto text-[12px] font-normal text-muted-foreground">Total <strong className="text-destructive text-sm">{fmt(reembolsos.reduce((s, r) => s + Number(r.monto), 0))}</strong></span>
              </h3>
              <div className="bg-card border border-border rounded overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead sortKey="created_at" sort={ordenReembolsos.sort} onToggle={ordenReembolsos.toggle} className="text-[11px]">Fecha</SortableTableHead>
                      <SortableTableHead sortKey="motivo" sort={ordenReembolsos.sort} onToggle={ordenReembolsos.toggle} className="text-[11px]">Motivo</SortableTableHead>
                      <SortableTableHead sortKey="folio" sort={ordenReembolsos.sort} onToggle={ordenReembolsos.toggle} className="text-[11px]">Venta</SortableTableHead>
                      <SortableTableHead sortKey="caja" sort={ordenReembolsos.sort} onToggle={ordenReembolsos.toggle} className="text-[11px]">Caja</SortableTableHead>
                      <SortableTableHead sortKey="monto" sort={ordenReembolsos.sort} onToggle={ordenReembolsos.toggle} align="right" className="text-[11px] text-right">Monto</SortableTableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordenarFilas(reembolsos, ordenReembolsos.sort, (r: any, k) => k === 'caja' ? (r.turno_id ? 'Retiro de turno' : 'Sin turno') : r[k]).map(r => (
                      <TableRow key={r.id}>
                        <TableCell className="text-[12px]">{fmtDate(r.created_at)}</TableCell>
                        <TableCell className="text-[12px]">{r.motivo}</TableCell>
                        <TableCell className="font-mono text-[11px]">{r.folio ?? '—'}</TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">{r.turno_id ? 'Retiro de turno' : 'Sin turno'}</TableCell>
                        <TableCell className="text-right text-[12px] font-semibold tabular-nums text-destructive">{fmt(Number(r.monto))}</TableCell>
                      </TableRow>
                    ))}
                    {reembolsos.length === 0 && (
                      <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground text-sm">Sin devoluciones de dinero</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2 text-success flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Ventas con saldo pendiente ({ventasPendientes.length})
          </h3>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="folio" sort={ordenPendientes.sort} onToggle={ordenPendientes.toggle} className="text-[11px]">Folio</SortableTableHead>
                  <SortableTableHead sortKey="fecha" sort={ordenPendientes.sort} onToggle={ordenPendientes.toggle} className="text-[11px]">Fecha</SortableTableHead>
                  <SortableTableHead sortKey="condicion_pago" sort={ordenPendientes.sort} onToggle={ordenPendientes.toggle} className="text-[11px]">Condición</SortableTableHead>
                  <SortableTableHead sortKey="total" sort={ordenPendientes.sort} onToggle={ordenPendientes.toggle} align="right" className="text-[11px] text-right">Total</SortableTableHead>
                  <SortableTableHead sortKey="pagado" sort={ordenPendientes.sort} onToggle={ordenPendientes.toggle} align="right" className="text-[11px] text-right">Pagado</SortableTableHead>
                  <SortableTableHead sortKey="pendiente" sort={ordenPendientes.sort} onToggle={ordenPendientes.toggle} align="right" className="text-[11px] text-right">Pendiente</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenPendientes.sorted.map(v => (
                  <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/ventas/${v.id}`)}>
                    <TableCell className="font-mono text-[11px]">{v.folio ?? v.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{v.condicion_pago}</Badge></TableCell>
                    <TableCell className="text-right text-[12px]">{fmt(totalEfectivoVenta(v))}</TableCell>
                    <TableCell className="text-right text-[12px] text-success">{fmt(pagadoRealVenta(v))}</TableCell>
                    <TableCell className="text-right font-bold text-warning">{fmt(saldoRealVenta(v))}</TableCell>
                  </TableRow>
                ))}
                {ventasPendientes.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Sin saldos pendientes 🎉</TableCell></TableRow>
                )}
              </TableBody>
              {ventasPendientes.length > 0 && (() => {
                const t = ventasPendientes.reduce((s, v) => s + totalEfectivoVenta(v), 0);
                const p = ventasPendientes.reduce((s, v) => s + pagadoRealVenta(v), 0);
                const sp = ventasPendientes.reduce((s, v) => s + saldoRealVenta(v), 0);
                return (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="text-[11px] text-muted-foreground font-semibold">Totales ({ventasPendientes.length})</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{fmt(t)}</TableCell>
                      <TableCell className="text-right font-bold text-success tabular-nums">{fmt(p)}</TableCell>
                      <TableCell className="text-right font-bold text-success tabular-nums">{fmt(sp)}</TableCell>
                    </TableRow>
                  </TableFooter>
                );
              })()}
            </Table>
          </div>
        </div>

        {ventasPagadas.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2 text-success flex items-center gap-2">
              <FileText className="h-4 w-4" /> Ventas liquidadas ({ventasPagadas.length})
            </h3>
            <div className="bg-card border border-border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableTableHead sortKey="folio" sort={ordenPagadas.sort} onToggle={ordenPagadas.toggle} className="text-[11px]">Folio</SortableTableHead>
                    <SortableTableHead sortKey="fecha" sort={ordenPagadas.sort} onToggle={ordenPagadas.toggle} className="text-[11px]">Fecha</SortableTableHead>
                    <SortableTableHead sortKey="condicion_pago" sort={ordenPagadas.sort} onToggle={ordenPagadas.toggle} className="text-[11px]">Condición</SortableTableHead>
                    <SortableTableHead sortKey="total" sort={ordenPagadas.sort} onToggle={ordenPagadas.toggle} align="right" className="text-[11px] text-right">Total</SortableTableHead>
                    <SortableTableHead sortKey="pagado" sort={ordenPagadas.sort} onToggle={ordenPagadas.toggle} align="right" className="text-[11px] text-right">Pagado</SortableTableHead>
                    <SortableTableHead sortKey="status" sort={ordenPagadas.sort} onToggle={ordenPagadas.toggle} className="text-[11px]">Estado</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenPagadas.sorted.slice(0, 30).map(v => (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/ventas/${v.id}`)}>
                      <TableCell className="font-mono text-[11px]">{v.folio ?? v.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{v.condicion_pago}</Badge></TableCell>
                      <TableCell className="text-right text-[12px]">{fmt(totalEfectivoVenta(v))}</TableCell>
                      <TableCell className="text-right font-bold text-success tabular-nums">{fmt(pagadoRealVenta(v))}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{v.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {ventasPagadas.length > 0 && (() => {
                  const shown = ordenPagadas.sorted.slice(0, 30);
                  const t = shown.reduce((s, v) => s + totalEfectivoVenta(v), 0);
                  const p = shown.reduce((s, v) => s + pagadoRealVenta(v), 0);
                  return (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={3} className="text-[11px] text-muted-foreground font-semibold">Totales ({shown.length})</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{fmt(t)}</TableCell>
                        <TableCell className="text-right font-bold text-success tabular-nums">{fmt(p)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  );
                })()}
              </Table>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Historial de pagos ({detalle?.cobros.length ?? 0})
          </h3>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="fecha" sort={ordenCobros.sort} onToggle={ordenCobros.toggle} className="text-[11px]">Fecha</SortableTableHead>
                  <SortableTableHead sortKey="metodo_pago" sort={ordenCobros.sort} onToggle={ordenCobros.toggle} className="text-[11px]">Método</SortableTableHead>
                  <SortableTableHead sortKey="referencia" sort={ordenCobros.sort} onToggle={ordenCobros.toggle} className="text-[11px]">Referencia</SortableTableHead>
                  <SortableTableHead sortKey="monto" sort={ordenCobros.sort} onToggle={ordenCobros.toggle} align="right" className="text-[11px] text-right">Monto</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ordenCobros.sorted.map(c => (
                  <TableRow key={c.id}>
                    <TableCell className="text-[12px]">{fmtDate(c.fecha)}</TableCell>
                    <TableCell className="text-[12px]">{c.metodo_pago}</TableCell>
                    <TableCell className="text-[12px] text-muted-foreground">{c.referencia ?? '—'}</TableCell>
                    <TableCell className="text-right font-bold text-success">{fmt(c.monto ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {(detalle?.cobros ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center py-6 text-muted-foreground text-sm">Sin pagos registrados</TableCell></TableRow>
                )}
              </TableBody>
              {!!(detalle?.cobros?.length) && (
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={3} className="text-[11px] text-muted-foreground font-semibold">Totales ({detalle.cobros.length})</TableCell>
                    <TableCell className="text-right font-bold text-success tabular-nums">{fmt(detalle.cobros.reduce((s, c) => s + (c.monto ?? 0), 0))}</TableCell>
                  </TableRow>
                </TableFooter>
              )}
            </Table>
          </div>
        </div>

        {loadingDetalle && <p className="text-center text-muted-foreground py-4">Cargando...</p>}
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 min-h-full">
      <CobranzaTabs />
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Users className="h-5 w-5" /> Saldos por cliente
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 sm:p-4 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo total pendiente</p>
          <p className="text-lg sm:text-2xl font-bold truncate text-destructive">{fmt(totalPendienteGlobal)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 sm:p-4 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo a favor</p>
          <p className="text-lg sm:text-2xl font-bold truncate text-destructive">{fmt(totalFavorGlobal)}</p>
          <p className="text-[10px] text-muted-foreground">{clientesConFavor} cliente{clientesConFavor === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 sm:p-4 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase">Clientes con saldo</p>
          <p className="text-lg sm:text-2xl font-bold truncate text-foreground">{clientesConSaldo}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 sm:p-4 min-w-0">
          <p className="text-[11px] text-muted-foreground uppercase">Total clientes</p>
          <p className="text-lg sm:text-2xl font-bold truncate text-muted-foreground">{clientes?.length ?? 0}</p>
        </div>
      </div>

      <OdooFilterBar
        search={search}
        onSearchChange={setSearch}
        placeholder="Buscar cliente..."
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
              <SortableTableHead sortKey="codigo" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} className="text-[11px]">Código</SortableTableHead>
              <SortableTableHead sortKey="nombre" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} className="text-[11px]">Cliente</SortableTableHead>
              <SortableTableHead sortKey="telefono" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} className="text-[11px]">Teléfono</SortableTableHead>
              <SortableTableHead sortKey="docs" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} align="center" className="text-[11px] text-center">Docs</SortableTableHead>
              <SortableTableHead sortKey="totalVendido" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} align="right" className="text-[11px] text-right">Total vendido</SortableTableHead>
              <SortableTableHead sortKey="saldoFavor" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} align="right" className="text-[11px] text-right">A favor</SortableTableHead>
              <SortableTableHead sortKey="saldoNeto" sort={ordenClientes.sort} onToggle={ordenClientes.toggle} align="right" className="text-[11px] text-right">Saldo</SortableTableHead>
              <TableHead className="text-[11px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenClientes.sorted.map(c => (
              <TableRow
                key={c.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => setSelectedId(c.id)}
              >
                <TableCell className="font-mono text-[11px]">{c.codigo ?? '—'}</TableCell>
                <TableCell className="font-medium text-[12px]">{c.nombre}</TableCell>
                <TableCell className="text-[12px] text-muted-foreground">{c.telefono ?? '—'}</TableCell>
                <TableCell className="text-center text-[12px]">{c.docs}</TableCell>
                <TableCell className="text-right text-[12px]">{fmt(c.totalVendido)}</TableCell>
                <TableCell className="text-right text-[12px] text-destructive tabular-nums">
                  {c.saldoFavor > 0.01 ? fmt(c.saldoFavor) : '—'}
                </TableCell>
                <TableCell className={cn("text-right font-bold text-[12px] tabular-nums",
                  c.saldoNeto > 0.01 ? 'text-success' : c.saldoNeto < -0.01 ? 'text-destructive' : 'text-muted-foreground')}>
                  {c.saldoNeto < -0.01 ? `-${fmt(Math.abs(c.saldoNeto))}` : fmt(c.saldoNeto)}
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Sin clientes con ventas</TableCell></TableRow>
            )}
          </TableBody>
          {filtered.length > 0 && (() => {
            const docs = filtered.reduce((s, c) => s + c.docs, 0);
            const tot = filtered.reduce((s, c) => s + c.totalVendido, 0);
            const fav = filtered.reduce((s, c) => s + c.saldoFavor, 0);
            const neto = filtered.reduce((s, c) => s + c.saldoNeto, 0);
            return (
              <TableFooter>
                <TableRow>
                  <TableCell colSpan={3} className="text-[11px] text-muted-foreground font-semibold">Totales ({filtered.length})</TableCell>
                  <TableCell className="text-center font-bold tabular-nums">{docs}</TableCell>
                  <TableCell className="text-right font-bold tabular-nums">{fmt(tot)}</TableCell>
                  <TableCell className="text-right font-bold text-destructive tabular-nums">{fav > 0.01 ? fmt(fav) : '—'}</TableCell>
                  <TableCell className={cn("text-right font-bold tabular-nums",
                    neto > 0.01 ? 'text-success' : neto < -0.01 ? 'text-destructive' : 'text-muted-foreground')}>
                    {neto < -0.01 ? `-${fmt(Math.abs(neto))}` : fmt(neto)}
                  </TableCell>
                  <TableCell />
                </TableRow>
              </TableFooter>
            );
          })()}
        </Table>
      </div>
    </div>
  );
}