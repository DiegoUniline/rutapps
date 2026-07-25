import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { Users, ChevronRight, CreditCard, FileText, Banknote, Download, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';
import { CobranzaTabs } from '@/components/CobranzaTabs';
import { OdooFilterBar, FilterOption } from '@/components/OdooFilterBar';
import { useListPreferences } from '@/hooks/useListPreferences';

/* ── hooks ── */
function useClientesSaldo(desde: string, hasta: string) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-saldo-resumen', empresa?.id, desde, hasta],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = supabase
        .from('ventas')
        .select('cliente_id, fecha, saldo_pendiente, total, clientes(id, nombre, codigo, telefono, credito, dias_credito, limite_credito, rfc, direccion)')
        .eq('empresa_id', empresa!.id)
        .neq('status', 'cancelado');
      if (desde) q = q.gte('fecha', desde);
      if (hasta) q = q.lte('fecha', hasta);
      const [ventasRes, devsRes, favUsadoRes] = await Promise.all([
        q,
        supabase
          .from('devoluciones')
          .select('cliente_id, devolucion_lineas(monto_credito, accion)')
          .eq('empresa_id', empresa!.id),
        supabase
          .from('cobros')
          .select('cliente_id, monto')
          .eq('empresa_id', empresa!.id)
          .eq('status', 'activo')
          .eq('metodo_pago', 'saldo_favor'),
      ]);
      if (ventasRes.error) throw ventasRes.error;

      // Saldo a favor por cliente = emitido (notas de crédito) − usado (cobros con saldo_favor)
      const favorEmitido = new Map<string, number>();
      (devsRes.data ?? []).forEach((d: any) => {
        if (!d.cliente_id) return;
        const emit = (d.devolucion_lineas ?? [])
          .filter((l: any) => l.accion === 'nota_credito')
          .reduce((s: number, l: any) => s + (Number(l.monto_credito) || 0), 0);
        favorEmitido.set(d.cliente_id, (favorEmitido.get(d.cliente_id) ?? 0) + emit);
      });
      const favorUsado = new Map<string, number>();
      (favUsadoRes.data ?? []).forEach((c: any) => {
        if (!c.cliente_id) return;
        favorUsado.set(c.cliente_id, (favorUsado.get(c.cliente_id) ?? 0) + (Number(c.monto) || 0));
      });
      const favorDisponible = (cid: string) =>
        Math.max(0, Math.round(((favorEmitido.get(cid) ?? 0) - (favorUsado.get(cid) ?? 0)) * 100) / 100);

      const map = new Map<string, {
        id: string; nombre: string; codigo: string | null; telefono: string | null;
        credito: boolean; dias_credito: number; limite_credito: number;
        rfc: string | null; direccion: string | null;
        totalVendido: number; saldoPendiente: number; saldoFavor: number; saldoNeto: number; docs: number;
      }>();
      (ventasRes.data ?? []).forEach((v: any) => {
        const cid = v.cliente_id;
        if (!cid) return;
        const c = v.clientes;
        const existing = map.get(cid);
        if (existing) {
          existing.totalVendido += v.total ?? 0;
          existing.saldoPendiente += v.saldo_pendiente ?? 0;
          existing.docs += 1;
        } else {
          map.set(cid, {
            id: cid, nombre: c?.nombre ?? 'Sin cliente', codigo: c?.codigo ?? null,
            telefono: c?.telefono ?? null, credito: c?.credito ?? false,
            dias_credito: c?.dias_credito ?? 0, limite_credito: c?.limite_credito ?? 0,
            rfc: c?.rfc ?? null, direccion: c?.direccion ?? null,
            totalVendido: v.total ?? 0, saldoPendiente: v.saldo_pendiente ?? 0,
            saldoFavor: 0, saldoNeto: 0, docs: 1,
          });
        }
      });
      // Incluir clientes que solo tienen saldo a favor (sin ventas en el rango)
      favorEmitido.forEach((_v, cid) => {
        if (!map.has(cid) && favorDisponible(cid) > 0.009) {
          map.set(cid, {
            id: cid, nombre: 'Cliente', codigo: null, telefono: null,
            credito: false, dias_credito: 0, limite_credito: 0, rfc: null, direccion: null,
            totalVendido: 0, saldoPendiente: 0, saldoFavor: 0, saldoNeto: 0, docs: 0,
          });
        }
      });
      // Completar nombres faltantes
      const sinNombre = Array.from(map.values()).filter(c => c.nombre === 'Cliente').map(c => c.id);
      if (sinNombre.length) {
        const { data: cli } = await supabase
          .from('clientes')
          .select('id, nombre, codigo, telefono, credito, dias_credito, limite_credito, rfc, direccion')
          .in('id', sinNombre);
        (cli ?? []).forEach((c: any) => {
          const row = map.get(c.id);
          if (row) Object.assign(row, {
            nombre: c.nombre ?? 'Cliente', codigo: c.codigo, telefono: c.telefono,
            credito: c.credito, dias_credito: c.dias_credito ?? 0,
            limite_credito: c.limite_credito ?? 0, rfc: c.rfc, direccion: c.direccion,
          });
        });
      }
      // Aplicar saldo a favor y calcular neto
      map.forEach((row, cid) => {
        row.saldoFavor = favorDisponible(cid);
        row.saldoNeto = Math.round((row.saldoPendiente - row.saldoFavor) * 100) / 100;
      });
      return Array.from(map.values()).sort((a, b) => b.saldoNeto - a.saldoNeto);
    },
  });
}

function useClienteDetalle(clienteId: string | null) {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['cliente-estado-cuenta', empresa?.id, clienteId],
    enabled: !!empresa?.id && !!clienteId,
    queryFn: async () => {
      const [ventasRes, cobrosRes] = await Promise.all([
        supabase
          .from('ventas')
          .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, status')
          .eq('empresa_id', empresa!.id)
          .eq('cliente_id', clienteId!)
          .neq('status', 'cancelado')
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
      return { ventas: ventasRes.data ?? [], cobros: cobrosRes.data ?? [] };
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

  const ventasPendientes = detalle?.ventas.filter(v => (v.saldo_pendiente ?? 0) > 0.01) ?? [];
  const ventasPagadas = detalle?.ventas.filter(v => (v.saldo_pendiente ?? 0) <= 0.01) ?? [];

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
      ventas: detalle.ventas.map(v => ({
        folio: v.folio ?? v.id.slice(0, 8),
        fecha: v.fecha,
        total: v.total ?? 0,
        saldo_pendiente: v.saldo_pendiente ?? 0,
        status: v.status,
        condicion_pago: v.condicion_pago ?? '',
      })),
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
    const totalVentas = detalle?.ventas.reduce((s, v) => s + (v.total ?? 0), 0) ?? 0;
    const totalSaldo = detalle?.ventas.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0) ?? 0;
    const totalCobrado = detalle?.cobros.reduce((s, c) => s + (c.monto ?? 0), 0) ?? 0;

    return (
      <div className="p-4 space-y-4 min-h-full">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedId(null)}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <h1 className="text-xl font-semibold text-foreground">Estado de cuenta</h1>
            <p className="text-sm text-muted-foreground">{selected.nombre} {selected.codigo ? `· ${selected.codigo}` : ''}</p>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleDescargarPdf} disabled={loadingDetalle}>
            <Download className="h-3.5 w-3.5" /> PDF
          </Button>
          <Button size="sm" className="gap-2" onClick={() => navigate('/finanzas/aplicar-pagos')}>
            <Banknote className="h-3.5 w-3.5" /> Aplicar pago
          </Button>
        </div>

        {/* Client card */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total vendido</p>
              <p className="text-lg font-bold text-foreground">{fmt(totalVentas)}</p>
            </div>
            <div>
              <p className="text-[10px] text-muted-foreground uppercase">Total cobrado</p>
              <p className="text-lg font-bold text-success">{fmt(totalCobrado)}</p>
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

        {/* Ventas pendientes */}
        <div>
          <h3 className="text-sm font-semibold mb-2 text-success flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Ventas con saldo pendiente ({ventasPendientes.length})
          </h3>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Folio</TableHead>
                  <TableHead className="text-[11px]">Fecha</TableHead>
                  <TableHead className="text-[11px]">Condición</TableHead>
                  <TableHead className="text-[11px] text-right">Total</TableHead>
                  <TableHead className="text-[11px] text-right">Pagado</TableHead>
                  <TableHead className="text-[11px] text-right">Pendiente</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ventasPendientes.map(v => (
                  <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/ventas/${v.id}`)}>
                    <TableCell className="font-mono text-[11px]">{v.folio ?? v.id.slice(0, 8)}</TableCell>
                    <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{v.condicion_pago}</Badge></TableCell>
                    <TableCell className="text-right text-[12px]">{fmt(v.total ?? 0)}</TableCell>
                    <TableCell className="text-right text-[12px] text-success">{fmt((v.total ?? 0) - (v.saldo_pendiente ?? 0))}</TableCell>
                    <TableCell className="text-right font-bold text-success">{fmt(v.saldo_pendiente ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {ventasPendientes.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Sin saldos pendientes 🎉</TableCell></TableRow>
                )}
              </TableBody>
              {ventasPendientes.length > 0 && (() => {
                const t = ventasPendientes.reduce((s, v) => s + (v.total ?? 0), 0);
                const p = ventasPendientes.reduce((s, v) => s + ((v.total ?? 0) - (v.saldo_pendiente ?? 0)), 0);
                const sp = ventasPendientes.reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
                return (
                  <TableFooter>
                    <TableRow>
                      <TableCell colSpan={3} className="text-[11px] text-muted-foreground font-semibold">Totales ({ventasPendientes.length})</TableCell>
                      <TableCell className="text-right font-bold tabular-nums">{fmt(t)}</TableCell>
                      <TableCell className="text-right font-bold text-success tabular-nums">{fmt(p)}</TableCell>
                      <TableCell className="text-right font-bold text-destructive tabular-nums">{fmt(sp)}</TableCell>
                    </TableRow>
                  </TableFooter>
                );
              })()}
            </Table>
          </div>
        </div>

        {/* Ventas pagadas */}
        {ventasPagadas.length > 0 && (
          <div>
            <h3 className="text-sm font-semibold mb-2 text-success flex items-center gap-2">
              <FileText className="h-4 w-4" /> Ventas liquidadas ({ventasPagadas.length})
            </h3>
            <div className="bg-card border border-border rounded overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[11px]">Folio</TableHead>
                    <TableHead className="text-[11px]">Fecha</TableHead>
                    <TableHead className="text-[11px] text-right">Total</TableHead>
                    <TableHead className="text-[11px]">Estado</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ventasPagadas.slice(0, 30).map(v => (
                    <TableRow key={v.id} className="cursor-pointer hover:bg-muted/50" onClick={() => navigate(`/ventas/${v.id}`)}>
                      <TableCell className="font-mono text-[11px]">{v.folio ?? v.id.slice(0, 8)}</TableCell>
                      <TableCell className="text-[12px]">{fmtDate(v.fecha)}</TableCell>
                      <TableCell className="text-right text-[12px]">{fmt(v.total ?? 0)}</TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{v.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                {ventasPagadas.length > 0 && (() => {
                  const shown = ventasPagadas.slice(0, 30);
                  const t = shown.reduce((s, v) => s + (v.total ?? 0), 0);
                  return (
                    <TableFooter>
                      <TableRow>
                        <TableCell colSpan={2} className="text-[11px] text-muted-foreground font-semibold">Totales ({shown.length})</TableCell>
                        <TableCell className="text-right font-bold tabular-nums">{fmt(t)}</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableFooter>
                  );
                })()}
              </Table>
            </div>
          </div>
        )}

        {/* Cobros */}
        <div>
          <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
            <Banknote className="h-4 w-4" /> Historial de pagos ({detalle?.cobros.length ?? 0})
          </h3>
          <div className="bg-card border border-border rounded overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-[11px]">Fecha</TableHead>
                  <TableHead className="text-[11px]">Método</TableHead>
                  <TableHead className="text-[11px]">Referencia</TableHead>
                  <TableHead className="text-[11px] text-right">Monto</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(detalle?.cobros ?? []).map(c => (
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

  // ── List view ──
  return (
    <div className="p-4 space-y-4 min-h-full">
      <CobranzaTabs />
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Users className="h-5 w-5" /> Saldos por cliente
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo total pendiente</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendienteGlobal)}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo a favor</p>
          <p className="text-2xl font-bold text-success">{fmt(totalFavorGlobal)}</p>
          <p className="text-[10px] text-muted-foreground">{clientesConFavor} cliente{clientesConFavor === 1 ? '' : 's'}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Clientes con saldo</p>
          <p className="text-2xl font-bold text-foreground">{clientesConSaldo}</p>
        </div>
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Total clientes</p>
          <p className="text-2xl font-bold text-muted-foreground">{clientes?.length ?? 0}</p>
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
              <TableHead className="text-[11px]">Código</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Teléfono</TableHead>
              <TableHead className="text-[11px] text-center">Docs</TableHead>
              <TableHead className="text-[11px] text-right">Total vendido</TableHead>
              <TableHead className="text-[11px] text-right">A favor</TableHead>
              <TableHead className="text-[11px] text-right">Saldo</TableHead>
              <TableHead className="text-[11px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(c => (
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
                <TableCell className="text-right text-[12px] text-success tabular-nums">
                  {c.saldoFavor > 0.01 ? fmt(c.saldoFavor) : '—'}
                </TableCell>
                <TableCell className={cn("text-right font-bold text-[12px] tabular-nums",
                  c.saldoNeto > 0.01 ? 'text-destructive' : c.saldoNeto < -0.01 ? 'text-success' : 'text-muted-foreground')}>
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
                  <TableCell className="text-right font-bold text-success tabular-nums">{fav > 0.01 ? fmt(fav) : '—'}</TableCell>
                  <TableCell className={cn("text-right font-bold tabular-nums",
                    neto > 0.01 ? 'text-destructive' : neto < -0.01 ? 'text-success' : 'text-muted-foreground')}>
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
