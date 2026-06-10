import { useMemo, useState } from 'react';
import { Plus, Copy, Pencil, Trash2, Target, TrendingUp, History, ChevronDown, ChevronRight } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import {
  useMetasVenta, useDeleteMeta, useDuplicarMesAnterior, useAvanceMetas, useMetasResumenAnual,
  type MetaVenta,
} from '../hooks/useMetasVenta';
import MetaFormModal from './MetaFormModal';

const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface Props {
  money: (n: number) => string;
  mode?: 'all' | 'config' | 'seguimiento';
}

export default function TabMetas({ money, mode = 'all' }: Props) {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MetaVenta | null>(null);

  const { empresa } = useAuth();
  const metasQ = useMetasVenta(year, month);
  const avanceQ = useAvanceMetas(year, month);
  const resumenQ = useMetasResumenAnual();
  const duplicar = useDuplicarMesAnterior();
  const del = useDeleteMeta();

  // catálogos para mostrar nombres
  const vendedoresQ = useQuery({
    queryKey: ['metas-tab-vendedores', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles' as any).select('id, nombre').eq('empresa_id', empresa!.id);
      return new Map(((data ?? []) as any[]).map((r) => [r.id, r.nombre as string]));
    },
  });
  const productosQ = useQuery({
    queryKey: ['metas-tab-productos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('productos' as any).select('id, nombre').eq('empresa_id', empresa!.id).limit(3000);
      return new Map(((data ?? []) as any[]).map((r) => [r.id, r.nombre as string]));
    },
  });
  const presentacionesQ = useQuery({
    queryKey: ['metas-tab-presentaciones', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('producto_presentaciones' as any).select('id, nombre').limit(3000);
      return new Map(((data ?? []) as any[]).map((r) => [r.id, r.nombre as string]));
    },
  });

  const metas = metasQ.data ?? [];
  const avance = avanceQ.data ?? [];

  const nameVendedor = (id: string | null) => id ? (vendedoresQ.data?.get(id) ?? '—') : 'Empresa (todos)';
  const nameProducto = (id: string | null) => id ? (productosQ.data?.get(id) ?? '—') : 'Todos los productos';
  const namePresentacion = (id: string | null) => id ? (presentacionesQ.data?.get(id) ?? '—') : '—';

  // Cruce meta vs real por meta individual
  const metasConAvance = useMemo(() => {
    return metas.map((m) => {
      let unidades = 0;
      let monto = 0;
      for (const a of avance) {
        if (m.vendedor_id && a.vendedor_id !== m.vendedor_id) continue;
        if (m.producto_id && a.producto_id !== m.producto_id) continue;
        if (m.presentacion_id && a.presentacion_id !== m.presentacion_id) continue;
        unidades += a.unidades;
        monto += a.monto;
      }
      const pctMonto = m.meta_monto > 0 ? (monto / Number(m.meta_monto)) * 100 : 0;
      const pctUds = Number(m.meta_unidades) > 0 ? (unidades / Number(m.meta_unidades)) * 100 : 0;
      return { meta: m, real: { unidades, monto }, pctMonto, pctUds };
    });
  }, [metas, avance]);

  const totales = useMemo(() => {
    let metaMonto = 0, realMonto = 0;
    for (const r of metasConAvance) {
      metaMonto += Number(r.meta.meta_monto);
      realMonto += r.real.monto;
    }
    const pct = metaMonto > 0 ? (realMonto / metaMonto) * 100 : 0;
    return { metaMonto, realMonto, pct };
  }, [metasConAvance]);

  // Resumen por vendedor (avance del mes)
  const porVendedor = useMemo(() => {
    const map = new Map<string, { id: string | null; nombre: string; meta: number; real: number }>();
    for (const r of metasConAvance) {
      const id = r.meta.vendedor_id;
      const k = id ?? '__empresa__';
      const ex = map.get(k) ?? { id, nombre: nameVendedor(id), meta: 0, real: 0 };
      ex.meta += Number(r.meta.meta_monto);
      ex.real += r.real.monto;
      map.set(k, ex);
    }
    return Array.from(map.values()).sort((a, b) => b.meta - a.meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metasConAvance, vendedoresQ.data]);

  const semaforo = (pct: number) =>
    pct >= 100 ? 'text-[hsl(var(--success))]'
    : pct >= 70 ? 'text-[hsl(var(--warning))]'
    : 'text-[hsl(var(--destructive))]';

  const openNew = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (m: MetaVenta) => { setEditing(m); setModalOpen(true); };

  const handleDelete = (m: MetaVenta) => {
    if (confirm('¿Eliminar esta meta?')) del.mutate(m.id);
  };

  const yearOptions = [now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1];

  return (
    <div className="space-y-4">
      {/* Selector de periodo */}
      <div className="bg-card border border-border rounded-xl p-3 flex flex-wrap items-center gap-2">
        <Target className="h-4 w-4 text-primary" />
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Periodo</span>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="text-sm border border-border rounded-md px-2 py-1 bg-background"
        >
          {MONTH_NAMES.map((n, i) => (
            <option key={i + 1} value={i + 1}>{n}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="text-sm border border-border rounded-md px-2 py-1 bg-background"
        >
          {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>

        <div className="flex-1" />

        <Button size="sm" variant="outline" onClick={() => duplicar.mutate({ year, month })} disabled={duplicar.isPending}>
          <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar mes anterior
        </Button>
        <Button size="sm" onClick={openNew}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Nueva meta
        </Button>
      </div>

      {/* Subtabs */}
      <Tabs defaultValue={mode === 'seguimiento' ? 'avance' : 'config'} className="w-full">
        <TabsList className="bg-accent/50 p-1 rounded-lg gap-1">
          {mode !== 'seguimiento' && (
            <TabsTrigger value="config" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
              <Target className="h-3.5 w-3.5 mr-2" /> Configuración
            </TabsTrigger>
          )}
          {mode !== 'config' && (
            <TabsTrigger value="avance" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
              <TrendingUp className="h-3.5 w-3.5 mr-2" /> Avance del mes
            </TabsTrigger>
          )}
          {mode !== 'config' && (
            <TabsTrigger value="historial" className="text-xs data-[state=active]:bg-primary data-[state=active]:text-primary-foreground px-3 py-2">
              <History className="h-3.5 w-3.5 mr-2" /> Historial
            </TabsTrigger>
          )}
        </TabsList>

        {/* CONFIG */}
        <TabsContent value="config" className="mt-4">
          {metasQ.isLoading ? (
            <div className="h-48 bg-accent/30 rounded-xl animate-pulse" />
          ) : metas.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Target className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <div className="text-sm font-semibold">Sin metas configuradas para {MONTH_NAMES[month - 1]} {year}</div>
              <div className="text-xs text-muted-foreground mt-1">Agrega tu primera meta o duplica las del mes anterior.</div>
              <div className="flex justify-center gap-2 mt-4">
                <Button size="sm" variant="outline" onClick={() => duplicar.mutate({ year, month })}>
                  <Copy className="h-3.5 w-3.5 mr-1" /> Duplicar mes anterior
                </Button>
                <Button size="sm" onClick={openNew}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Agregar primera meta
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-accent/30">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Vendedor</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">Presentación</th>
                      <th className="px-3 py-2 font-semibold text-right">Meta uds</th>
                      <th className="px-3 py-2 font-semibold text-right">Meta monto</th>
                      <th className="px-3 py-2 font-semibold">Notas</th>
                      <th className="px-3 py-2 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metas.map((m) => (
                      <tr key={m.id} className="border-t border-border">
                        <td className="px-3 py-2">{nameVendedor(m.vendedor_id)}</td>
                        <td className="px-3 py-2">{nameProducto(m.producto_id)}</td>
                        <td className="px-3 py-2">{namePresentacion(m.presentacion_id)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(m.meta_unidades).toLocaleString('es-MX')}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(Number(m.meta_monto))}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.notas || '—'}</td>
                        <td className="px-3 py-2 text-right">
                          <div className="inline-flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(m)}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-[hsl(var(--destructive))]" onClick={() => handleDelete(m)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </TabsContent>

        {/* AVANCE */}
        <TabsContent value="avance" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Meta total</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{money(totales.metaMonto)}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Vendido</div>
              <div className="text-2xl font-bold tabular-nums mt-1">{money(totales.realMonto)}</div>
            </div>
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Cumplimiento</div>
              <div className={cn("text-2xl font-bold tabular-nums mt-1", semaforo(totales.pct))}>{totales.pct.toFixed(1)}%</div>
              <Progress value={Math.min(100, totales.pct)} className="mt-2 h-2" />
            </div>
          </div>

          {/* Por vendedor */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Avance por vendedor</h4>
            </div>
            {porVendedor.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">Sin metas configuradas en este mes</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-accent/30">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Vendedor</th>
                    <th className="px-3 py-2 font-semibold text-right">Meta</th>
                    <th className="px-3 py-2 font-semibold text-right">Real</th>
                    <th className="px-3 py-2 font-semibold text-right">%</th>
                    <th className="px-3 py-2 font-semibold w-1/3">Progreso</th>
                  </tr>
                </thead>
                <tbody>
                  {porVendedor.map((v) => {
                    const pct = v.meta > 0 ? (v.real / v.meta) * 100 : 0;
                    return (
                      <tr key={v.id ?? 'empresa'} className="border-t border-border">
                        <td className="px-3 py-2 font-medium">{v.nombre}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(v.meta)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(v.real)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-bold", semaforo(pct))}>{pct.toFixed(1)}%</td>
                        <td className="px-3 py-2"><Progress value={Math.min(100, pct)} className="h-2" /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Detalle por meta */}
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Detalle por meta</h4>
            </div>
            {metasConAvance.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">—</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-accent/30">
                    <tr className="text-left">
                      <th className="px-3 py-2 font-semibold">Vendedor</th>
                      <th className="px-3 py-2 font-semibold">Producto</th>
                      <th className="px-3 py-2 font-semibold">Presentación</th>
                      <th className="px-3 py-2 font-semibold text-right">Meta uds</th>
                      <th className="px-3 py-2 font-semibold text-right">Real uds</th>
                      <th className="px-3 py-2 font-semibold text-right">Meta $</th>
                      <th className="px-3 py-2 font-semibold text-right">Real $</th>
                      <th className="px-3 py-2 font-semibold text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metasConAvance.map((r) => (
                      <tr key={r.meta.id} className="border-t border-border">
                        <td className="px-3 py-2">{nameVendedor(r.meta.vendedor_id)}</td>
                        <td className="px-3 py-2">{nameProducto(r.meta.producto_id)}</td>
                        <td className="px-3 py-2">{namePresentacion(r.meta.presentacion_id)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{Number(r.meta.meta_unidades).toLocaleString('es-MX')}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.real.unidades.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(Number(r.meta.meta_monto))}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(r.real.monto)}</td>
                        <td className={cn("px-3 py-2 text-right tabular-nums font-bold", semaforo(r.pctMonto))}>{r.pctMonto.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </TabsContent>

        {/* HISTORIAL */}
        <TabsContent value="historial" className="mt-4">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-3 py-2 border-b border-border">
              <h4 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Historial de metas</h4>
            </div>
            {(resumenQ.data ?? []).length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">No hay metas registradas todavía</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="bg-accent/30">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold">Periodo</th>
                    <th className="px-3 py-2 font-semibold text-right">Metas configuradas</th>
                    <th className="px-3 py-2 font-semibold text-right">Meta total $</th>
                    <th className="px-3 py-2 font-semibold text-right">Meta total uds</th>
                    <th className="px-3 py-2 font-semibold text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {(resumenQ.data ?? []).map((r) => (
                    <tr key={`${r.year}-${r.month}`} className="border-t border-border hover:bg-accent/20 cursor-pointer"
                        onClick={() => { setYear(r.year); setMonth(r.month); }}>
                      <td className="px-3 py-2 font-semibold">{MONTH_NAMES[r.month - 1]} {r.year}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.count}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">{money(r.meta)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.uds.toLocaleString('es-MX')}</td>
                      <td className="px-3 py-2 text-right">
                        <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setYear(r.year); setMonth(r.month); }}>
                          Cargar
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <MetaFormModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        year={year}
        month={month}
        editing={editing}
      />
    </div>
  );
}
