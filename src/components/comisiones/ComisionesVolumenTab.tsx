import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { FileText, Calendar } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate, todayLocal } from '@/lib/utils';
import { confirmDialog } from '@/lib/confirm';

interface VendedorEsquema {
  id: string;
  nombre: string;
  comision_esquema_id: string;
  esquema: {
    id: string; nombre: string; tipo: string; base: string; config: any;
  };
}

function iso(d: Date): string {
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - tz).toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  const desde = new Date(now.getFullYear(), now.getMonth(), 1);
  const hasta = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { desde: iso(desde), hasta: iso(hasta) };
}

export default function ComisionesVolumenTab({ onAfterGenerar }: { onAfterGenerar?: () => void }) {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
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
    }
    else if (preset === 'quincena') {
      if (d <= 15) { setDesde(iso(new Date(y, m, 1))); setHasta(iso(new Date(y, m, 15))); }
      else { setDesde(iso(new Date(y, m, 16))); setHasta(iso(new Date(y, m + 1, 0))); }
    }
    else if (preset === 'anio') { setDesde(iso(new Date(y, 0, 1))); setHasta(iso(new Date(y, 11, 31))); }
  };

  const { data: vendedores, isLoading: loadVend } = useQuery({
    queryKey: ['vendedores-con-esquema', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles')
        .select('id, nombre, comision_esquema_id, esquema:comision_esquemas!comision_esquema_id(id, nombre, tipo, base, config)' as any)
        .eq('empresa_id', empresa!.id).eq('estado', 'activo')
        .not('comision_esquema_id', 'is', null)
        .order('nombre');
      if (error) throw error;
      return (data ?? []).filter((v: any) => v.esquema) as any as VendedorEsquema[];
    },
  });

  const { data: calculos, isLoading: loadCalc, refetch } = useQuery({
    queryKey: ['comisiones-volumen-calc', empresa?.id, desde, hasta, (vendedores ?? []).map(v => v.id).join(',')],
    enabled: !!empresa?.id && !!vendedores && vendedores.length > 0,
    queryFn: async () => {
      const out: Record<string, any> = {};
      for (const v of vendedores ?? []) {
        const { data, error } = await (supabase as any).rpc('calcular_comision_volumen', {
          p_vendedor_id: v.id, p_desde: desde, p_hasta: hasta,
        });
        if (error) { out[v.id] = { error: error.message }; continue; }
        out[v.id] = data;
      }
      return out;
    },
  });

  const generarMut = useMutation({
    mutationFn: async (vars: { vendedor_id: string }) => {
      const { data, error } = await (supabase as any).rpc('generar_recibo_volumen', {
        p_vendedor_id: vars.vendedor_id,
        p_desde: desde,
        p_hasta: hasta,
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
        <Calendar className="h-4 w-4 text-muted-foreground" />
        <DateRangePicker from={desde} to={hasta} onChange={(f, t) => { setDesde(f); setHasta(t); }} />
        <div className="h-6 w-px bg-border mx-1" />
        <button onClick={() => setPreset('semana')} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded">Semana</button>
        <button onClick={() => setPreset('quincena')} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded">Quincena</button>
        <button onClick={() => setPreset('mes')} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded">Mes actual</button>
        <button onClick={() => setPreset('mes_ant')} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded">Mes anterior</button>
        <button onClick={() => setPreset('anio')} className="px-2 py-1 text-xs bg-muted hover:bg-muted/70 rounded">Año</button>
      </div>

      {loadCalc && <TableSkeleton />}

      {!loadCalc && (
        <div className="border border-border rounded overflow-hidden">
          <div className="bg-muted/40 px-3 py-2 border-b border-table-border flex items-center gap-2">
            <span className="font-semibold text-sm">Comisión sobre ventas filtradas</span>
            <span className="text-xs text-muted-foreground">· {fmtDate(desde)} a {fmtDate(hasta)}</span>
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
              {(vendedores ?? []).map(v => {
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
                      {c?.desde_efectivo && c.desde_efectivo > desde && (
                        <div className="text-[11px] text-amber-600 mt-0.5">
                          El esquema aplica desde {fmtDate(c.desde_efectivo)}; las ventas previas no se consideran.
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono font-bold text-odoo-teal">{fmt(comision)}</td>
                    <td className="py-1.5 px-3 text-right">
                      <button
                        disabled={comision <= 0 || generarMut.isPending}
                        onClick={async () => {
                          if (!await confirmDialog(`¿Generar recibo de ${fmt(comision)} para ${v.nombre}?\nRango: ${fmtDate(desde)} a ${fmtDate(hasta)}`)) return;
                          generarMut.mutate({ vendedor_id: v.id });
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
      )}
    </div>
  );
}
