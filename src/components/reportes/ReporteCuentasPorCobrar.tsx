import { useMemo, useState, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { useAuth } from '@/contexts/AuthContext';
import { hasEmpresa, requireEmpresa } from '@/lib/empresaGuard';
import { fmtDate } from '@/lib/utils';
import { ChevronDown, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { generarCuentasPorCobrarPdf } from '@/lib/cuentasPorCobrarPdf';

interface CxCRow {
  id: string;
  folio: string | null;
  fecha: string;
  cliente: string;
  tipo: string;
  vencimiento: string | null;
  total: number;
  abonado: number;
  saldo: number;
  vencido: boolean;
  esSaldoInicial: boolean;
}

interface DetalleVenta {
  lineas: any[];
  pagos: any[];
}

/**
 * Cuentas por cobrar — estado de cuenta clásico agrupado por cliente.
 * Filas clicables: expanden productos + pagos de esa nota.
 * Exporta PDF con el mismo diseño.
 */
export function ReporteCuentasPorCobrar(_props: { desde: string; hasta: string }) {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  const hoy = new Date().toISOString().slice(0, 10);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [detalles, setDetalles] = useState<Record<string, DetalleVenta | 'loading'>>({});
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [pdfName, setPdfName] = useState('');
  const [showPdf, setShowPdf] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const { data: rows = [], isLoading } = useQuery<CxCRow[]>({
    queryKey: ['reporte-cxc', empresaId],
    enabled: hasEmpresa(empresaId),
    queryFn: async () => {
      const eid = requireEmpresa(empresaId, 'ReporteCuentasPorCobrar');
      const { data, error } = await supabase
        .from('ventas')
        .select('id, folio, fecha, total, saldo_pendiente, condicion_pago, fecha_vencimiento, status, es_saldo_inicial, clientes(nombre)')
        .eq('empresa_id', eid)
        .gt('saldo_pendiente', 0)
        .neq('status', 'cancelado')
        .order('fecha', { ascending: true });
      if (error) throw error;

      return (data ?? []).map((v: any) => {
        const total = Number(v.total) || 0;
        const saldo = Number(v.saldo_pendiente) || 0;
        const esCredito = v.condicion_pago === 'credito';
        const vencimiento = esCredito && v.fecha_vencimiento ? String(v.fecha_vencimiento).slice(0, 10) : null;
        return {
          id: v.id,
          folio: v.folio,
          fecha: v.fecha,
          cliente: v.clientes?.nombre ?? 'Sin cliente',
          tipo: v.es_saldo_inicial ? 'Saldo inicial' : esCredito ? 'Crédito' : 'Contado',
          vencimiento,
          total,
          abonado: Math.max(0, total - saldo),
          saldo,
          vencido: !!vencimiento && vencimiento < hoy,
          esSaldoInicial: !!v.es_saldo_inicial,
        } as CxCRow;
      });
    },
  });

  const grupos = useMemo(() => {
    const map = new Map<string, CxCRow[]>();
    for (const r of rows) {
      if (!map.has(r.cliente)) map.set(r.cliente, []);
      map.get(r.cliente)!.push(r);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([cliente, items], idx) => {
        items.sort((a, b) => a.fecha.localeCompare(b.fecha));
        const cargos = items.reduce((s, r) => s + r.total, 0);
        const abonos = items.reduce((s, r) => s + r.abonado, 0);
        const saldos = items.reduce((s, r) => s + r.saldo, 0);
        return { cliente, num: idx + 1, items, cargos, abonos, saldos };
      });
  }, [rows]);

  const totalCargos = grupos.reduce((s, g) => s + g.cargos, 0);
  const totalAbonos = grupos.reduce((s, g) => s + g.abonos, 0);
  const totalSaldos = grupos.reduce((s, g) => s + g.saldos, 0);
  const totalVencido = rows.filter(r => r.vencido).reduce((s, r) => s + r.saldo, 0);

  const padDoc = (folio: string | null) => (folio ? folio.replace(/\D/g, '').padStart(10, '0') || folio : '—');

  async function loadDetalle(ventaId: string) {
    if (detalles[ventaId] && detalles[ventaId] !== 'loading') return;
    setDetalles(d => ({ ...d, [ventaId]: 'loading' }));
    const [lRes, pRes] = await Promise.all([
      supabase
        .from('venta_lineas')
        .select('id, cantidad, precio_unitario, descuento_pct, subtotal, total, productos(nombre), unidades(abreviatura)')
        .eq('venta_id', ventaId)
        .order('created_at'),
      supabase
        .from('cobro_aplicaciones')
        .select('id, monto_aplicado, cobros(fecha, metodo_pago, referencia, status)')
        .eq('venta_id', ventaId)
        .order('created_at'),
    ]);
    setDetalles(d => ({ ...d, [ventaId]: { lineas: lRes.data ?? [], pagos: pRes.data ?? [] } }));
  }

  function toggle(ventaId: string) {
    setExpanded(e => {
      const next = { ...e, [ventaId]: !e[ventaId] };
      if (next[ventaId]) loadDetalle(ventaId);
      return next;
    });
  }

  async function handlePdf() {
    if (!rows.length) { toast.info('No hay saldos por cobrar para exportar'); return; }
    setGeneratingPdf(true);
    try {
      const blob = await generarCuentasPorCobrarPdf({
        empresa: {
          nombre: empresa?.nombre ?? 'Empresa',
          razon_social: (empresa as any)?.razon_social ?? null,
          rfc: (empresa as any)?.rfc ?? null,
          direccion: (empresa as any)?.direccion ?? null,
          telefono: (empresa as any)?.telefono ?? null,
          moneda: (empresa as any)?.moneda ?? null,
          logo_url: (empresa as any)?.logo_url ?? null,
        },
        rows: rows.map(r => ({
          folio: r.folio, fecha: r.fecha, cliente: r.cliente, tipo: r.tipo,
          vencimiento: r.vencimiento, total: r.total, abonado: r.abonado,
          saldo: r.saldo, vencido: r.vencido, esSaldoInicial: r.esSaldoInicial,
        })),
      });
      setPdfBlob(blob);
      setPdfName(`cuentas-por-cobrar-${hoy}.pdf`);
      setShowPdf(true);
    } catch (err: any) {
      toast.error(err.message || 'Error generando PDF');
    } finally {
      setGeneratingPdf(false);
    }
  }

  return (
    <div className="space-y-3">
      {/* Resumen + acciones */}
      <div className="flex items-start gap-2 flex-wrap">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 flex-1 min-w-0">
          <Card label="Por cobrar" value={fmt(totalSaldos)} tone="primary" />
          <Card label="Vencido" value={fmt(totalVencido)} tone={totalVencido > 0 ? 'danger' : 'muted'} />
          <Card label="Folios" value={String(rows.length)} />
          <Card label="Clientes" value={String(grupos.length)} />
        </div>
        <button
          onClick={handlePdf}
          disabled={generatingPdf || isLoading}
          className="btn-odoo-secondary h-9 flex items-center gap-1.5 text-[12px] shrink-0 print:hidden"
        >
          {generatingPdf ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
          Exportar PDF
        </button>
      </div>

      <div className="border border-border rounded-lg overflow-x-auto bg-card">
        <table className="w-full text-[12px]">
          <thead className="text-muted-foreground text-[10px] font-semibold uppercase border-b border-border">
            <tr>
              <th className="text-left px-3 py-2 w-10">Cliente</th>
              <th className="text-left px-3 py-2">Concepto</th>
              <th className="text-left px-3 py-2">Documento</th>
              <th className="text-center px-2 py-2">Num.</th>
              <th className="text-left px-3 py-2">Fecha aplic.</th>
              <th className="text-left px-3 py-2">Fecha venc.</th>
              <th className="text-right px-3 py-2">Cargos</th>
              <th className="text-right px-3 py-2">Abonos</th>
              <th className="text-right px-3 py-2">Saldos</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map(g => (
              <Fragment key={g.cliente}>
                <tr className="bg-accent/30 border-t border-border">
                  <td className="px-3 py-1.5 font-semibold tabular-nums">{g.num}</td>
                  <td className="px-3 py-1.5 font-semibold uppercase tracking-wide" colSpan={8}>
                    {g.cliente}
                  </td>
                </tr>
                {g.items.map(r => {
                  const isOpen = !!expanded[r.id];
                  const detalle = detalles[r.id];
                  return (
                    <Fragment key={r.id}>
                      <tr
                        className="border-t border-border/60 hover:bg-accent/20 cursor-pointer"
                        onClick={() => toggle(r.id)}
                      >
                        <td className="px-3 py-1.5">
                          {isOpen
                            ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                        </td>
                        <td className="px-3 py-1.5">{r.esSaldoInicial ? 'Saldo inicial' : 'Nota de venta'}</td>
                        <td className="px-3 py-1.5 font-mono">{padDoc(r.folio)}</td>
                        <td className="px-2 py-1.5 text-center tabular-nums">1</td>
                        <td className="px-3 py-1.5 whitespace-nowrap">{fmtDate(r.fecha)}</td>
                        <td className={`px-3 py-1.5 whitespace-nowrap ${r.vencido ? 'text-destructive font-semibold' : ''}`}>
                          {r.vencimiento ? fmtDate(r.vencimiento) : fmtDate(r.fecha)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{fmt(r.total)}</td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.abonado > 0 ? fmt(r.abonado) : fmt(0)}
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums font-semibold">{fmt(r.saldo)}</td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/20">
                          <td />
                          <td colSpan={8} className="px-4 py-2">
                            {detalle === 'loading' || !detalle ? (
                              <p className="text-[11px] text-muted-foreground py-2">Cargando detalle…</p>
                            ) : (
                              <div className="space-y-3">
                                <div>
                                  <h5 className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Productos</h5>
                                  {detalle.lineas.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground">Sin líneas.</p>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead className="text-muted-foreground border-b border-border/60">
                                        <tr>
                                          <th className="text-left py-1 font-medium">Producto</th>
                                          <th className="text-right py-1 font-medium w-16">Cant</th>
                                          <th className="text-center py-1 font-medium w-10">Ud</th>
                                          <th className="text-right py-1 font-medium w-20">Precio</th>
                                          <th className="text-right py-1 font-medium w-14">Desc %</th>
                                          <th className="text-right py-1 font-medium w-20">Total</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detalle.lineas.map((l: any) => (
                                          <tr key={l.id} className="border-b border-border/40">
                                            <td className="py-1">{l.productos?.nombre ?? '—'}</td>
                                            <td className="py-1 text-right tabular-nums">{l.cantidad}</td>
                                            <td className="py-1 text-center text-muted-foreground">{l.unidades?.abreviatura ?? '—'}</td>
                                            <td className="py-1 text-right tabular-nums">{fmt(l.precio_unitario)}</td>
                                            <td className="py-1 text-right tabular-nums text-muted-foreground">{Number(l.descuento_pct ?? 0)}%</td>
                                            <td className="py-1 text-right tabular-nums font-medium">{fmt(l.total)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                                <div>
                                  <h5 className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Pagos</h5>
                                  {detalle.pagos.length === 0 ? (
                                    <p className="text-[11px] text-muted-foreground">Sin pagos aplicados.</p>
                                  ) : (
                                    <table className="w-full text-[11px]">
                                      <thead className="text-muted-foreground border-b border-border/60">
                                        <tr>
                                          <th className="text-left py-1 font-medium">Fecha</th>
                                          <th className="text-left py-1 font-medium">Método</th>
                                          <th className="text-left py-1 font-medium">Referencia</th>
                                          <th className="text-right py-1 font-medium w-24">Monto</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detalle.pagos.map((p: any) => (
                                          <tr key={p.id} className="border-b border-border/40">
                                            <td className="py-1">{p.cobros?.fecha ? fmtDate(p.cobros.fecha) : '—'}</td>
                                            <td className="py-1 capitalize">{p.cobros?.metodo_pago ?? '—'}</td>
                                            <td className="py-1 text-muted-foreground">{p.cobros?.referencia ?? '—'}</td>
                                            <td className="py-1 text-right tabular-nums font-medium">{fmt(p.monto_aplicado)}</td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
                <tr className="border-t border-dashed border-border/80 text-[12px]">
                  <td />
                  <td colSpan={5} />
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-t border-border">{fmt(g.cargos)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-t border-border">{fmt(g.abonos)}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold border-t border-border">{fmt(g.saldos)}</td>
                </tr>
              </Fragment>
            ))}
            {!isLoading && grupos.length === 0 && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Sin saldos pendientes</td></tr>
            )}
            {isLoading && (
              <tr><td colSpan={9} className="text-center py-8 text-muted-foreground">Cargando…</td></tr>
            )}
          </tbody>
          {grupos.length > 0 && (
            <tfoot>
              <tr className="border-t-2 border-border font-bold bg-accent/20">
                <td className="px-3 py-2" colSpan={6}>TOTAL GENERAL</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalCargos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalAbonos)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(totalSaldos)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {pdfBlob && (
        <DocumentPreviewModal
          open={showPdf}
          onClose={() => setShowPdf(false)}
          blob={pdfBlob}
          fileName={pdfName}
          caption="Cuentas por Cobrar"
        />
      )}
    </div>
  );
}

function Card({ label, value, tone = 'default' }: { label: string; value: string; tone?: 'default' | 'primary' | 'danger' | 'muted' }) {
  const styles = {
    default: 'bg-card border-border text-foreground',
    primary: 'bg-primary/10 border-primary/20 text-primary',
    danger: 'bg-destructive/10 border-destructive/30 text-destructive',
    muted: 'bg-muted border-border text-muted-foreground',
  }[tone];
  return (
    <div className={`border rounded-lg p-2 text-center ${styles}`}>
      <div className="text-[9px] uppercase tracking-wide opacity-80 font-semibold">{label}</div>
      <div className="text-base font-bold tabular-nums">{value}</div>
    </div>
  );
}
