import { DateRangePicker } from '@/components/shared/DateRangePicker';
import { useEffect, useMemo, useState } from 'react';
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Plus, Pencil, Trash2, Play, FileSpreadsheet, FileText, FileDown,
  ArrowUp, ArrowDown, Loader2, FileBarChart2, RefreshCw, GripVertical,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildExportColumns,
  exportToCSV,
  runReporte,
  getFuenteMeta,
  FUENTES,
  groupRows,
  getGroupableOptions,
  type ReporteConfig,
  type ReporteFiltros,
  type ReporteFuente,
} from '@/lib/reportesPersonalizados';
import { exportToExcel, exportToPDF } from '@/lib/exportUtils';

import { fmtMoney } from '@/lib/currency';
import { confirmDialog } from '@/lib/confirm';
import { EntityMultiSelect } from '@/components/reportes/EntityMultiSelect';
import { useReporteEntityLists, METODOS_PAGO, CONDICIONES_PAGO } from '@/hooks/useReporteEntityLists';

const STATUS_LABELS: Record<string, string> = {
  borrador: 'Borrador', pendiente: 'Pendiente', parcial: 'Parcial', pagada: 'Pagada',
  cancelada: 'Cancelada', activo: 'Activo', cancelado: 'Cancelado', inactivo: 'Inactivo',
  recibida: 'Recibida',
};
const TIPO_LABELS: Record<string, string> = {
  pedido: 'Pedido', venta_directa: 'Venta directa', saldo_inicial: 'Saldo inicial',
  entrada: 'Entrada', salida: 'Salida', ajuste: 'Ajuste', traspaso: 'Traspaso',
  venta: 'Venta', compra: 'Compra', devolucion: 'Devolución', merma: 'Merma',
};
const statusLabel = (s: string) => STATUS_LABELS[s] ?? s;
const tipoLabel = (s: string) => TIPO_LABELS[s] ?? s;

export default function ReportesPersonalizadosPage() {
  const { user, empresa } = useAuth();
  const qc = useQueryClient();
  const empresaId = empresa?.id;

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReporteConfig | null>(null);
  const [activeTab, setActiveTab] = useState<string>('__list__');

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
        return cfg.id;
      } else {
        const { data, error } = await supabase.from('reportes_personalizados').insert({
          empresa_id: empresaId,
          nombre: cfg.nombre,
          descripcion: cfg.descripcion,
          fuente: cfg.fuente,
          columnas: cfg.columnas as any,
          filtros_default: (cfg.filtros_default ?? {}) as any,
          created_by: user?.id ?? null,
        }).select('id').single();
        if (error) throw error;
        return data.id as string;
      }
    },
    onSuccess: (id) => {
      toast.success('Reporte guardado');
      qc.invalidateQueries({ queryKey: ['reportes-personalizados'] });
      setEditorOpen(false);
      if (id) setActiveTab(id);
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
      setActiveTab('__list__');
    },
    onError: (e: any) => toast.error(e.message ?? 'Error al eliminar'),
  });

  return (
    <div className="p-4 md:p-6 max-w-[1400px] mx-auto space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reportes Personalizados</h1>
          <p className="text-sm text-muted-foreground">
            Construye reportes a la medida: elige columnas, filtros y visualízalos o expórtalos.
          </p>
        </div>
        <Button onClick={() => { setEditing({ nombre: '', fuente: 'ventas', columnas: [] }); setEditorOpen(true); }}>
          <Plus className="w-4 h-4 mr-1" /> Nuevo reporte
        </Button>
      </header>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap h-auto justify-start gap-1 bg-muted/40 p-1">
          <TabsTrigger value="__list__" className="gap-1">
            <FileBarChart2 className="w-3.5 h-3.5" /> Mis reportes
          </TabsTrigger>
          {reportes.map((r) => (
            <TabsTrigger key={r.id} value={r.id} className="capitalize">
              {r.nombre}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="__list__" className="mt-4">
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
                {isLoading && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>}
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
                      <Button size="sm" variant="default" onClick={() => setActiveTab(r.id)}>
                        <Play className="w-3.5 h-3.5 mr-1" /> Abrir
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setEditing({ ...r }); setEditorOpen(true); }}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (await confirmDialog('¿Eliminar este reporte?')) delMutation.mutate(r.id);
                      }}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        {reportes.map((r) => (
          <TabsContent key={r.id} value={r.id} className="mt-4">
            <ReporteRunner
              config={r as ReporteConfig}
              empresaId={empresaId!}
              empresaNombre={empresa?.nombre ?? ''}
              empresaInfo={{
                nombre: empresa?.nombre ?? '',
                rfc: empresa?.rfc ?? null,
                email: empresa?.email ?? null,
                logo_url: empresa?.logo_url ?? null,
              }}
              onEdit={() => { setEditing({ ...r }); setEditorOpen(true); }}
              onDelete={async () => { if (await confirmDialog('¿Eliminar este reporte?')) delMutation.mutate(r.id); }}
            />
          </TabsContent>
        ))}
      </Tabs>

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
    </div>
  );
}

// ─── Runner inline (filtros + tabla + export) ──────────────────
function ReporteRunner({ config, empresaId, empresaNombre, empresaInfo, onEdit, onDelete }: {
  config: ReporteConfig; empresaId: string; empresaNombre: string;
  empresaInfo?: { nombre: string; rfc?: string | null; email?: string | null; logo_url?: string | null };
  onEdit: () => void; onDelete: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(); firstDay.setDate(1);
  const [filtros, setFiltros] = useState<ReporteFiltros>({
    fechaDesde: firstDay.toISOString().slice(0, 10),
    fechaHasta: today,
    ...(config.filtros_default ?? {}),
  });
  const [rows, setRows] = useState<Record<string, any>[] | null>(null);
  const [loading, setLoading] = useState<null | 'run' | 'xlsx' | 'csv' | 'pdf'>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [groupBy, setGroupBy] = useState<string>('');
  const fuenteMeta = getFuenteMeta(config.fuente);
  const STATUS_OPTS = fuenteMeta.statusOptions ?? [];
  const TIPO_OPTS = fuenteMeta.tipoOptions ?? [];
  const ENTITY_FILTERS = fuenteMeta.entityFilters ?? [];
  const columns = useMemo(() => buildExportColumns(config), [config]);
  const groupOptions = useMemo(() => getGroupableOptions(columns, fuenteMeta.campos), [columns, fuenteMeta.campos]);
  const entityLists = useReporteEntityLists(empresaId, ENTITY_FILTERS.length > 0);
  const lists = entityLists.data;
  const update = (patch: Partial<ReporteFiltros>) => setFiltros(f => ({ ...f, ...patch }));
  const hasEntity = (k: string) => ENTITY_FILTERS.includes(k as any);

  // Reset cuando cambia el reporte
  useEffect(() => { setRows(null); setGroupBy(''); }, [config.id]);

  // Etiqueta legible del groupBy seleccionado
  const groupByLabel = useMemo(
    () => groupOptions.find(o => o.key === groupBy)?.label,
    [groupOptions, groupBy]
  );

  // Agrupación derivada para preview y export
  const grouping = useMemo(() => {
    if (!groupBy || !rows || rows.length === 0) return null;
    return groupRows(rows, columns, groupBy);
  }, [groupBy, rows, columns]);

  const ejecutar = async () => {
    try {
      setLoading('run');
      const data = await runReporte(config, filtros, empresaId);
      setRows(data);
      if (data.length === 0) toast.info('Sin datos para los filtros seleccionados');
      else toast.success(`${data.length} registros cargados`);
    } catch (e: any) {
      toast.error(e.message ?? 'Error al ejecutar');
    } finally { setLoading(null); }
  };

  const exportar = async (kind: 'xlsx' | 'csv' | 'pdf') => {
    try {
      setLoading(kind);
      const data = rows ?? await runReporte(config, filtros, empresaId);
      if (!rows) setRows(data);
      if (data.length === 0) { toast.info('Sin datos'); return; }
      const fileName = `${config.nombre.replace(/\s+/g, '_')}_${filtros.fechaDesde}_${filtros.fechaHasta}`;
      const grouped = groupBy ? groupRows(data, columns, groupBy) : null;
      const groupsArg = grouped?.groups;
      const dateRange = { from: filtros.fechaDesde!, to: filtros.fechaHasta! };
      if (kind === 'xlsx') exportToExcel({ fileName, title: config.nombre, columns, data, empresa: empresaNombre, dateRange, groups: groupsArg, groupByLabel });
      else if (kind === 'csv') exportToCSV({ fileName, columns, data, groups: groupsArg });
      else await exportToPDF({ fileName, title: config.nombre, columns, data, empresa: empresaNombre, empresaInfo, dateRange, groups: groupsArg, groupByLabel });
    } catch (e: any) {
      toast.error(e.message ?? 'Error al exportar');
    } finally { setLoading(null); }
  };


  return (
    <div className="space-y-3">
      <Card className="p-3 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">{config.nombre}</h2>
            {config.descripcion && <p className="text-xs text-muted-foreground">{config.descripcion}</p>}
            <p className="text-[11px] text-muted-foreground capitalize">Fuente: {fuenteMeta.label}</p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={onEdit}><Pencil className="w-3.5 h-3.5 mr-1" /> Editar</Button>
            <Button size="sm" variant="ghost" onClick={onDelete}><Trash2 className="w-3.5 h-3.5 text-destructive" /></Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 items-end">
          <div className="col-span-2">
            <Label className="text-xs">Rango de fechas</Label>
            <DateRangePicker
              from={filtros.fechaDesde}
              to={filtros.fechaHasta}
              onChange={(f, t) => setFiltros({ ...filtros, fechaDesde: f, fechaHasta: t })}
            />
          </div>
          <div>
            <Label className="text-xs">Agrupar por</Label>
            <select
              className="h-10 w-full rounded-md border bg-background px-2 text-sm"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value)}
            >
              {groupOptions.map(o => (
                <option key={o.key || 'none'} value={o.key}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2 justify-end">
            <Button onClick={ejecutar} disabled={!!loading}>
              {loading === 'run' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-1" />}
              {rows ? 'Actualizar' : 'Ejecutar'}
            </Button>
            <Button variant="secondary" onClick={() => exportar('csv')} disabled={!!loading}>
              {loading === 'csv' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileDown className="w-4 h-4 mr-1" />} CSV
            </Button>
            <Button variant="secondary" onClick={() => exportar('pdf')} disabled={!!loading}>
              {loading === 'pdf' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />} PDF
            </Button>
            <Button onClick={() => exportar('xlsx')} disabled={!!loading}>
              {loading === 'xlsx' ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileSpreadsheet className="w-4 h-4 mr-1" />} Excel
            </Button>
          </div>
        </div>


        {(STATUS_OPTS.length > 0 || TIPO_OPTS.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {STATUS_OPTS.length > 0 && (
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
                      >{statusLabel(s)}</button>
                    );
                  })}
                </div>
              </div>
            )}
            {TIPO_OPTS.length > 0 && (
              <div>
                <Label className="text-xs">Tipo</Label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {TIPO_OPTS.map(s => {
                    const active = (filtros.tipo ?? []).includes(s);
                    return (
                      <button key={s} type="button"
                        onClick={() => {
                          const arr = new Set(filtros.tipo ?? []);
                          active ? arr.delete(s) : arr.add(s);
                          setFiltros({ ...filtros, tipo: Array.from(arr) });
                        }}
                        className={`text-xs px-2 py-0.5 rounded border ${active ? 'bg-primary text-primary-foreground' : 'bg-background'}`}
                      >{tipoLabel(s)}</button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {ENTITY_FILTERS.length > 0 && (
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setShowAdvanced(s => !s)}
              className="text-xs font-medium text-primary hover:underline mb-2"
            >
              {showAdvanced ? '▼ Ocultar filtros avanzados' : '▶ Mostrar filtros avanzados'}
            </button>
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {hasEntity('search') && (
                  <div>
                    <Label className="text-xs">Búsqueda</Label>
                    <Input
                      value={filtros.search ?? ''}
                      onChange={e => update({ search: e.target.value })}
                      placeholder="Folio, nombre, RFC, notas…"
                      className="h-9 mt-1"
                    />
                  </div>
                )}
                {hasEntity('cliente') && (
                  <EntityMultiSelect label="Cliente" options={lists?.clientes ?? []} loading={entityLists.isLoading}
                    value={filtros.clienteIds ?? []} onChange={v => update({ clienteIds: v })} />
                )}
                {hasEntity('vendedor') && (
                  <EntityMultiSelect label="Vendedor" options={lists?.vendedores ?? []} loading={entityLists.isLoading}
                    value={filtros.vendedorIds ?? []} onChange={v => update({ vendedorIds: v })} />
                )}
                {hasEntity('cobrador') && (
                  <EntityMultiSelect label="Cobrador" options={lists?.cobradores ?? []} loading={entityLists.isLoading}
                    value={filtros.cobradorIds ?? []} onChange={v => update({ cobradorIds: v })} />
                )}
                {hasEntity('almacen') && (
                  <EntityMultiSelect label="Almacén" options={lists?.almacenes ?? []} loading={entityLists.isLoading}
                    value={filtros.almacenIds ?? []} onChange={v => update({ almacenIds: v })} />
                )}
                {hasEntity('proveedor') && (
                  <EntityMultiSelect label="Proveedor" options={lists?.proveedores ?? []} loading={entityLists.isLoading}
                    value={filtros.proveedorIds ?? []} onChange={v => update({ proveedorIds: v })} />
                )}
                {hasEntity('zona') && (
                  <EntityMultiSelect label="Zona" options={lists?.zonas ?? []} loading={entityLists.isLoading}
                    value={filtros.zonaIds ?? []} onChange={v => update({ zonaIds: v })} />
                )}
                {hasEntity('categoria') && (
                  <EntityMultiSelect label="Categoría" options={lists?.categorias ?? []} loading={entityLists.isLoading}
                    value={filtros.categoriaIds ?? []} onChange={v => update({ categoriaIds: v })} />
                )}
                {hasEntity('marca') && (
                  <EntityMultiSelect label="Marca" options={lists?.marcas ?? []} loading={entityLists.isLoading}
                    value={filtros.marcaIds ?? []} onChange={v => update({ marcaIds: v })} />
                )}
                {hasEntity('lista_precio') && (
                  <EntityMultiSelect label="Lista de Precios" options={lists?.listasPrecio ?? []} loading={entityLists.isLoading}
                    value={filtros.listaPrecioIds ?? []} onChange={v => update({ listaPrecioIds: v })} />
                )}
                {hasEntity('metodo_pago') && (
                  <EntityMultiSelect label="Método de pago" options={METODOS_PAGO}
                    value={filtros.metodoPago ?? []} onChange={v => update({ metodoPago: v })} />
                )}
                {hasEntity('condicion_pago') && (
                  <EntityMultiSelect label="Condición de pago" options={CONDICIONES_PAGO}
                    value={filtros.condicionPago ?? []} onChange={v => update({ condicionPago: v })} />
                )}
                {hasEntity('monto') && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Monto mín.</Label>
                      <Input type="number" inputMode="decimal" className="h-9 mt-1"
                        value={filtros.montoMin ?? ''}
                        onChange={e => update({ montoMin: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </div>
                    <div>
                      <Label className="text-xs">Monto máx.</Label>
                      <Input type="number" inputMode="decimal" className="h-9 mt-1"
                        value={filtros.montoMax ?? ''}
                        onChange={e => update({ montoMax: e.target.value === '' ? undefined : Number(e.target.value) })} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-0 overflow-hidden">
        {rows === null ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Configura los filtros y presiona <strong>Ejecutar</strong> para ver los datos.
          </div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Sin datos para los filtros seleccionados.
          </div>
        ) : (
          <DataPreview columns={columns} rows={rows} grouping={grouping} />
        )}
      </Card>
    </div>
  );
}

function DataPreview({ columns, rows, grouping }: {
  columns: ReturnType<typeof buildExportColumns>;
  rows: Record<string, any>[];
  grouping: ReturnType<typeof groupRows> | null;
}) {
  const [limit, setLimit] = useState(100);
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [allOpen, setAllOpen] = useState(true);

  const fmtCell = (val: any, format?: string) => {
    if (val === null || val === undefined || val === '') return '';
    if (format === 'currency') return fmtMoney(Number(val));
    if (format === 'number') return Number(val).toLocaleString('es-MX');
    if (format === 'percent') return `${Number(val).toFixed(1)}%`;
    if (format === 'date') {
      const s = String(val);
      const hasTime = /T\d{2}:\d{2}/.test(s);
      const d = new Date(s);
      if (isNaN(d.getTime())) return s;
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      if (hasTime) {
        const hh = String(d.getHours()).padStart(2, '0');
        const mi = String(d.getMinutes()).padStart(2, '0');
        return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
      }
      return `${dd}/${mm}/${yyyy}`;
    }
    return String(val);
  };

  const isNumeric = (f?: string) => f === 'currency' || f === 'number' || f === 'percent';
  const shown = rows.slice(0, limit);

  return (
    <div>
      <div className="flex items-center justify-between px-3 py-2 bg-muted/30 text-xs">
        <span>
          {grouping
            ? `${grouping.groups.length.toLocaleString('es-MX')} grupos · ${rows.length.toLocaleString('es-MX')} registros`
            : `Mostrando ${shown.length.toLocaleString('es-MX')} de ${rows.length.toLocaleString('es-MX')} registros`}
        </span>
        <div className="flex items-center gap-2">
          {grouping && (
            <Button size="sm" variant="ghost" onClick={() => { setAllOpen(o => !o); setOpenMap({}); }}>
              {allOpen ? 'Contraer todo' : 'Expandir todo'}
            </Button>
          )}
          {!grouping && rows.length > limit && (
            <Button size="sm" variant="ghost" onClick={() => setLimit(l => l + 200)}>Mostrar más</Button>
          )}
        </div>
      </div>
      <div className="overflow-auto max-h-[60vh]">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0">
            <tr className="text-left">
              {columns.map(c => (
                <th key={c.key} className={`px-2 py-2 whitespace-nowrap ${isNumeric(c.format) ? 'text-right' : ''}`}>{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grouping ? (
              grouping.groups.map((g) => (
                <GroupBlock
                  key={g.key}
                  group={g}
                  columns={columns}
                  fmtCell={fmtCell}
                  isNumeric={isNumeric}
                  open={openMap[g.key] ?? allOpen}
                  onToggle={() => setOpenMap(m => ({ ...m, [g.key]: !(m[g.key] ?? allOpen) }))}
                />
              ))
            ) : (
              shown.map((row, i) => (
                <tr key={i} className="border-t hover:bg-muted/20">
                  {columns.map(c => (
                    <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap ${isNumeric(c.format) ? 'text-right tabular-nums' : ''}`}>
                      {fmtCell(row[c.key], c.format)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupBlock({ group, columns, fmtCell, isNumeric, open, onToggle }: {
  group: ReturnType<typeof groupRows>['groups'][number];
  columns: ReturnType<typeof buildExportColumns>;
  fmtCell: (v: any, f?: string) => string;
  isNumeric: (f?: string) => boolean;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr className="border-t bg-primary/5 cursor-pointer" onClick={onToggle}>
        <td colSpan={columns.length} className="px-2 py-1.5 font-semibold text-primary">
          {open ? '▾' : '▸'} {group.label} <span className="text-muted-foreground font-normal">({group.rows.length})</span>
        </td>
      </tr>
      {open && group.rows.map((row, i) => (
        <tr key={i} className="border-t hover:bg-muted/20">
          {columns.map(c => (
            <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap ${isNumeric(c.format) ? 'text-right tabular-nums' : ''}`}>
              {fmtCell(row[c.key], c.format)}
            </td>
          ))}
        </tr>
      ))}
      <tr className="border-t bg-muted/40">
        {columns.map((c, i) => (
          <td key={c.key} className={`px-2 py-1.5 font-semibold ${isNumeric(c.format) ? 'text-right tabular-nums' : ''}`}>
            {i === 0 ? `Subtotal ${group.label}` : (c.key in group.subtotals ? fmtCell(group.subtotals[c.key], c.format) : '')}
          </td>
        ))}
      </tr>
    </>
  );
}


// ─── Editor Dialog ─────────────────────────────────────────────
function EditorDialog({ open, onClose, config, onChange, onSave, saving }: {
  open: boolean; onClose: () => void; config: ReporteConfig;
  onChange: (c: ReporteConfig) => void; onSave: () => void; saving: boolean;
}) {
  const fuenteMeta = getFuenteMeta(config.fuente);
  const allCampos = fuenteMeta.campos;
  const STATUS_OPTS = fuenteMeta.statusOptions ?? [];
  const TIPO_OPTS = fuenteMeta.tipoOptions ?? [];
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

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0) return;
    const next = [...config.columnas];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    onChange({ ...config, columnas: next });
  };


  const renameCol = (idx: number, header: string) => {
    const next = [...config.columnas];
    next[idx] = { ...next[idx], header };
    onChange({ ...config, columnas: next });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto z-[60]">
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
              <Label>Fuente de datos</Label>
              <select
                className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                value={config.fuente}
                onChange={(e) => onChange({ ...config, fuente: e.target.value as ReporteFuente, columnas: [], filtros_default: {} })}
                disabled={!!config.id}
              >
                {FUENTES.map(f => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground mt-1">{fuenteMeta.description}</p>
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
                  const isDragging = dragIdx === idx;
                  const isOver = overIdx === idx && dragIdx !== null && dragIdx !== idx;
                  return (
                    <div
                      key={col.key}
                      draggable
                      onDragStart={(e) => {
                        setDragIdx(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (overIdx !== idx) setOverIdx(idx);
                      }}
                      onDragLeave={() => { if (overIdx === idx) setOverIdx(null); }}
                      onDrop={(e) => {
                        e.preventDefault();
                        if (dragIdx !== null) reorder(dragIdx, idx);
                        setDragIdx(null);
                        setOverIdx(null);
                      }}
                      onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
                      className={`p-2 flex items-center gap-2 transition-colors ${isDragging ? 'opacity-40' : ''} ${isOver ? 'bg-primary/10 border-t-2 border-primary' : ''}`}
                    >
                      <span className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground touch-none" title="Arrastra para reordenar">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <span className="text-xs text-muted-foreground w-5">{idx + 1}</span>
                      <Input
                        value={col.header ?? def?.label ?? col.key}
                        onChange={(e) => renameCol(idx, e.target.value)}
                        className="h-8 text-sm flex-1"
                      />
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
                      >{statusLabel(s)}</button>
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
                      >{tipoLabel(s)}</button>
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
