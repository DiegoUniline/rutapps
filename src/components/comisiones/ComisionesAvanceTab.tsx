import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { Calendar } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { cn, fmtDate } from '@/lib/utils';

interface VendedorRow {
  id: string;
  nombre: string;
  comision_esquema_id: string | null;
  esquema: { id: string; nombre: string; tipo: string; base: string; config: any } | null;
}

function iso(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}
function defaultRange() {
  const now = new Date();
  return { desde: iso(new Date(now.getFullYear(), now.getMonth(), 1)), hasta: iso(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
}

export default function ComisionesAvanceTab() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const init = defaultRange();
  const [desde, setDesde] = useState<string>(init.desde);
  const [hasta, setHasta] = useState<string>(init.hasta);

  const setPreset = (preset: 'mes' | 'mes_ant' | 'semana' | 'quincena' | 'anio') => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    if (preset === 'mes') { setDesde(iso(new Date(y, m, 1))); setHasta(iso(new Date(y, m + 1, 0))); }
    else if (preset === 'mes_ant') { setDesde(iso(new Date(y, m - 1, 1))); setHasta(iso(new Date(y, m, 0))); }
    else if (preset === 'semana') {
      const day = now.getDay(); const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(y, m, d + diff); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      setDesde(iso(mon)); setHasta(iso(sun));
    } else if (preset === 'quincena') {
      if (d <= 15) { setDesde(iso(new Date(y, m, 1))); setHasta(iso(new Date(y, m, 15))); }
      else { setDesde(iso(new Date(y, m, 16))); setHasta(iso(new Date(y, m + 1, 0))); }
    } else if (preset === 'anio') { setDesde(iso(new Date(y, 0, 1))); setHasta(iso(new Date(y, 11, 31))); }
  };

  // Todos los vendedores activos (con o sin esquema)
  const { data: vendedores, isLoading: loadVend } = useQuery({
    queryKey: ['vendedores-avance-todos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, nombre, comision_esquema_id, esquema:comision_esquemas!comision_esquema_id(id, nombre, tipo, base, config)' as any)
        .eq('empresa_id', empresa!.id).eq('estado', 'activo')
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as any as VendedorRow[];
    },
  });

  // Calculo de comisión (solo aplica si tienen esquema)
  const { data: calculos, isLoading: loadCalc } = useQuery({
    queryKey: ['comisiones-avance-calc', empresa?.id, desde, hasta, (vendedores ?? []).map(v => v.id).join(',')],
    enabled: !!empresa?.id && !!vendedores && vendedores.length > 0,
    queryFn: async () => {
      const out: Record<string, any> = {};
      const vList = vendedores ?? [];
      const sinEsquema = vList.filter(v => !v.comision_esquema_id);
      const conEsquema = vList.filter(v => v.comision_esquema_id);

      // BATCH: una sola query para todos los vendedores sin esquema
      if (sinEsquema.length > 0) {
        const ids = sinEsquema.map(v => v.id);
        const { data: vc, error: vcErr } = await (supabase as any).from('venta_comisiones')
          .select('vendedor_id, monto_venta, comision_monto, venta_id')
          .eq('empresa_id', empresa!.id)
          .in('vendedor_id', ids)
          .gte('fecha_venta', desde).lte('fecha_venta', hasta);
        if (vcErr) console.error('venta_comisiones', vcErr);
        const byVend = new Map<string, Array<{ monto_venta: number | null; comision_monto: number | null; venta_id: string }>>();
        for (const r of (vc ?? []) as any[]) {
          const arr = byVend.get(r.vendedor_id) ?? [];
          arr.push(r); byVend.set(r.vendedor_id, arr);
        }
        for (const v of sinEsquema) {
          const rows = byVend.get(v.id) ?? [];
          const totalVenta = rows.reduce((s, r) => s + Number(r.monto_venta ?? 0), 0);
          const totalComision = rows.reduce((s, r) => s + Number(r.comision_monto ?? 0), 0);
          const numVentas = new Set(rows.map(r => r.venta_id)).size;
          out[v.id] = {
            total_ventas: totalVenta, num_ventas: numVentas, comision: totalComision,
            sin_esquema: true, por_reglas: rows.length > 0,
          };
        }
      }

      // PARALELO: RPCs de vendedores con esquema en paralelo
      const results = await Promise.all(conEsquema.map(v =>
        (supabase as any).rpc('calcular_comision_volumen', {
          p_vendedor_id: v.id, p_desde: desde, p_hasta: hasta,
        }).then((r: any) => ({ id: v.id, data: r.data, error: r.error }))
      ));
      for (const r of results) {
        out[r.id] = r.error ? { error: r.error.message } : r.data;
      }
      return out;
    },
  });

  const ranking = useMemo(() => {
    return [...(vendedores ?? [])]
      .map(v => ({ v, c: (calculos ?? {})[v.id] }))
      .sort((a, b) => (b.c?.total_ventas ?? 0) - (a.c?.total_ventas ?? 0));
  }, [vendedores, calculos]);

  if (loadVend) return <TableSkeleton />;
  if (!vendedores || vendedores.length === 0) {
    return (
      <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
        No hay vendedores activos.
      </div>
    );
  }

  const sumComision = ranking.reduce((s, r) => s + (r.c?.comision ?? 0), 0);
  const sumVentas = ranking.reduce((s, r) => s + (r.c?.total_ventas ?? 0), 0);
  const sumNumV = ranking.reduce((s, r) => s + (r.c?.num_ventas ?? 0), 0);
  const conEsquema = ranking.filter(r => !r.c?.sin_esquema).length;

  return (
    <div className="space-y-3">
      {/* Filtros de periodo */}
      <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded p-2">
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} />
        <div className="h-6 w-px bg-border mx-1" />
        <button onClick={() => setPreset('semana')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Semana</button>
        <button onClick={() => setPreset('quincena')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Quincena</button>
        <button onClick={() => setPreset('mes')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Mes actual</button>
        <button onClick={() => setPreset('mes_ant')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Mes anterior</button>
        <button onClick={() => setPreset('anio')} className="px-2 py-1 text-xs bg-white border border-border hover:bg-primary hover:text-primary-foreground hover:border-primary rounded">Año</button>
        <span className="ml-auto text-xs text-muted-foreground">{fmtDate(desde)} a {fmtDate(hasta)}</span>
      </div>

      {/* Resumen compacto en barra */}
      <div className="bg-card border border-border rounded p-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <ResumenCell label="Ventas del equipo" value={fmt(sumVentas)} />
        <ResumenCell label="Comisiones del equipo" value={fmt(sumComision)} highlight />
        <ResumenCell label="# Ventas totales" value={`${sumNumV}`} />
        <ResumenCell label="Vendedores" value={`${ranking.length}`} sub={`${conEsquema} con esquema`} />
      </div>

      {loadCalc && <TableSkeleton />}

      {/* Tabla principal */}
      {!loadCalc && (
        <div className="bg-card border border-border rounded overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-primary/5 border-b border-border">
                <tr>
                  <th className="th-odoo text-left w-10">#</th>
                  <th className="th-odoo text-left">Vendedor</th>
                  <th className="th-odoo text-left">Esquema</th>
                  <th className="th-odoo text-right">Vendido</th>
                  <th className="th-odoo text-right"># Ventas</th>
                  <th className="th-odoo text-right">Comisión</th>
                  <th className="th-odoo text-left w-[28%]">Avance</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(({ v, c }, idx) => (
                  <VendedorRowComp key={v.id} vendedor={v} calc={c} rank={idx + 1} fmt={fmt} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ResumenCell({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
      <div className={cn('text-base font-semibold font-mono truncate', highlight && 'text-primary')}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground truncate">{sub}</div>}
    </div>
  );
}

function VendedorRowComp({ vendedor, calc, rank, fmt }: { vendedor: VendedorRow; calc: any; rank: number; fmt: (n: number) => string }) {
  const esquema = vendedor.esquema;
  const total = calc?.total_ventas ?? 0;
  const numV = calc?.num_ventas ?? 0;
  const comision = calc?.comision ?? 0;
  const sinEsquema = (calc?.sin_esquema || !esquema) && !calc?.por_reglas;
  const porReglas = !!calc?.por_reglas;

  let meta = 0;
  let metaLabel = '—';
  let metaPct = 0;
  let alcanzado = false;
  let faltante: string | null = null;
  let pctGanado: string | null = null;

  if (esquema?.tipo === 'bono_meta') {
    meta = Number(esquema.config?.meta ?? 0);
    metaPct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
    alcanzado = total >= meta && meta > 0;
    metaLabel = `Meta ${fmt(meta)}`;
    faltante = alcanzado ? `Excedente ${fmt(total - meta)}` : `Faltan ${fmt(meta - total)}`;
    pctGanado = total > 0 ? `${((comision / total) * 100).toFixed(2)}% efectivo` : null;
  } else if (esquema?.tipo === 'volumen_tiers') {
    const tiers: any[] = esquema.config?.tiers ?? [];
    const sorted = [...tiers].sort((a, b) => (a.desde ?? 0) - (b.desde ?? 0));
    const current = sorted.find(t => total >= (t.desde ?? 0) && (t.hasta == null || total <= Number(t.hasta)));
    const next = sorted.find(t => (t.desde ?? 0) > total);
    if (next) {
      meta = Number(next.desde ?? 0);
      metaPct = meta > 0 ? Math.min(100, (total / meta) * 100) : 0;
      metaLabel = `Escalón ${current?.pct ?? 0}% → ${next.pct ?? 0}% en ${fmt(meta)}`;
      faltante = `Faltan ${fmt(meta - total)} para subir`;
    } else if (current) {
      metaPct = 100;
      alcanzado = true;
      metaLabel = `Escalón máximo ${current.pct ?? 0}%`;
    }
    pctGanado = current ? `Ganando ${current.pct ?? 0}%` : null;
  } else if (esquema?.tipo === 'volumen_pct') {
    const pct = Number(esquema.config?.pct ?? 0);
    metaLabel = `${pct}% sobre ${esquema.base === 'cobradas' ? 'cobradas' : 'todas'}`;
    metaPct = 100;
    pctGanado = `${pct}% fijo`;
  }

  const tipoLabel = esquema?.tipo === 'bono_meta' ? 'Bono por meta'
    : esquema?.tipo === 'volumen_tiers' ? 'Volumen por escalones'
    : esquema?.tipo === 'volumen_pct' ? '% sobre volumen'
    : porReglas ? 'Comisión por reglas de lista'
    : 'Sin esquema';

  if (porReglas) {
    pctGanado = total > 0 ? `${((comision / total) * 100).toFixed(2)}% efectivo` : null;
    metaLabel = 'Comisión por reglas de lista de precios';
    metaPct = 100;
  }

  const barGradient = alcanzado
    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
    : metaPct >= 75
    ? 'bg-gradient-to-r from-amber-400 to-amber-600'
    : metaPct >= 25
    ? 'bg-gradient-to-r from-primary/70 to-primary'
    : 'bg-gradient-to-r from-primary/50 to-primary/80';

  return (
    <tr className="border-b border-border last:border-0 hover:bg-primary/5">
      <td className="td-odoo text-xs text-muted-foreground font-mono">{rank}</td>
      <td className="td-odoo">
        <div className="font-medium text-sm">{vendedor.nombre}</div>
      </td>
      <td className="td-odoo">
        <div className="text-xs">{tipoLabel}</div>
        {esquema && <div className="text-[11px] text-muted-foreground truncate">{esquema.nombre}</div>}
      </td>
      <td className="td-odoo text-right font-mono text-sm font-semibold">{fmt(total)}</td>
      <td className="td-odoo text-right font-mono text-sm">{numV}</td>
      <td className={cn('td-odoo text-right font-mono text-sm font-semibold',
        sinEsquema ? 'text-muted-foreground' : alcanzado ? 'text-emerald-600' : 'text-primary')}>
        {sinEsquema ? '—' : fmt(comision)}
        {!sinEsquema && pctGanado && (
          <div className="text-[10px] text-muted-foreground font-normal">{pctGanado}</div>
        )}
      </td>
      <td className="td-odoo py-3">
        {sinEsquema ? (
          <span className="text-xs text-muted-foreground italic">Sin esquema asignado</span>
        ) : (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-muted-foreground truncate">{metaLabel}</span>
              <span className={cn(
                'font-mono font-bold shrink-0 px-1.5 py-0.5 rounded text-[11px]',
                alcanzado ? 'bg-emerald-100 text-emerald-700' : metaPct >= 75 ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
              )}>{metaPct.toFixed(0)}%</span>
            </div>
            <div className="relative h-2.5 bg-primary/5 rounded-full overflow-hidden border border-primary/10">
              <div
                className={cn('h-full transition-all rounded-full shadow-sm', barGradient)}
                style={{ width: `${Math.max(metaPct, 2)}%` }}
              />
            </div>
            {faltante && <div className="text-[11px] text-muted-foreground">{faltante}</div>}
          </div>
        )}
      </td>
    </tr>
  );
}
