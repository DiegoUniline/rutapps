import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, cn } from '@/lib/utils';
import { Search, Users, ChevronRight, CreditCard, FileText, Banknote, Download, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { generarEstadoCuentaPdf } from '@/lib/estadoCuentaPdf';

/* ── hooks ── */
function useClientesSaldo() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['clientes-saldo-resumen', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ventas')
        .select('cliente_id, saldo_pendiente, total, clientes(id, nombre, codigo, telefono, credito, dias_credito, limite_credito, rfc, direccion)')
        .eq('empresa_id', empresa!.id)
        .neq('status', 'cancelado');
      if (error) throw error;

      const map = new Map<string, {
        id: string; nombre: string; codigo: string | null; telefono: string | null;
        credito: boolean; dias_credito: number; limite_credito: number;
        rfc: string | null; direccion: string | null;
        totalVendido: number; saldoPendiente: number; docs: number;
      }>();
      (data ?? []).forEach((v: any) => {
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
            totalVendido: v.total ?? 0, saldoPendiente: v.saldo_pendiente ?? 0, docs: 1,
          });
        }
      });
      return Array.from(map.values()).sort((a, b) => b.saldoPendiente - a.saldoPendiente);
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
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data: clientes, isLoading } = useClientesSaldo();
  const { data: detalle, isLoading: loadingDetalle } = useClienteDetalle(selectedId);

  const filtered = useMemo(() => {
    if (!clientes) return [];
    if (!search) return clientes;
    const s = search.toLowerCase();
    return clientes.filter(c =>
      c.nombre.toLowerCase().includes(s) ||
      (c.codigo ?? '').toLowerCase().includes(s)
    );
  }, [clientes, search]);

  const selected = clientes?.find(c => c.id === selectedId);

  const totalPendienteGlobal = clientes?.reduce((s, c) => s + c.saldoPendiente, 0) ?? 0;
  const clientesConSaldo = clientes?.filter(c => c.saldoPendiente > 0.01).length ?? 0;

  const ventasPendientes = detalle?.ventas.filter(v => (v.saldo_pendiente ?? 0) > 0.01) ?? [];
  const ventasPagadas = detalle?.ventas.filter(v => (v.saldo_pendiente ?? 0) <= 0.01) ?? [];

  const handleDescargarPdf = () => {
    if (!selected || !detalle || !empresa) return;
    const blob = generarEstadoCuentaPdf({
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
              <p className="text-lg font-bold text-destructive">{fmt(totalSaldo)}</p>
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
          <h3 className="text-sm font-semibold mb-2 text-destructive flex items-center gap-2">
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
                    <TableCell className="text-right font-bold text-destructive">{fmt(v.saldo_pendiente ?? 0)}</TableCell>
                  </TableRow>
                ))}
                {ventasPendientes.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground text-sm">Sin saldos pendientes 🎉</TableCell></TableRow>
                )}
              </TableBody>
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
      <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
        <Users className="h-5 w-5" /> Saldos por cliente
      </h1>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="bg-card border border-border rounded-lg p-4">
          <p className="text-[11px] text-muted-foreground uppercase">Saldo total pendiente</p>
          <p className="text-2xl font-bold text-destructive">{fmt(totalPendienteGlobal)}</p>
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar cliente..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      <div className="bg-card border border-border rounded overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-[11px]">Código</TableHead>
              <TableHead className="text-[11px]">Cliente</TableHead>
              <TableHead className="text-[11px]">Teléfono</TableHead>
              <TableHead className="text-[11px] text-center">Docs</TableHead>
              <TableHead className="text-[11px] text-right">Total vendido</TableHead>
              <TableHead className="text-[11px] text-right">Saldo pendiente</TableHead>
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
                <TableCell className={cn("text-right font-bold text-[12px]", c.saldoPendiente > 0.01 ? 'text-destructive' : 'text-success')}>
                  {fmt(c.saldoPendiente)}
                </TableCell>
                <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
              </TableRow>
            ))}
            {isLoading && <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Cargando...</TableCell></TableRow>}
            {!isLoading && filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Sin clientes con ventas</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
