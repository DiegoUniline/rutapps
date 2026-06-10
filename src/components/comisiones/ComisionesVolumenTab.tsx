import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, FileText, Calendar } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, todayLocal } from '@/lib/utils';

type Periodo = 'semanal' | 'quincenal' | 'mensual';

interface VendedorEsquema {
  id: string;
  nombre: string;
  comision_esquema_id: string;
  esquema: {
    id: string; nombre: string; tipo: string; periodo: Periodo; base: string; config: any;
  };
}

function periodoRange(periodo: Periodo, ref: Date): { desde: string; hasta: string; label: string } {
  const y = ref.getFullYear(), m = ref.getMonth(), d = ref.getDate();
  if (periodo === 'mensual') {
    const desde = new Date(y, m, 1);
    const hasta = new Date(y, m + 1, 0);
    return { desde: iso(desde), hasta: iso(hasta), label: desde.toLocaleDateString('es-MX', { month: 'long', year: 'numeric' }) };
  }
  if (periodo === 'quincenal') {
    if (d <= 15) {
      const desde = new Date(y, m, 1), hasta = new Date(y, m, 15);
      return { desde: iso(desde), hasta: iso(hasta), label: `1ª quincena ${desde.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}` };
    }
    const desde = new Date(y, m, 16), hasta = new Date(y, m + 1, 0);
    return { desde: iso(desde), hasta: iso(hasta), label: `2ª quincena ${desde.toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}` };
  }
  // semanal — lunes a domingo
  const day = ref.getDay();
  const diffToMon = day === 0 ? -6 : 1 - day;
  const monday = new Date(y, m, d + diffToMon);
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  return { desde: iso(monday), hasta: iso(sunday), label: `Semana ${fmtDate(iso(monday))} - ${fmtDate(iso(sunday))}` };
}

function shiftPeriodo(periodo: Periodo, ref: Date, dir: -1 | 1): Date {
  const r = new Date(ref);
  if (periodo === 'mensual') { r.setMonth(r.getMonth() + dir); return r; }
  if (periodo === 'quincenal') {
    if (dir === 1) {
      if (r.getDate() <= 15) r.setDate(16);
      else { r.setMonth(r.getMonth() + 1); r.setDate(1); }
    } else {
      if (r.getDate() <= 15) { r.setMonth(r.getMonth() - 1); r.setDate(16); }
      else { r.setDate(1); }
    }
    return r;
  }
  r.setDate(r.getDate() + dir * 7);
  return r;
}

function iso(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

export default function ComisionesVolumenTab({ onAfterGenerar }: { onAfterGenerar?: () => void }) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [refDate, setRefDate] = useState<Date>(new Date());

  const { data: vendedores, isLoading: loadVend } = useQuery({
    queryKey: ['vendedores-con-esquema', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, nombre, comision_esquema_id, esquema:comision_esquemas!comision_esquema_id(id, nombre, tipo, periodo, base, config)' as any)
        .eq('empresa_id', empresa!.id).eq('estado', 'activo')
        .not('comision_esquema_id', 'is', null)
        .order('nombre');
      if (error) throw error;
      return (data ?? []).filter((v: any) => v.esquema) as any as VendedorEsquema[];
    },
  });

  const { data: calculos, isLoading: loadCalc, refetch } = useQuery({
    queryKey: ['comisiones-volumen-calc', empresa?.id, refDate.toISOString().slice(0, 10), (vendedores ?? []).map(v => v.id).join(',')],
    enabled: !!empresa?.id && !!vendedores && vendedores.length > 0,
    queryFn: async () => {
      const out: Record<string, any> = {};
      for (const v of vendedores ?? []) {
        const range = periodoRange(v.esquema.periodo, refDate);
        const { data, error } = await (supabase as any).rpc('calcular_comision_volumen', {
          p_vendedor_id: v.id, p_desde: range.desde, p_hasta: range.hasta,
        });
        if (error) { out[v.id] = { error: error.message, range }; continue; }
        out[v.id] = { ...data, range };
      }
      return out;
    },
  });

  const generarMut = useMutation({
    mutationFn: async (vars: { vendedor_id: string; desde: string; hasta: string }) => {
      const { data, error } = await (supabase as any).rpc('generar_recibo_volumen', {
        p_vendedor_id: vars.vendedor_id,
        p_desde: vars.desde,
        p_hasta: vars.hasta,
        p_fecha_corte: todayLocal(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success('Recibo de volumen generado');
      qc.invalidateQueries({ queryKey: ['comisiones-volumen-calc'] });
      qc.invalidateQueries({ queryKey: ['pago_comisiones'] });
      refetch();
      onAfterGenerar?.();
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Para mostrar un mismo header de periodo cuando todos comparten, agrupar:
  const grouped = useMemo(() => {
    const map = new Map<string, VendedorEsquema[]>();
    (vendedores ?? []).forEach(v => {
      const r = periodoRange(v.esquema.periodo, refDate);
      const key = `${v.esquema.periodo}|${r.desde}|${r.hasta}|${r.label}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(v);
    });
    return Array.from(map.entries());
  }, [vendedores, refDate]);

  if (loadVend) return <TableSkeleton />;
  if (!vendedores || vendedores.length === 0) {
    return (
      <div className="border border-border rounded p-8 text-center text-muted-foreground text-sm">
        No hay vendedores con esquema de volumen asignado. Configúralos en la pestaña <span className="font-medium">Esquemas</span>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap bg-card border border-border rounded p-2">
        <button onClick={() => setRefDate(d => shiftPeriodo('mensual', d, -1))} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded inline-flex items-center gap-1">
          <ChevronLeft className="h-3 w-3" /> Mes anterior
        </button>
        <button onClick={() => setRefDate(new Date())} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded">Hoy</button>
        <button onClick={() => setRefDate(d => shiftPeriodo('mensual', d, 1))} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded inline-flex items-center gap-1">
          Mes siguiente <ChevronRight className="h-3 w-3" />
        </button>
        <div className="h-6 w-px bg-border mx-1" />
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Fecha de referencia:</span>
        <input type="date" className="input-odoo text-xs py-1.5 w-36"
          value={iso(refDate)} onChange={e => setRefDate(new Date(e.target.value + 'T12:00:00'))} />
      </div>

      {loadCalc && <TableSkeleton />}

      {!loadCalc && grouped.map(([key, vends]) => {
        const sample = vends[0];
        const range = periodoRange(sample.esquema.periodo, refDate);
        return (
          <div key={key} className="border border-border rounded overflow-hidden">
            <div className="bg-muted/40 px-3 py-2 border-b border-table-border flex items-center gap-2">
              <span className="font-semibold text-sm capitalize">{range.label}</span>
              <span className="text-xs text-muted-foreground">· {sample.esquema.periodo} · {fmtDate(range.desde)} a {fmtDate(range.hasta)}</span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-table-border">
                  <th className="th-odoo text-left">Vendedor</th>
                  <th className="th-odoo text-left">Esquema</th>
                  <th className="th-odoo text-right"># ventas</th>
                  <th className="th-odoo text-right">Total vendido</th>
                  <th className="th-odoo text-left">Aplicación</th>
                  <th className="th-odoo text-right">Comisión</th>
                  <th className="th-odoo text-right">Acción</th>
                </tr>
              </thead>
              <tbody>
                {vends.map(v => {
                  const c = (calculos ?? {})[v.id];
                  const comision = c?.comision ?? 0;
                  return (
                    <tr key={v.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                      <td className="py-1.5 px-3 text-xs font-medium">{v.nombre}</td>
                      <td className="py-1.5 px-3 text-xs">{v.esquema.nombre} <span className="text-muted-foreground">· {v.esquema.base === 'cobradas' ? 'cobradas' : 'todas'}</span></td>
                      <td className="py-1.5 px-3 text-right font-mono text-xs">{c?.num_ventas ?? 0}</td>
                      <td className="py-1.5 px-3 text-right font-mono text-xs">{fmt(c?.total_ventas ?? 0)}</td>
                      <td className="py-1.5 px-3 text-xs">
                        {v.esquema.tipo === 'volumen_pct' && <span>{v.esquema.config?.pct ?? 0}% sobre total</span>}
                        {v.esquema.tipo === 'volumen_tiers' && <span>Escalón: <span className="font-mono">{c?.pct_aplicado ?? 0}%</span></span>}
                        {v.esquema.tipo === 'bono_meta' && (
                          c?.meta_alcanzada
                            ? <span className="text-green-600">Meta alcanzada</span>
                            : <span className="text-amber-600">Meta no alcanzada ({fmt(v.esquema.config?.meta ?? 0)})</span>
                        )}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono font-bold text-odoo-teal">{fmt(comision)}</td>
                      <td className="py-1.5 px-3 text-right">
                        <button
                          disabled={comision <= 0 || generarMut.isPending}
                          onClick={() => {
                            if (!confirm(`¿Generar recibo de ${fmt(comision)} para ${v.nombre}?`)) return;
                            generarMut.mutate({ vendedor_id: v.id, desde: c.range.desde, hasta: c.range.hasta });
                          }}
                          className="btn-odoo-primary text-xs disabled:opacity-50"
                        >
                          <FileText className="h-3 w-3" /> Generar recibo
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
