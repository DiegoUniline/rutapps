import { useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Pencil, Trash2, Play, FileSpreadsheet, FileText, FileDown, ArrowUp, ArrowDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildExportColumns,
  exportToCSV,
  runReporte,
  getFuenteMeta,
  FUENTES,
  type ReporteConfig,
  type ReporteFiltros,
  type ReporteFuente,
} from '@/lib/reportesPersonalizados';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';

export default function ReportesPersonalizadosPage() {
  const { user, empresa } = useAuth();
  const qc = useQueryClient();
  const empresaId = empresa?.id;

  const [editorOpen, setEditorOpen] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  const [editing, setEditing] = useState<ReporteConfig | null>(null);
  const [running, setRunning] = useState<ReporteConfig | null>(null);

  const { data: reportes = [], isLoading } = useQuery({
    queryKey: ['reportes-personalizados', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reportes_personalizados')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const saveMutation = useMutation({
    mutationFn: async (cfg: ReporteConfig) => {
      if (!empresaId) throw new Error('Sin empresa');
      if (cfg.id) {
        const { error } = await supabase.from('reportes_personalizados').update({
          nombre: cfg.nombre,
          descripcion: cfg.descripcion,
          fuente: cfg.fuente,
          columnas: cfg.columnas as any,
          filtros_default: (cfg.filtros_default ?? {}) as any,
          updated_at: new Date().toISOString(),
        }).eq('id', cfg.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('reportes_personalizados').insert({
          empresa_id: empresaId,
          nombre: cfg.nombre,
          descripcion: cfg.descripcion,
          fuente: cfg.fuente,
          columnas: cfg.columnas as any,
          filtros_default: (cfg.filtros_default ?? {}) as any,
          created_by: user?.id ?? null,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success('Reporte guardado');
      qc.invalidateQueries({ queryKey: ['reportes-personalizados'] });
      setEditorOpen(false);
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al guardar'),
  });

  const delMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reportes_personalizados').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Reporte eliminado');
      qc.invalidateQueries({ queryKey: ['reportes-personalizados'] });
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al eliminar'),
  });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reportes Personalizados</h1>
          <p className="text-sm text-muted-foreground">
            Construye reportes a la medida de tu empresa: elige las columnas y filtros que necesitas.
          </p>
        </div>
        <Button onClick={() => { setEditing({ nombre: '', fuente: 'ventas', columnas: [] }); setEditorOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo reporte
        </Button>
      </header>

      <Card className="p-0 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr className="text-left">
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Fuente</th>
              <th className="px-3 py-2">Columnas</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
            )}
            {!isLoading && reportes.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Aún no hay reportes. Crea el primero.</td></tr>
            )}
            {reportes.map((r) => (
              <tr key={r.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.nombre}</div>
                  {r.descripcion && <div className="text-xs text-muted-foreground">{r.descripcion}</div>}
                </td>
                <td className="px-3 py-2 capitalize">{r.fuente}</td>
                <td className="px-3 py-2 text-muted-foreground">{(r.columnas ?? []).length}</td>
                <td className="px-3 py-2 text-right space-x-1">
                  <Button size="sm" variant="default" onClick={() => { setRunning({ ...r }); setRunOpen(true); }}>
                    <Play className="w-3.5 h-3.5 mr-1" /> Ejecutar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditing({ ...r }); setEditorOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => {
                    if (confirm('¿Eliminar este reporte?')) delMutation.mutate(r.id);
                  }}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {editorOpen && editing && (
        <EditorDialog
          open={editorOpen}
          onClose={() => setEditorOpen(false)}
          config={editing}
          onChange={setEditing}
          onSave={() => saveMutation.mutate(editing)}
          saving={saveMutation.isPending}
        />
      )}

      {runOpen && running && (
        <RunDialog
          open={runOpen}
          onClose={() => setRunOpen(false)}
          config={running}
          empresaId={empresaId!}
          empresaNombre={empresa?.nombre ?? ''}
        />
      )}
    </div>
  );
}

// ─── Editor Dialog ─────────────────────────────────────────────
function EditorDialog({ open, onClose, config, onChange, onSave, saving }: {
  open: boolean; onClose: () => void; config: ReporteConfig;
  onChange: (c: ReporteConfig) => void; onSave: () => void; saving: boolean;
}) {
  const allCampos = CAMPOS_VENTAS;
  const selectedKeys = new Set(config.columnas.map(c => c.key));

  const toggle = (key: string) => {
    if (selectedKeys.has(key)) {
      onChange({ ...config, columnas: config.columnas.filter(c => c.key !== key) });
    } else {
      onChange({ ...config, columnas: [...config.columnas, { key }] });
    }
  };

  const move = (idx: number, dir: -1 | 1) => {
    const next = [...config.columnas];
    const swap = idx + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[idx], next[swap]] = [next[swap], next[idx]];
    onChange({ ...config, columnas: next });
  };

  const renameCol = (idx: number, header: string) => {
    const next = [...config.columnas];
    next[idx] = { ...next[idx], header };
    onChange({ ...config, columnas: next });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto z-[60]">
        <DialogHeader>
          <DialogTitle>{config.id ? 'Editar reporte' : 'Nuevo reporte personalizado'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nombre *</Label>
              <Input value={config.nombre} onChange={(e) => onChange({ ...config, nombre: e.target.value })} placeholder="Ej. Layout Integración Venta" />
            </div>
            <div>
              <Label>Fuente</Label>
              <Input value="Ventas (líneas)" disabled />
            </div>
          </div>
          <div>
            <Label>Descripción</Label>
            <Textarea rows={2} value={config.descripcion ?? ''} onChange={(e) => onChange({ ...config, descripcion: e.target.value })} placeholder="Para qué se usa este reporte…" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <h3 className="font-semibold mb-2 text-sm">Campos disponibles</h3>
              <div className="border rounded max-h-80 overflow-y-auto divide-y">
                {allCampos.map(c => (
                  <label key={c.key} className="flex items-start gap-2 p-2 hover:bg-muted/30 cursor-pointer">
                    <Checkbox checked={selectedKeys.has(c.key)} onCheckedChange={() => toggle(c.key)} className="mt-0.5" />
                    <div className="flex-1">
                      <div className="text-sm">{c.label}</div>
                      {c.hint && <div className="text-xs text-muted-foreground">{c.hint}</div>}
                    </div>
                    <span className="text-[10px] uppercase text-muted-foreground self-center">{c.format}</span>
                  </label>
                ))}
              </div>
            </div>
            <div>
              <h3 className="font-semibold mb-2 text-sm">Columnas del reporte ({config.columnas.length})</h3>
              <div className="border rounded max-h-80 overflow-y-auto divide-y">
                {config.columnas.length === 0 && (
                  <div className="p-4 text-sm text-muted-foreground text-center">Selecciona campos de la izquierda.</div>
                )}
                {config.columnas.map((col, idx) => {
                  const def = allCampos.find(c => c.key === col.key);
                  return (
                    <div key={col.key} className="p-2 flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                      <Input
                        value={col.header ?? def?.label ?? col.key}
                        onChange={(e) => renameCol(idx, e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, -1)}><ArrowUp className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, 1)}><ArrowDown className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => toggle(col.key)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <h3 className="font-semibold mb-2 text-sm">Filtros por defecto (opcional)</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <div>
                <Label className="text-xs">Estado</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {STATUS_OPTS.map(s => {
                    const active = (config.filtros_default?.status ?? []).includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => {
                          const arr = new Set(config.filtros_default?.status ?? []);
                          active ? arr.delete(s) : arr.add(s);
                          onChange({ ...config, filtros_default: { ...config.filtros_default, status: Array.from(arr) } });
                        }}
                        className={`text-xs px-2 py-0.5 rounded border ${active ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      >{s}</button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label className="text-xs">Tipo</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {TIPO_OPTS.map(s => {
                    const active = (config.filtros_default?.tipo ?? []).includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => {
                          const arr = new Set(config.filtros_default?.tipo ?? []);
                          active ? arr.delete(s) : arr.add(s);
                          onChange({ ...config, filtros_default: { ...config.filtros_default, tipo: Array.from(arr) } });
                        }}
                        className={`text-xs px-2 py-0.5 rounded border ${active ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      >{s}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onSave} disabled={saving || !config.nombre.trim() || config.columnas.length === 0}>
            {saving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Run Dialog ────────────────────────────────────────────────
function RunDialog({ open, onClose, config, empresaId, empresaNombre }: {
  open: boolean; onClose: () => void; config: ReporteConfig; empresaId: string; empresaNombre: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(); firstDay.setDate(1);
  const [filtros, setFiltros] = useState<ReporteFiltros>({
    fechaDesde: firstDay.toISOString().slice(0, 10),
    fechaHasta: today,
    status: config.filtros_default?.status,
    tipo: config.filtros_default?.tipo,
  });
  const [loading, setLoading] = useState<null | 'xlsx' | 'csv' | 'pdf'>(null);

  const run = async (kind: 'xlsx' | 'csv' | 'pdf') => {
    try {
      setLoading(kind);
      const rows = await runReporte(config, filtros, empresaId);
      if (rows.length === 0) {
        toast.info('Sin datos para los filtros seleccionados');
        return;
      }
      const columns = buildExportColumns(config);
      const fileName = `${config.nombre.replace(/\s+/g, '_')}_${filtros.fechaDesde}_${filtros.fechaHasta}`;
      if (kind === 'xlsx') {
        exportToExcel({ fileName, title: config.nombre, columns, data: rows, empresa: empresaNombre, dateRange: { from: filtros.fechaDesde!, to: filtros.fechaHasta! } });
      } else if (kind === 'csv') {
        exportToCSV({ fileName, columns, data: rows });
      } else {
        await exportToPDF({ fileName, title: config.nombre, columns, data: rows, empresa: empresaNombre, dateRange: { from: filtros.fechaDesde!, to: filtros.fechaHasta! } });
      }
      toast.success(`Reporte generado (${rows.length} filas)`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al generar reporte');
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg z-[60]">
        <DialogHeader>
          <DialogTitle>Ejecutar: {config.nombre}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Desde</Label>
              <Input type="date" value={filtros.fechaDesde} onChange={(e) => setFiltros({ ...filtros, fechaDesde: e.target.value })} />
            </div>
            <div>
              <Label>Hasta</Label>
              <Input type="date" value={filtros.fechaHasta} onChange={(e) => setFiltros({ ...filtros, fechaHasta: e.target.value })} />
            </div>
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <div className="flex flex-wrap gap-1 mt-1">
              {STATUS_OPTS.map(s => {
                const active = (filtros.status ?? []).includes(s);
                return (
                  <button key={s} type="button"
                    onClick={() => {
                      const arr = new Set(filtros.status ?? []);
                      active ? arr.delete(s) : arr.add(s);
                      setFiltros({ ...filtros, status: Array.from(arr) });
                    }}
                    className={`text-xs px-2 py-0.5 rounded border ${active ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                  >{s}</button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
          <Button variant="secondary" onClick={() => run('csv')} disabled={!!loading}>
            {loading === 'csv' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />} CSV
          </Button>
          <Button variant="secondary" onClick={() => run('pdf')} disabled={!!loading}>
            {loading === 'pdf' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} PDF
          </Button>
          <Button onClick={() => run('xlsx')} disabled={!!loading}>
            {loading === 'xlsx' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />} Excel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
