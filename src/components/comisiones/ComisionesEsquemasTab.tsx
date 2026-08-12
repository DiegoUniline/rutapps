import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { TableSkeleton } from '@/components/TableSkeleton';
import { toast } from 'sonner';
import { Plus, Trash2, Pencil, X } from 'lucide-react';
import { useCurrency } from '@/hooks/useCurrency';
import { confirmDialog } from '@/lib/confirm';

type Tipo = 'volumen_pct' | 'volumen_tiers' | 'bono_meta' | 'lista_precios';
type Periodo = 'semanal' | 'quincenal' | 'mensual';
type Base = 'cobradas' | 'todas';

interface Tier { desde: number; hasta?: number | null; pct: number }
interface EsquemaConfig { pct?: number; tiers?: Tier[]; meta?: number; bono?: number; bono_pct?: number; ajuste_pct?: number }
interface Esquema {
  id: string;
  nombre: string;
  tipo: Tipo;
  periodo: Periodo;
  base: Base;
  config: EsquemaConfig;
  activo: boolean;
}

const TIPO_LABEL: Record<Tipo, string> = {
  volumen_pct: '% fijo sobre total',
  volumen_tiers: 'Escalones por volumen',
  bono_meta: 'Bono al alcanzar meta',
  lista_precios: 'Por lista de precios',
};
const PERIODO_LABEL: Record<Periodo, string> = { semanal: 'Semanal', quincenal: 'Quincenal', mensual: 'Mensual' };
const BASE_LABEL: Record<Base, string> = { cobradas: 'Solo cobradas', todas: 'Todas las ventas' };

export default function ComisionesEsquemasTab() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Partial<Esquema> | null>(null);

  const { data: esquemas, isLoading } = useQuery({
    queryKey: ['comision-esquemas', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase.from('comision_esquemas' as any)
        .select('*').eq('empresa_id', empresa!.id).order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any as Esquema[];
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ['esquemas-vendedores', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('profiles')
        .select('id, nombre, comision_esquema_id' as any)
        .eq('empresa_id', empresa!.id).eq('estado', 'activo').order('nombre');
      return (data ?? []) as any[];
    },
  });

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editing || !empresa?.id) throw new Error('Datos incompletos');
      if (!editing.nombre?.trim()) throw new Error('Nombre requerido');
      const payload: any = {
        empresa_id: empresa.id,
        nombre: editing.nombre.trim(),
        tipo: editing.tipo,
        periodo: editing.periodo,
        base: editing.base,
        config: editing.config ?? {},
        activo: editing.activo ?? true,
      };
      if (editing.id) {
        const { error } = await supabase.from('comision_esquemas' as any).update(payload).eq('id', editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('comision_esquemas' as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Esquema guardado');
      setEditing(null);
      qc.invalidateQueries({ queryKey: ['comision-esquemas'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('comision_esquemas' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Esquema eliminado');
      qc.invalidateQueries({ queryKey: ['comision-esquemas'] });
      qc.invalidateQueries({ queryKey: ['esquemas-vendedores'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const assignMut = useMutation({
    mutationFn: async (vars: { vendedor_id: string; esquema_id: string | null }) => {
      const { error } = await supabase.from('profiles')
        .update({ comision_esquema_id: vars.esquema_id } as any)
        .eq('id', vars.vendedor_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Asignación actualizada');
      qc.invalidateQueries({ queryKey: ['esquemas-vendedores'] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const openNuevo = () => setEditing({
    nombre: '', tipo: 'volumen_pct', periodo: 'mensual', base: 'cobradas', config: { pct: 5 }, activo: true,
  });

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded p-3">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm">Esquemas de comisión por volumen</h3>
          <button onClick={openNuevo} className="btn-odoo-primary text-xs"><Plus className="h-3 w-3" /> Nuevo esquema</button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Los vendedores con un esquema de volumen asignado dejan de generar comisiones por línea de producto.
          La comisión se calcula sobre el total de ventas del periodo.
        </p>

        {isLoading ? <TableSkeleton /> : (esquemas ?? []).length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">Aún no hay esquemas creados</div>
        ) : (
          <div className="overflow-x-auto border border-border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr className="border-b border-table-border">
                  <th className="th-odoo text-left">Nombre</th>
                  <th className="th-odoo text-left">Tipo</th>
                  <th className="th-odoo text-left">Base</th>
                  <th className="th-odoo text-left">Configuración</th>
                  <th className="th-odoo text-center">Activo</th>
                  <th className="th-odoo text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {(esquemas ?? []).map(e => (
                  <tr key={e.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
                    <td className="py-1.5 px-3 text-xs font-medium">{e.nombre}</td>
                    <td className="py-1.5 px-3 text-xs">{TIPO_LABEL[e.tipo]}</td>
                    <td className="py-1.5 px-3 text-xs">{BASE_LABEL[e.base]}</td>
                    <td className="py-1.5 px-3 text-xs text-muted-foreground">{describeConfig(e, fmt)}</td>
                    <td className="py-1.5 px-3 text-center">
                      {e.activo
                        ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary">Sí</span>
                        : <span className="text-[10px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground">No</span>}
                    </td>
                    <td className="py-1.5 px-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setEditing(e)} className="p-1 hover:bg-muted rounded" title="Editar">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={async () => { if (await confirmDialog('¿Eliminar este esquema?')) deleteMut.mutate(e.id); }}
                          className="p-1 hover:bg-red-50 hover:text-red-600 rounded" title="Eliminar"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-card border border-border rounded p-3">
        <h3 className="font-semibold text-sm mb-2">Asignación por vendedor</h3>
        <p className="text-xs text-muted-foreground mb-3">
          Elige el esquema de cada vendedor. Sin esquema = sigue cobrando por producto (regla actual).
        </p>
        <div className="overflow-x-auto border border-border rounded">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="border-b border-table-border">
                <th className="th-odoo text-left">Vendedor</th>
                <th className="th-odoo text-left">Esquema de comisión</th>
              </tr>
            </thead>
            <tbody>
              {(vendedores ?? []).map((v: any) => (
                <tr key={v.id} className="border-b border-table-border last:border-0">
                  <td className="py-1.5 px-3 text-xs font-medium">{v.nombre}</td>
                  <td className="py-1.5 px-3 text-xs">
                    <select
                      className="input-odoo text-xs py-1"
                      value={v.comision_esquema_id ?? ''}
                      onChange={ev => assignMut.mutate({ vendedor_id: v.id, esquema_id: ev.target.value || null })}
                    >
                      <option value="">Por producto (regla actual)</option>
                      {(esquemas ?? []).filter(e => e.activo).map(e => (
                        <option key={e.id} value={e.id}>{e.nombre} · {TIPO_LABEL[e.tipo]}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <EsquemaModal
          esquema={editing}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => saveMut.mutate()}
          saving={saveMut.isPending}
        />
      )}
    </div>
  );
}

function describeConfig(e: Esquema, fmt: (n: number) => string): string {
  if (e.tipo === 'volumen_pct') return `${e.config?.pct ?? 0}%`;
  if (e.tipo === 'volumen_tiers') {
    const tiers = e.config?.tiers ?? [];
    return tiers.map(t => `${fmt(t.desde)}${t.hasta ? '-' + fmt(t.hasta) : '+'} → ${t.pct}%`).join(' · ') || 'Sin escalones';
  }
  if (e.tipo === 'lista_precios') {
    const aj = e.config?.ajuste_pct ?? 0;
    return aj ? `% de las reglas de listas de precios (ajuste ${aj > 0 ? '+' : ''}${aj}%)` : '% de las reglas de listas de precios';
  }
  if (e.tipo === 'bono_meta') {
    const parts: string[] = [`Meta ${fmt(e.config?.meta ?? 0)}`];
    if (e.config?.bono) parts.push(`Bono ${fmt(e.config.bono)}`);
    if (e.config?.bono_pct) parts.push(`+${e.config.bono_pct}%`);
    return parts.join(' · ');
  }
  return '';
}

function EsquemaModal({ esquema, onChange, onClose, onSave, saving }: {
  esquema: Partial<Esquema>;
  onChange: (e: Partial<Esquema>) => void;
  onClose: () => void;
  onSave: () => void;
  saving: boolean;
}) {
  const tipo = esquema.tipo as Tipo;
  const cfg = esquema.config ?? {};
  const setCfg = (patch: EsquemaConfig) => onChange({ ...esquema, config: { ...cfg, ...patch } });

  const tiers = cfg.tiers ?? [];
  const setTiers = (next: Tier[]) => setCfg({ tiers: next });

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-lg max-h-[90dvh] overflow-y-auto p-4 space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold">{esquema.id ? 'Editar esquema' : 'Nuevo esquema'}</h3>
          <button onClick={onClose} className="p-1 hover:bg-muted rounded"><X className="h-4 w-4" /></button>
        </div>

        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Nombre</label>
          <input className="input-odoo w-full" value={esquema.nombre ?? ''} onChange={e => onChange({ ...esquema, nombre: e.target.value })} placeholder="Ej: Comisión mensual estándar" />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tipo</label>
            <select className="input-odoo w-full text-xs" value={tipo} onChange={e => onChange({ ...esquema, tipo: e.target.value as Tipo, config: {} })}>
              <option value="volumen_pct">% fijo</option>
              <option value="volumen_tiers">Escalones</option>
              <option value="bono_meta">Bono por meta</option>
              <option value="lista_precios">Por lista de precios</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Base</label>
            <select className="input-odoo w-full text-xs" value={esquema.base} onChange={e => onChange({ ...esquema, base: e.target.value as Base })}>
              <option value="cobradas">Solo cobradas</option>
              <option value="todas">Todas las ventas</option>
            </select>
          </div>
          <div className="col-span-2 text-[11px] text-muted-foreground">
            El periodo ya no se fija en el esquema: en la pestaña <span className="font-medium">Por volumen</span> eliges el rango de fechas y se aplica el % sobre lo filtrado.
          </div>
        </div>

        {tipo === 'volumen_pct' && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">% sobre el total vendido</label>
            <input type="number" step="0.01" className="input-odoo w-32" value={cfg.pct ?? ''} onChange={e => setCfg({ pct: parseFloat(e.target.value) || 0 })} />
          </div>
        )}

        {tipo === 'volumen_tiers' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-muted-foreground">Escalones (se aplica el % del primer escalón que cumple)</label>
              <button type="button" className="text-xs text-primary hover:underline" onClick={() => setTiers([...tiers, { desde: 0, hasta: null, pct: 0 }])}>+ Agregar</button>
            </div>
            {tiers.length === 0 && <div className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded">Sin escalones</div>}
            {tiers.length > 0 && (
              <div className="flex items-center gap-2 px-1">
                <div className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase">Desde ($)</div>
                <div className="flex-1 text-[11px] font-semibold text-muted-foreground uppercase">Hasta ($)</div>
                <div className="w-24 text-[11px] font-semibold text-muted-foreground uppercase">%</div>
                <div className="w-6" />
              </div>
            )}
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="number" step="0.01" className="input-odoo flex-1 text-xs" placeholder="0" value={t.desde} onChange={e => { const c = [...tiers]; c[i] = { ...t, desde: parseFloat(e.target.value) || 0 }; setTiers(c); }} />
                <input type="number" step="0.01" className="input-odoo flex-1 text-xs" placeholder="∞" value={t.hasta ?? ''} onChange={e => { const c = [...tiers]; c[i] = { ...t, hasta: e.target.value === '' ? null : parseFloat(e.target.value) }; setTiers(c); }} />
                <input type="number" step="0.01" className="input-odoo w-24 text-xs" placeholder="0" value={t.pct} onChange={e => { const c = [...tiers]; c[i] = { ...t, pct: parseFloat(e.target.value) || 0 }; setTiers(c); }} />
                <button type="button" onClick={() => setTiers(tiers.filter((_, j) => j !== i))} className="p-1 hover:bg-red-50 hover:text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        )}

        {tipo === 'lista_precios' && (
          <div className="space-y-2">
            <div className="text-[11px] text-muted-foreground bg-accent/30 border border-accent/50 rounded px-3 py-2">
              La comisión se toma del % configurado en las reglas de las listas de precios de cada producto vendido en el periodo.
              Puedes verlas en la pestaña <span className="font-medium">Reglas</span>.
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Ajuste opcional sobre la comisión (%)</label>
              <input type="number" step="0.01" className="input-odoo w-32" placeholder="0"
                value={cfg.ajuste_pct ?? ''} onChange={e => setCfg({ ajuste_pct: parseFloat(e.target.value) || 0 })} />
              <div className="text-[11px] text-muted-foreground mt-1">Ej: 10 = paga 10% más de lo que dictan las reglas. Deja 0 para pagar exactamente la regla.</div>
            </div>
          </div>
        )}

        {tipo === 'bono_meta' && (
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Meta ($)</label>
              <input type="number" step="0.01" className="input-odoo w-full text-xs" value={cfg.meta ?? ''} onChange={e => setCfg({ meta: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bono fijo ($)</label>
              <input type="number" step="0.01" className="input-odoo w-full text-xs" value={cfg.bono ?? ''} onChange={e => setCfg({ bono: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">+ % sobre total</label>
              <input type="number" step="0.01" className="input-odoo w-full text-xs" value={cfg.bono_pct ?? ''} onChange={e => setCfg({ bono_pct: parseFloat(e.target.value) || 0 })} />
            </div>
            <div className="col-span-3 text-[11px] text-muted-foreground">Si el vendedor alcanza la meta, recibe el bono fijo + el % opcional sobre el total.</div>
          </div>
        )}

        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={esquema.activo ?? true} onChange={e => onChange({ ...esquema, activo: e.target.checked })} />
          Activo
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-odoo-secondary">Cancelar</button>
          <button onClick={onSave} disabled={saving} className="btn-odoo-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
        </div>
      </div>
    </div>
  );
}
