import { useState, useRef, useMemo, useCallback } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Upload, Download, FileSpreadsheet, Link2, AlertCircle, CheckCircle2,
  Loader2, X, Search, Trash2, Plus, History,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { fetchAllPages } from '@/lib/supabasePaginate';
import {
  loadCatalog, matchAll, summary, type ExternalRow, type MatchedRow, type MatchTipo,
} from '@/lib/catalogMatcher';
import { confirmDialog } from '@/lib/confirm';

// ───────── Helpers ─────────
const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const badgeColor: Record<MatchTipo, string> = {
  exacto: 'bg-success/15 text-success border-success/30',
  parcial: 'bg-warning/15 text-warning border-warning/30',
  duplicado: 'bg-secondary text-secondary-foreground border-border',
  sin_match: 'bg-destructive/15 text-destructive border-destructive/30',
  error: 'bg-destructive/15 text-destructive border-destructive/30',
};

const matchLabel: Record<MatchTipo, string> = {
  exacto: 'Match exacto',
  parcial: 'Match parcial',
  duplicado: 'Duplicado',
  sin_match: 'Sin coincidencia',
  error: 'Error',
};

// ───────── Page ─────────
export default function HomologacionCatalogoPage() {
  return (
    <div className="container max-w-7xl py-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Link2 className="h-6 w-6 text-primary" />
          Homologación de catálogo
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Cruza productos de un sistema externo con tu catálogo por código origen.
        </p>
      </div>

      <Tabs defaultValue="importar">
        <TabsList>
          <TabsTrigger value="importar"><Upload className="h-3.5 w-3.5 mr-1" />Nueva importación</TabsTrigger>
          <TabsTrigger value="equivalencias"><Link2 className="h-3.5 w-3.5 mr-1" />Equivalencias</TabsTrigger>
          <TabsTrigger value="historial"><History className="h-3.5 w-3.5 mr-1" />Historial</TabsTrigger>
        </TabsList>
        <TabsContent value="importar" className="mt-4"><ImportTab /></TabsContent>
        <TabsContent value="equivalencias" className="mt-4"><EquivalenciasTab /></TabsContent>
        <TabsContent value="historial" className="mt-4"><HistorialTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: NUEVA IMPORTACIÓN
// ═══════════════════════════════════════════
type Step = 'upload' | 'map' | 'preview' | 'processing' | 'done';

const TEMPLATE_COLS = [
  { key: 'codigo_externo', header: 'Código Externo', example: 'EXT-001' },
  { key: 'descripcion', header: 'Descripción', example: 'Refresco 600ml' },
  { key: 'cantidad', header: 'Cantidad', example: '10' },
  { key: 'precio', header: 'Precio', example: '18.50' },
];

function ImportTab() {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [autoVincular, setAutoVincular] = useState(true);
  const [sistemaOrigen, setSistemaOrigen] = useState('');
  const [matched, setMatched] = useState<MatchedRow[]>([]);
  const [jobId, setJobId] = useState<string | null>(null);

  const fileHeaders = useMemo(() => (rows[0] ? Object.keys(rows[0]) : []), [rows]);

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      TEMPLATE_COLS.map(c => c.header),
      TEMPLATE_COLS.map(c => c.example),
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Homologación');
    XLSX.writeFile(wb, 'Plantilla_Homologacion.xlsx');
  };

  const handleFile = async (f: File) => {
    try {
      setFile(f);
      const buf = await f.arrayBuffer();
      const wb = f.name.endsWith('.csv')
        ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string' })
        : XLSX.read(buf, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
      if (!data.length) { toast.error('Archivo vacío'); return; }
      setRows(data);
      // auto-guess mapping
      const headers = Object.keys(data[0]);
      const guess: Record<string, string> = {};
      const find = (...keys: string[]) =>
        headers.find(h => keys.some(k => h.toLowerCase().includes(k))) ?? '';
      guess.codigo_externo = find('codigo', 'sku', 'cod', 'clave');
      guess.descripcion = find('descrip', 'nombre', 'producto');
      guess.cantidad = find('cantidad', 'qty', 'cant');
      guess.precio = find('precio', 'price', 'importe');
      setMapping(guess);
      setStep('map');
    } catch (e: any) {
      toast.error('Error al leer archivo: ' + (e.message || ''));
    }
  };

  const runPreview = async () => {
    if (!empresa?.id) return;
    if (!mapping.codigo_externo) { toast.error('Selecciona la columna de código externo'); return; }
    setStep('processing');
    try {
      const catalog = await loadCatalog(empresa.id);
      const ext: ExternalRow[] = rows.map((r, i) => ({
        fila: i + 2,
        codigo_externo: String(r[mapping.codigo_externo] ?? '').trim(),
        descripcion: mapping.descripcion ? String(r[mapping.descripcion] ?? '') : undefined,
        cantidad: mapping.cantidad ? Number(r[mapping.cantidad]) || undefined : undefined,
        precio: mapping.precio ? Number(r[mapping.precio]) || undefined : undefined,
        raw: r,
      }));
      const m = matchAll(ext, catalog);
      setMatched(m);
      setStep('preview');
    } catch (e: any) {
      toast.error('Error al procesar: ' + (e.message || ''));
      setStep('map');
    }
  };

  const confirmImport = async () => {
    if (!empresa?.id) return;
    setStep('processing');
    try {
      const s = summary(matched);
      const { data: job, error: jErr } = await supabase
        .from('import_jobs')
        .insert({
          empresa_id: empresa.id,
          tipo: 'homologacion_catalogo',
          archivo_nombre: file?.name ?? null,
          sistema_origen: sistemaOrigen || null,
          total_filas: s.total,
          matched: s.exacto + s.parcial,
          sin_coincidencia: s.sin_match,
          duplicados: s.duplicado,
          errores: s.error,
          status: 'completado',
          resumen: s as any,
          created_by: user?.id ?? null,
        })
        .select('id')
        .single();
      if (jErr) throw jErr;

      // insert lines in chunks of 500
      const lineas = matched.map(m => ({
        job_id: job.id,
        empresa_id: empresa.id,
        fila_num: m.fila,
        codigo_externo: m.codigo_externo,
        descripcion_externa: m.descripcion ?? null,
        cantidad: m.cantidad ?? null,
        precio: m.precio ?? null,
        producto_id: m.producto_id,
        match_tipo: m.match_tipo,
        mensaje: m.mensaje ?? null,
        raw: m.raw as any,
      }));
      for (let i = 0; i < lineas.length; i += 500) {
        const { error: lErr } = await supabase.from('import_job_lineas').insert(lineas.slice(i, i + 500));
        if (lErr) throw lErr;
      }

      // auto-vincular: crea equivalencia para matches por código origen/interno
      if (autoVincular) {
        const equivs = matched
          .filter(m => (m.match_tipo === 'exacto' || m.match_tipo === 'parcial') && m.producto_id && (m.mensaje ?? '').indexOf('Equivalencia registrada') < 0)
          .map(m => ({
            empresa_id: empresa.id,
            producto_id: m.producto_id!,
            codigo_externo: m.codigo_externo,
            sistema_origen: sistemaOrigen || null,
            created_by: user?.id ?? null,
          }));
        if (equivs.length) {
          const { error: eErr } = await supabase
            .from('producto_equivalencias')
            .upsert(equivs, { onConflict: 'empresa_id,codigo_externo,sistema_origen', ignoreDuplicates: true });
          if (eErr) console.warn('upsert equivalencias error', eErr);
        }
      }

      qc.invalidateQueries({ queryKey: ['import_jobs'] });
      qc.invalidateQueries({ queryKey: ['producto_equivalencias'] });
      setJobId(job.id);
      setStep('done');
      toast.success('Importación completada');
    } catch (e: any) {
      toast.error('Error al guardar: ' + (e.message || ''));
      setStep('preview');
    }
  };

  const reset = () => {
    setStep('upload'); setFile(null); setRows([]); setMapping({}); setMatched([]); setJobId(null);
  };

  const s = useMemo(() => summary(matched), [matched]);

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-5">
      {step === 'upload' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-foreground">Subir archivo Excel / CSV</h2>
              <p className="text-xs text-muted-foreground">Códigos del sistema externo a homologar.</p>
            </div>
            <button onClick={downloadTemplate} className="btn-odoo-secondary text-xs gap-1">
              <Download className="h-3.5 w-3.5" /> Descargar plantilla
            </button>
          </div>
          <div
            onClick={() => fileRef.current?.click()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onDragOver={e => e.preventDefault()}
            className="border-2 border-dashed border-border rounded-lg p-10 text-center cursor-pointer hover:border-primary/50 hover:bg-primary/5 transition-colors"
          >
            <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm font-medium">Arrastra tu archivo aquí o haz clic para seleccionar</p>
            <p className="text-xs text-muted-foreground mt-1">.xlsx, .xls, .csv — Máx 20 MB</p>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
        </>
      )}

      {step === 'map' && (
        <>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">{file?.name}</p>
              <p className="text-xs text-muted-foreground">{rows.length} filas detectadas</p>
            </div>
            <button onClick={reset} className="btn-odoo-secondary text-xs gap-1">
              <X className="h-3.5 w-3.5" /> Cambiar archivo
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(['codigo_externo', 'descripcion', 'cantidad', 'precio'] as const).map(field => (
              <label key={field} className="block text-xs">
                <span className="font-medium text-foreground capitalize">
                  {field.replace('_', ' ')}{field === 'codigo_externo' && <span className="text-destructive"> *</span>}
                </span>
                <select
                  value={mapping[field] ?? ''}
                  onChange={e => setMapping(m => ({ ...m, [field]: e.target.value }))}
                  className="w-full mt-1 input-odoo"
                >
                  <option value="">— ninguna —</option>
                  {fileHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
            <label className="block text-xs">
              <span className="font-medium text-foreground">Sistema origen (etiqueta)</span>
              <input value={sistemaOrigen} onChange={e => setSistemaOrigen(e.target.value)}
                placeholder="Ej. POS_externo"
                className="w-full mt-1 input-odoo" />
            </label>
            <label className="flex items-center gap-2 text-xs mt-5">
              <input type="checkbox" checked={autoVincular} onChange={e => setAutoVincular(e.target.checked)} />
              <span>Auto-vincular matches como equivalencias</span>
            </label>
          </div>

          <div className="flex justify-end gap-2">
            <button onClick={reset} className="btn-odoo-secondary">Cancelar</button>
            <button onClick={runPreview} className="btn-odoo-primary gap-1">
              <Search className="h-3.5 w-3.5" /> Procesar coincidencias
            </button>
          </div>
        </>
      )}

      {step === 'processing' && (
        <div className="py-12 text-center space-y-3">
          <Loader2 className="h-10 w-10 animate-spin mx-auto text-primary" />
          <p className="text-sm">Procesando…</p>
        </div>
      )}

      {step === 'preview' && (
        <>
          <SummaryCards s={s} />
          <ResultTable rows={matched} />
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <button onClick={reset} className="btn-odoo-secondary">Cancelar</button>
            <button onClick={confirmImport} className="btn-odoo-primary gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Confirmar e importar
            </button>
          </div>
        </>
      )}

      {step === 'done' && (
        <div className="space-y-4">
          <div className="text-center py-4">
            <CheckCircle2 className="h-12 w-12 mx-auto text-success mb-2" />
            <h3 className="font-semibold text-lg">Importación guardada</h3>
            {jobId && <p className="text-xs text-muted-foreground mt-1">Job ID: {jobId.slice(0, 8)}…</p>}
          </div>
          <SummaryCards s={s} />
          <ExportButtons rows={matched} fileName={file?.name ?? 'homologacion'} />
          <div className="flex justify-end">
            <button onClick={reset} className="btn-odoo-primary">Nueva importación</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCards({ s }: { s: ReturnType<typeof summary> }) {
  const items = [
    { label: 'Total', val: s.total, cls: 'bg-secondary/50 text-foreground' },
    { label: 'Match exacto', val: s.exacto, cls: 'bg-success/10 text-success' },
    { label: 'Match parcial', val: s.parcial, cls: 'bg-warning/10 text-warning' },
    { label: 'Sin match', val: s.sin_match, cls: 'bg-destructive/10 text-destructive' },
    { label: 'Duplicados', val: s.duplicado, cls: 'bg-secondary text-foreground' },
    { label: 'Errores', val: s.error, cls: 'bg-destructive/10 text-destructive' },
  ];
  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
      {items.map(it => (
        <div key={it.label} className={`rounded-lg p-3 text-center ${it.cls}`}>
          <p className="text-xl font-bold">{it.val}</p>
          <p className="text-[10px] uppercase tracking-wide opacity-80">{it.label}</p>
        </div>
      ))}
    </div>
  );
}

function ResultTable({ rows }: { rows: MatchedRow[] }) {
  const [filter, setFilter] = useState<MatchTipo | 'all'>('all');
  const filtered = filter === 'all' ? rows : rows.filter(r => r.match_tipo === filter);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Filtrar:</span>
        {(['all', 'exacto', 'parcial', 'sin_match', 'duplicado', 'error'] as const).map(k => (
          <button key={k}
            onClick={() => setFilter(k as any)}
            className={`text-xs px-2 py-1 rounded border ${filter === k ? 'bg-primary text-primary-foreground border-primary' : 'bg-card border-border'}`}>
            {k === 'all' ? 'Todos' : matchLabel[k as MatchTipo]}
          </button>
        ))}
      </div>
      <div className="border border-border rounded overflow-auto max-h-[480px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left">Fila</th>
              <th className="px-2 py-1.5 text-left">Cód. externo</th>
              <th className="px-2 py-1.5 text-left">Descripción</th>
              <th className="px-2 py-1.5 text-left">Match</th>
              <th className="px-2 py-1.5 text-left">Producto interno</th>
              <th className="px-2 py-1.5 text-left">Nota</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((r, i) => (
              <tr key={i} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="px-2 py-1">{r.fila}</td>
                <td className="px-2 py-1 font-mono">{r.codigo_externo}</td>
                <td className="px-2 py-1 max-w-[200px] truncate">{r.descripcion ?? '—'}</td>
                <td className="px-2 py-1">
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badgeColor[r.match_tipo]}`}>
                    {matchLabel[r.match_tipo]}
                  </span>
                </td>
                <td className="px-2 py-1">
                  {r.producto_nombre ? (
                    <span><span className="font-mono text-muted-foreground">{r.producto_codigo}</span> {r.producto_nombre}</span>
                  ) : '—'}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{r.mensaje ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length > 500 && (
          <p className="text-xs text-center text-muted-foreground py-2">
            Mostrando 500 de {filtered.length} filas. Exporta a Excel para ver todas.
          </p>
        )}
      </div>
    </div>
  );
}

function ExportButtons({ rows, fileName }: { rows: MatchedRow[]; fileName: string }) {
  const exportXlsx = () => {
    const data = rows.map(r => ({
      Fila: r.fila,
      'Código Externo': r.codigo_externo,
      Descripción: r.descripcion ?? '',
      Cantidad: r.cantidad ?? '',
      Precio: r.precio ?? '',
      'Tipo Match': matchLabel[r.match_tipo],
      'Producto Interno (código)': r.producto_codigo ?? '',
      'Producto Interno (nombre)': r.producto_nombre ?? '',
      Nota: r.mensaje ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Reporte');
    XLSX.writeFile(wb, `Reporte_${fileName.replace(/\.[^.]+$/, '')}.xlsx`);
  };
  return (
    <div className="flex justify-end">
      <button onClick={exportXlsx} className="btn-odoo-secondary gap-1 text-xs">
        <Download className="h-3.5 w-3.5" /> Exportar reporte a Excel
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════
// TAB: EQUIVALENCIAS
// ═══════════════════════════════════════════
function EquivalenciasTab() {
  const { empresa } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const { data = [], isLoading } = useQuery({
    queryKey: ['producto_equivalencias', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const rows = await fetchAllPages<any>((from, to) =>
        supabase
          .from('producto_equivalencias')
          .select('id, codigo_externo, sistema_origen, notas, producto:productos(id, codigo, nombre)')
          .eq('empresa_id', empresa!.id)
          .order('created_at', { ascending: false })
          .range(from, to) as any
      );
      return rows;
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('producto_equivalencias').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Equivalencia eliminada');
      qc.invalidateQueries({ queryKey: ['producto_equivalencias'] });
    },
    onError: (e: any) => toast.error(e.message || 'Error'),
  });

  const generarDesdeCatalogo = useMutation({
    mutationFn: async () => {
      if (!empresa?.id) return 0;
      const productos = await fetchAllPages<any>((from, to) =>
        supabase.from('productos').select('id, codigo_origen').eq('empresa_id', empresa.id)
          .not('codigo_origen', 'is', null).range(from, to) as any
      );
      const rows = productos
        .filter((p: any) => p.codigo_origen && p.codigo_origen.trim())
        .map((p: any) => ({
          empresa_id: empresa.id,
          producto_id: p.id,
          codigo_externo: p.codigo_origen,
          sistema_origen: null,
        }));
      if (!rows.length) return 0;
      const { error } = await supabase.from('producto_equivalencias').upsert(rows, {
        onConflict: 'empresa_id,codigo_externo,sistema_origen',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      return rows.length;
    },
    onSuccess: (n) => {
      toast.success(`${n} equivalencia(s) generada(s) desde productos con código origen`);
      qc.invalidateQueries({ queryKey: ['producto_equivalencias'] });
    },
    onError: (e: any) => toast.error(e.message || 'Error'),
  });

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return data;
    return data.filter((r: any) =>
      r.codigo_externo?.toLowerCase().includes(s) ||
      r.sistema_origen?.toLowerCase().includes(s) ||
      r.producto?.codigo?.toLowerCase().includes(s) ||
      r.producto?.nombre?.toLowerCase().includes(s)
    );
  }, [data, q]);

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar código o producto…"
            className="w-full pl-7 input-odoo text-sm" />
        </div>
        <div className="flex gap-2">
          <button onClick={() => generarDesdeCatalogo.mutate()} disabled={generarDesdeCatalogo.isPending}
            className="btn-odoo-secondary text-xs gap-1">
            {generarDesdeCatalogo.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
            Generar desde catálogo
          </button>
          <button onClick={() => setShowAdd(true)} className="btn-odoo-primary text-xs gap-1">
            <Plus className="h-3.5 w-3.5" /> Nueva equivalencia
          </button>
        </div>
      </div>

      <div className="border border-border rounded overflow-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left">Código externo</th>
              <th className="px-2 py-1.5 text-left">Sistema origen</th>
              <th className="px-2 py-1.5 text-left">Producto interno</th>
              <th className="px-2 py-1.5 text-left">Notas</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Cargando…</td></tr>}
            {!isLoading && filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">Sin equivalencias.</td></tr>
            )}
            {filtered.map((r: any) => (
              <tr key={r.id} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="px-2 py-1 font-mono">{r.codigo_externo}</td>
                <td className="px-2 py-1 text-muted-foreground">{r.sistema_origen ?? '—'}</td>
                <td className="px-2 py-1">
                  {r.producto ? (
                    <span><span className="font-mono text-muted-foreground">{r.producto.codigo}</span> {r.producto.nombre}</span>
                  ) : <span className="text-destructive">producto eliminado</span>}
                </td>
                <td className="px-2 py-1 text-muted-foreground">{r.notas ?? ''}</td>
                <td className="px-2 py-1 text-right">
                  <button onClick={async () => { if (await confirmDialog('¿Eliminar equivalencia?')) del.mutate(r.id); }}
                    className="text-destructive hover:bg-destructive/10 p-1 rounded">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showAdd && <AddEquivalenciaDialog open={showAdd} onOpenChange={setShowAdd} />}
    </div>
  );
}

function AddEquivalenciaDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { empresa, user } = useAuth();
  const qc = useQueryClient();
  const [codigoExterno, setCodigoExterno] = useState('');
  const [sistemaOrigen, setSistemaOrigen] = useState('');
  const [notas, setNotas] = useState('');
  const [productoQ, setProductoQ] = useState('');
  const [productoId, setProductoId] = useState<string | null>(null);
  const [productoLabel, setProductoLabel] = useState('');

  const { data: prods = [] } = useQuery({
    queryKey: ['productos-search-equiv', empresa?.id, productoQ],
    enabled: !!empresa?.id && productoQ.length >= 2,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('productos')
        .select('id, codigo, nombre')
        .eq('empresa_id', empresa!.id)
        .or(`codigo.ilike.%${productoQ}%,nombre.ilike.%${productoQ}%`)
        .limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!empresa?.id) throw new Error('Sin empresa');
      if (!productoId) throw new Error('Selecciona un producto');
      if (!codigoExterno.trim()) throw new Error('Código externo requerido');
      const { error } = await supabase.from('producto_equivalencias').insert({
        empresa_id: empresa.id,
        producto_id: productoId,
        codigo_externo: codigoExterno.trim(),
        sistema_origen: sistemaOrigen.trim() || null,
        notas: notas.trim() || null,
        created_by: user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Equivalencia creada');
      qc.invalidateQueries({ queryKey: ['producto_equivalencias'] });
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message || 'Error'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md z-[60] max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva equivalencia</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="block text-xs">
            <span className="font-medium">Código externo *</span>
            <input value={codigoExterno} onChange={e => setCodigoExterno(e.target.value)} className="w-full mt-1 input-odoo" />
          </label>
          <label className="block text-xs">
            <span className="font-medium">Sistema origen</span>
            <input value={sistemaOrigen} onChange={e => setSistemaOrigen(e.target.value)} className="w-full mt-1 input-odoo" />
          </label>
          <label className="block text-xs">
            <span className="font-medium">Producto interno *</span>
            {productoId ? (
              <div className="flex items-center justify-between mt-1 p-2 bg-secondary/30 rounded">
                <span>{productoLabel}</span>
                <button onClick={() => { setProductoId(null); setProductoLabel(''); }} className="text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <>
                <input value={productoQ} onChange={e => setProductoQ(e.target.value)}
                  placeholder="Buscar por código o nombre…" className="w-full mt-1 input-odoo" />
                {prods.length > 0 && (
                  <div className="border border-border rounded mt-1 max-h-40 overflow-auto">
                    {prods.map((p: any) => (
                      <button key={p.id} onClick={() => {
                        setProductoId(p.id);
                        setProductoLabel(`${p.codigo} — ${p.nombre}`);
                        setProductoQ('');
                      }} className="block w-full text-left px-2 py-1 hover:bg-secondary text-xs">
                        <span className="font-mono">{p.codigo}</span> — {p.nombre}
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </label>
          <label className="block text-xs">
            <span className="font-medium">Notas</span>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} className="w-full mt-1 input-odoo" rows={2} />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button onClick={() => onOpenChange(false)} className="btn-odoo-secondary">Cancelar</button>
            <button onClick={() => save.mutate()} disabled={save.isPending} className="btn-odoo-primary">
              {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Guardar'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ═══════════════════════════════════════════
// TAB: HISTORIAL
// ═══════════════════════════════════════════
function HistorialTab() {
  const { empresa } = useAuth();
  const [openJob, setOpenJob] = useState<string | null>(null);

  const { data = [], isLoading } = useQuery({
    queryKey: ['import_jobs', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_jobs')
        .select('*')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="bg-card border border-border rounded-lg p-5 space-y-4">
      <h2 className="font-semibold">Historial de importaciones</h2>
      <div className="border border-border rounded overflow-auto max-h-[600px]">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-secondary">
            <tr className="border-b border-border">
              <th className="px-2 py-1.5 text-left">Fecha</th>
              <th className="px-2 py-1.5 text-left">Archivo</th>
              <th className="px-2 py-1.5 text-left">Sistema</th>
              <th className="px-2 py-1.5 text-right">Total</th>
              <th className="px-2 py-1.5 text-right">Match</th>
              <th className="px-2 py-1.5 text-right">Sin match</th>
              <th className="px-2 py-1.5 text-right">Errores</th>
              <th className="px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Cargando…</td></tr>}
            {!isLoading && data.length === 0 && (
              <tr><td colSpan={8} className="text-center py-6 text-muted-foreground">Sin importaciones aún.</td></tr>
            )}
            {data.map((j: any) => (
              <tr key={j.id} className="border-b border-border/50 hover:bg-secondary/30">
                <td className="px-2 py-1">{fmtDate(j.created_at)}</td>
                <td className="px-2 py-1">{j.archivo_nombre ?? '—'}</td>
                <td className="px-2 py-1 text-muted-foreground">{j.sistema_origen ?? '—'}</td>
                <td className="px-2 py-1 text-right">{j.total_filas}</td>
                <td className="px-2 py-1 text-right text-success">{j.matched}</td>
                <td className="px-2 py-1 text-right text-destructive">{j.sin_coincidencia}</td>
                <td className="px-2 py-1 text-right text-destructive">{j.errores}</td>
                <td className="px-2 py-1 text-right">
                  <button onClick={() => setOpenJob(j.id)} className="btn-odoo-secondary text-xs">Ver detalle</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {openJob && <JobDetailDialog jobId={openJob} onClose={() => setOpenJob(null)} />}
    </div>
  );
}

function JobDetailDialog({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['import_job_lineas', jobId],
    queryFn: async () => {
      const rows = await fetchAllPages<any>((from, to) =>
        supabase
          .from('import_job_lineas')
          .select('*, producto:productos(id, codigo, nombre)')
          .eq('job_id', jobId)
          .order('fila_num', { ascending: true })
          .range(from, to) as any
      );
      return rows;
    },
  });

  const exportXlsx = () => {
    const out = data.map((r: any) => ({
      Fila: r.fila_num,
      'Código Externo': r.codigo_externo,
      Descripción: r.descripcion_externa,
      'Tipo Match': matchLabel[r.match_tipo as MatchTipo] ?? r.match_tipo,
      'Producto Interno (código)': r.producto?.codigo ?? '',
      'Producto Interno (nombre)': r.producto?.nombre ?? '',
      Nota: r.mensaje ?? '',
    }));
    const ws = XLSX.utils.json_to_sheet(out);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle');
    XLSX.writeFile(wb, `Importacion_${jobId.slice(0, 8)}.xlsx`);
  };

  return (
    <Dialog open onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-5xl z-[60] max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>Detalle de importación</span>
            <button onClick={exportXlsx} className="btn-odoo-secondary text-xs gap-1">
              <Download className="h-3.5 w-3.5" /> Exportar Excel
            </button>
          </DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="py-8 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
        ) : (
          <div className="border border-border rounded overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-secondary">
                <tr className="border-b border-border">
                  <th className="px-2 py-1.5 text-left">Fila</th>
                  <th className="px-2 py-1.5 text-left">Cód. externo</th>
                  <th className="px-2 py-1.5 text-left">Descripción</th>
                  <th className="px-2 py-1.5 text-left">Match</th>
                  <th className="px-2 py-1.5 text-left">Producto interno</th>
                  <th className="px-2 py-1.5 text-left">Nota</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r: any) => (
                  <tr key={r.id} className="border-b border-border/50">
                    <td className="px-2 py-1">{r.fila_num}</td>
                    <td className="px-2 py-1 font-mono">{r.codigo_externo}</td>
                    <td className="px-2 py-1 max-w-[200px] truncate">{r.descripcion_externa ?? '—'}</td>
                    <td className="px-2 py-1">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] ${badgeColor[r.match_tipo as MatchTipo] ?? ''}`}>
                        {matchLabel[r.match_tipo as MatchTipo] ?? r.match_tipo}
                      </span>
                    </td>
                    <td className="px-2 py-1">
                      {r.producto ? (
                        <span><span className="font-mono text-muted-foreground">{r.producto.codigo}</span> {r.producto.nombre}</span>
                      ) : '—'}
                    </td>
                    <td className="px-2 py-1 text-muted-foreground">{r.mensaje ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
