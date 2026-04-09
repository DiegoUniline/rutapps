import { useState, useMemo, useRef, useEffect } from 'react';
import HelpButton from '@/components/HelpButton';
import { HELP } from '@/lib/helpContent';
import { useAuth } from '@/contexts/AuthContext';
import { useClasificaciones } from '@/hooks/useData';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Settings2, Search, Package, RotateCcw, Save, AlertTriangle, FileText, Download, Upload, ChevronDown, ChevronRight, User, Calendar, MapPin, List } from 'lucide-react';
import { ExportButton } from '@/components/ExportButton';
import { exportToExcel, exportToPDF, type ExportColumn } from '@/lib/exportUtils';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { GroupedTableWrapper } from '@/components/GroupedTableWrapper';
import { useListPreferences, groupData, dateGroupLabel } from '@/hooks/useListPreferences';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useAlmacenes } from '@/hooks/useData';
import { fmtDate, todayLocal, cn, fmtNum } from '@/lib/utils';
import { toast } from 'sonner';
import { generarAjusteInventarioPdf } from '@/lib/ajusteInventarioPdf';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import * as XLSX from 'xlsx';

interface ProductRow {
  id: string;
  codigo: string;
  nombre: string;
  unidad: string;
  clasificacionId: string | null;
  clasificacionNombre: string;
  cantidadSistema: number;
  cantidadReal: number | null;
  touched: boolean;
}

export default function AjustesInventarioPage() {
  const { empresa, user, profile } = useAuth();
  const qc = useQueryClient();
  const { data: almacenes } = useAlmacenes();
  const [almacenId, setAlmacenId] = useState('');
  const [search, setSearch] = useState('');
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const { data: clasificaciones } = useClasificaciones();
  const [motivo, setMotivo] = useState('Conteo físico');
  const [applying, setApplying] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState(false);
  const [resetMotivo, setResetMotivo] = useState('Reinicio general de stock');
  const [resetting, setResetting] = useState(false);
  const [tab, setTab] = useState('ajuste');
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [historialView, setHistorialView] = useState<'agrupado' | 'detalle'>('agrupado');
  const [searchH, setSearchH] = useState('');
  const [pageH, setPageH] = useState(1);
  const { filters: filtersH, groupBy: groupByH, groupByLevels: groupByLevelsH, setFilter: setFilterH, toggleFilterValue: toggleFilterValueH, setGroupBy: setGroupByH, setGroupByLevel: setGroupByLevelH, clearFilters: clearFiltersH } = useListPreferences('ajustes-historial');
  const [desdeH, setDesdeH] = useState('');
  const [hastaH, setHastaH] = useState('');
  const PAGE_SIZE_H = 80;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleGenerarPdf = async () => {
    if (changedRows.length === 0 && rows.length === 0) return;
    const almacenNombre = (almacenes ?? []).find((a: any) => a.id === almacenId)?.nombre;
    const dataRows = changedRows.length > 0 ? changedRows : rows;
    const blob = await generarAjusteInventarioPdf({
      empresa: {
        nombre: empresa?.nombre ?? '',
        razon_social: empresa?.razon_social,
        rfc: empresa?.rfc,
        direccion: empresa?.direccion,
        telefono: empresa?.telefono,
      },
      ajuste: {
        fecha: todayLocal(),
        motivo,
        almacen: almacenNombre,
        responsable: profile?.nombre,
      },
      lineas: dataRows.map(r => ({
        codigo: r.codigo,
        nombre: r.nombre,
        cantidad_anterior: r.cantidadSistema,
        cantidad_nueva: r.cantidadReal ?? r.cantidadSistema,
        diferencia: (r.cantidadReal ?? r.cantidadSistema) - r.cantidadSistema,
      })),
    });
    setPdfBlob(blob);
    setShowPdfModal(true);
  };

  // Load products
  const { data: productos, isLoading: loadingProducts } = useQuery({
    queryKey: ['productos-ajuste', empresa?.id, almacenId],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const [{ data, error }, { data: stockRows, error: stockError }] = await Promise.all([
        supabase
          .from('productos')
          .select('id, codigo, nombre, cantidad, se_puede_inventariar, status, clasificacion_id, clasificaciones(nombre), unidad_venta_id, unidades:unidad_venta_id(nombre, abreviatura)')
          .eq('empresa_id', empresa!.id)
          .in('status', ['activo'] as any[])
          .order('nombre'),
        almacenId
          ? supabase
              .from('stock_almacen')
              .select('producto_id, cantidad')
              .eq('empresa_id', empresa!.id)
              .eq('almacen_id', almacenId)
          : Promise.resolve({ data: [], error: null } as any),
      ]);

      if (error) throw error;
      if (stockError) throw stockError;

      const stockMap = new Map((stockRows ?? []).map((item: any) => [item.producto_id, item.cantidad ?? 0]));

      return (data ?? [])
        .filter((p: any) => p.se_puede_inventariar !== false)
        .map((p: any) => ({
          ...p,
          cantidad: almacenId ? (stockMap.get(p.id) ?? 0) : (p.cantidad ?? 0),
        }));
    },
  });

  // Load history (grouped)
  const { data: historial, isLoading: loadingHistorial } = useQuery({
    queryKey: ['ajustes-historial', empresa?.id],
    enabled: !!empresa?.id && tab === 'historial',
    queryFn: async () => {
      const { data, error } = await supabase
        .from('ajustes_inventario')
        .select('*, productos(codigo, nombre), almacenes(nombre)')
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;

      const userIds = [...new Set((data ?? []).map((a: any) => a.user_id))];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, nombre')
        .in('user_id', userIds);
      const profileMap = new Map((profiles ?? []).map((p: any) => [p.user_id, p.nombre]));

      const groups = new Map<string, { key: string; fecha: string; userName: string; almacenName: string; motivo: string; created_at: string; items: any[] }>();
      for (const a of (data ?? [])) {
        // Use batch_id when available, fallback to legacy grouping
        const gKey = (a as any).batch_id ?? `${a.fecha}_${a.user_id}_${a.motivo ?? ''}_${a.almacen_id ?? ''}`;
        if (!groups.has(gKey)) {
          groups.set(gKey, {
            key: gKey,
            fecha: a.fecha,
            userName: profileMap.get(a.user_id) ?? 'Usuario',
            almacenName: (a.almacenes as any)?.nombre ?? 'Sin almacén',
            motivo: a.motivo ?? '',
            created_at: a.created_at,
            items: [],
          });
        }
        groups.get(gKey)!.items.push(a);
      }
      return Array.from(groups.values());
    },
  });

  const syncProductTotals = async (productIds: string[]) => {
    const uniqueIds = [...new Set(productIds)];
    if (!empresa?.id || uniqueIds.length === 0) return;

    const { data: stockRows, error } = await supabase
      .from('stock_almacen')
      .select('producto_id, cantidad')
      .eq('empresa_id', empresa.id)
      .in('producto_id', uniqueIds as any);

    if (error) throw error;

    const totalMap = new Map<string, number>();
    for (const row of (stockRows ?? [])) {
      totalMap.set(row.producto_id, (totalMap.get(row.producto_id) ?? 0) + (row.cantidad ?? 0));
    }

    // productos.cantidad is auto-recalculated by trigger when stock_almacen changes
  };

  // Initialize rows when products load
  const initRows = () => {
    if (!productos) return;
    setRows(productos.map((p: any) => ({
      id: p.id,
      codigo: p.codigo,
      nombre: p.nombre,
      unidad: (p.unidades as any)?.abreviatura ?? 'PZA',
      clasificacionId: p.clasificacion_id ?? null,
      clasificacionNombre: (p.clasificaciones as any)?.nombre ?? '',
      cantidadSistema: p.cantidad ?? 0,
      cantidadReal: null,
      touched: false,
    })));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { initRows(); }, [productos]);

  const filteredRows = useMemo(() => {
    let result = rows;
    if (selectedCats.length > 0) {
      result = result.filter(r => r.clasificacionId && selectedCats.includes(r.clasificacionId));
    }
    if (search) {
      const s = search.toLowerCase();
      result = result.filter(r => r.nombre.toLowerCase().includes(s) || r.codigo.toLowerCase().includes(s));
    }
    return result;
  }, [rows, search, selectedCats]);

  const changedRows = (rows ?? []).filter(r => r.touched && r.cantidadReal !== null && r.cantidadReal !== r.cantidadSistema);

  const updateRow = (id: string, cantidadReal: number) => {
    setRows(prev => prev.map(r =>
      r.id === id ? { ...r, cantidadReal, touched: true } : r
    ));
  };

  // ─── Export template ─────────────────────────────────────────
  const exportTemplate = () => {
    if (!almacenId) {
      toast.error('Selecciona un almacén primero');
      return;
    }
    if (!productos || productos.length === 0) {
      toast.info('No hay productos para exportar');
      return;
    }
    const almacenNombre = (almacenes ?? []).find((a: any) => a.id === almacenId)?.nombre ?? 'General';
    const wsData = productos.map((p: any) => ({
      'Código': p.codigo,
      'Producto': p.nombre,
      'Unidad': (p.unidades as any)?.abreviatura ?? 'PZA',
      'Stock actual': p.cantidad ?? 0,
      'Cantidad nueva': '',
    }));
    const ws = XLSX.utils.json_to_sheet(wsData);
    ws['!cols'] = [{ wch: 14 }, { wch: 35 }, { wch: 8 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Ajuste');
    XLSX.writeFile(wb, `plantilla-ajuste-${almacenNombre}-${todayLocal()}.xlsx`);
    toast.success('Plantilla descargada');
  };

  // ─── Import from file ────────────────────────────────────────
  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[_\s]+/g, ' ').trim();

  const findKey = (obj: any, aliases: string[]): any => {
    const keys = Object.keys(obj);
    const normAliases = aliases.map(normalize);
    for (const alias of normAliases) {
      const found = keys.find(k => normalize(k) === alias);
      if (found !== undefined) return obj[found];
    }
    for (const alias of normAliases) {
      const found = keys.find(k => normalize(k).includes(alias));
      if (found !== undefined) return obj[found];
    }
    return undefined;
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!almacenId) {
      toast.error('Selecciona un almacén antes de cargar la plantilla');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json<any>(ws);

      if (data.length === 0) {
        toast.error('El archivo está vacío');
        return;
      }

      let matched = 0;
      let skippedEmpty = 0;
      const newRows = [...rows];
      for (const row of data) {
        const codigo = String(findKey(row, ['Código', 'codigo', 'code', 'clave', 'sku']) ?? '').trim();
        const cantidadNueva = findKey(row, ['Cantidad nueva', 'cantidad_nueva', 'cantidad', 'qty', 'stock nuevo', 'nuevo']);

        if (!codigo) continue;
        if (cantidadNueva === undefined || cantidadNueva === '' || cantidadNueva === null) {
          skippedEmpty++;
          continue;
        }

        const idx = newRows.findIndex(r => r.codigo.toLowerCase() === codigo.toLowerCase());
        if (idx !== -1) {
          const numVal = Number(cantidadNueva);
          const differs = numVal !== newRows[idx].cantidadSistema;
          newRows[idx] = { ...newRows[idx], cantidadReal: numVal, touched: differs };
          matched++;
        }
      }

      setRows(newRows);
      if (matched > 0) {
        toast.success(`${matched} producto(s) actualizados desde el archivo`);
      } else if (skippedEmpty === data.length || skippedEmpty > 0) {
        toast.info('La columna "Cantidad nueva" está vacía. Llénala en el archivo antes de subirlo.');
      } else {
        toast.error('No se encontraron coincidencias por código. Verifica que los códigos coincidan.');
      }
    } catch (err: any) {
      toast.error('Error al leer el archivo: ' + (err.message || ''));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Apply all changes
  const applyAdjustments = async () => {
    if (!almacenId) { toast.error('Selecciona un almacén primero'); return; }
    if (changedRows.length === 0) { toast.info('No hay cambios'); return; }
    if (!motivo.trim()) { toast.error('Indica un motivo para el ajuste'); return; }
    setApplying(true);
    try {
      const today = todayLocal();
      const batchId = crypto.randomUUID();

      for (const row of changedRows) {
        const diferencia = (row.cantidadReal ?? 0) - row.cantidadSistema;

        await supabase.from('ajustes_inventario').insert({
          empresa_id: empresa!.id,
          producto_id: row.id,
          cantidad_anterior: row.cantidadSistema,
          cantidad_nueva: row.cantidadReal,
          diferencia,
          motivo,
          user_id: user!.id,
          almacen_id: almacenId || null,
          batch_id: batchId,
        } as any);

        await supabase.from('stock_almacen').upsert({
          empresa_id: empresa!.id,
          almacen_id: almacenId,
          producto_id: row.id,
          cantidad: row.cantidadReal ?? 0,
        } as any, { onConflict: 'almacen_id,producto_id' });

        if (diferencia !== 0) {
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id,
            tipo: diferencia > 0 ? 'entrada' : 'salida',
            producto_id: row.id,
            cantidad: Math.abs(diferencia),
            referencia_tipo: 'ajuste',
            user_id: user?.id,
            fecha: today,
            ...(diferencia > 0
              ? { almacen_destino_id: almacenId || null }
              : { almacen_origen_id: almacenId || null }),
            notas: `Ajuste masivo: ${motivo}`,
          } as any);
        }
      }

      await syncProductTotals(changedRows.map(row => row.id));

      toast.success(`${changedRows.length} producto(s) ajustados`);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
      qc.invalidateQueries({ queryKey: ['ajustes-historial'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al aplicar ajustes');
    } finally {
      setApplying(false);
    }
  };

  // Reset all stock to zero
  const resetStock = async () => {
    if (!resetMotivo.trim()) { toast.error('Indica un motivo'); return; }
    if (!almacenId) { toast.error('Selecciona un almacén primero'); return; }
    setResetting(true);
    try {
      const today = todayLocal();
      const allProds = productos ?? [];
      const nonZero = allProds.filter((p: any) => (p.cantidad ?? 0) !== 0);
      const batchId = crypto.randomUUID();

      for (const p of nonZero) {
        const cantAnterior = p.cantidad ?? 0;

        await supabase.from('ajustes_inventario').insert({
          empresa_id: empresa!.id,
          producto_id: p.id,
          cantidad_anterior: cantAnterior,
          cantidad_nueva: 0,
          diferencia: -cantAnterior,
          motivo: resetMotivo,
          user_id: user!.id,
          almacen_id: almacenId,
          batch_id: batchId,
        } as any);

        await supabase.from('stock_almacen').upsert({
          empresa_id: empresa!.id,
          almacen_id: almacenId,
          producto_id: p.id,
          cantidad: 0,
        } as any, { onConflict: 'almacen_id,producto_id' });

        if (cantAnterior !== 0) {
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id,
            tipo: 'salida',
            producto_id: p.id,
            cantidad: cantAnterior,
            referencia_tipo: 'ajuste',
            user_id: user?.id,
            fecha: today,
            almacen_origen_id: almacenId,
            notas: `Reinicio a ceros: ${resetMotivo}`,
          } as any);
        }
      }

      await syncProductTotals(nonZero.map((p: any) => p.id));

      toast.success(`Stock reiniciado a 0 en ${nonZero.length} productos`);
      setShowResetDialog(false);
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-ajuste'] });
      qc.invalidateQueries({ queryKey: ['ajustes-historial'] });
      qc.invalidateQueries({ queryKey: ['movimientos'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen'] });
      qc.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    } catch (err: any) {
      toast.error(err.message || 'Error al reiniciar stock');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="p-4 space-y-4 min-h-full">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">
          <Settings2 className="h-5 w-5" /> Ajustes de inventario
          <HelpButton title={HELP.ajustesInventario.title} sections={HELP.ajustesInventario.sections} />
        </h1>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="ajuste">Ajuste masivo</TabsTrigger>
          <TabsTrigger value="historial">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="ajuste" className="space-y-4 mt-4">
          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-end">
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Almacén</Label>
              <Select value={almacenId} onValueChange={setAlmacenId}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Selecciona almacén" />
                </SelectTrigger>
                <SelectContent>
                  {(almacenes ?? []).map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Buscar producto</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="Código o nombre..." className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1 flex-1 min-w-[200px] max-w-sm">
              <Label className="text-xs text-muted-foreground">Motivo del ajuste</Label>
              <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Conteo físico..." />
            </div>
            <div className="space-y-1 min-w-[200px]">
              <Label className="text-xs text-muted-foreground">Categorías</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[220px] justify-between font-normal">
                    {selectedCats.length === 0
                      ? <span className="text-muted-foreground">Todas</span>
                      : selectedCats.length <= 3
                        ? selectedCats.map(cid => (clasificaciones ?? []).find((c: any) => c.id === cid)?.nombre ?? '?').join(', ')
                        : `${selectedCats.length} categorías`
                    }
                    <Search className="h-3.5 w-3.5 ml-1 shrink-0 text-muted-foreground" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[260px] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar categoría..." />
                    <CommandList>
                      <CommandEmpty>Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {(clasificaciones ?? []).map((c: any) => {
                          const selected = selectedCats.includes(c.id);
                          return (
                            <CommandItem
                              key={c.id}
                              onSelect={() => {
                                setSelectedCats(prev =>
                                  selected ? prev.filter(x => x !== c.id) : [...prev, c.id]
                                );
                              }}
                            >
                              <div className={`mr-2 flex h-4 w-4 items-center justify-center rounded-sm border ${selected ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                                {selected && <span className="text-[10px]">✓</span>}
                              </div>
                              {c.nombre}
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                  {selectedCats.length > 0 && (
                    <div className="border-t p-1">
                      <Button variant="ghost" size="sm" className="w-full text-xs" onClick={() => setSelectedCats([])}>
                        Limpiar filtros
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {/* Action bar */}
          <div className="flex items-center justify-between flex-wrap gap-3 bg-card border border-border/40 rounded-lg px-4 py-2.5">
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{filteredRows.length} productos</span>
              {changedRows.length > 0 && (
                <Badge variant="outline" className="text-primary border-primary/30 bg-primary/5">
                  {changedRows.length} con cambios
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={exportTemplate} disabled={!almacenId || !productos || productos.length === 0} className="gap-1.5">
                <Download className="h-4 w-4" /> Descargar plantilla
              </Button>
              <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={!almacenId} className="gap-1.5">
                <Upload className="h-4 w-4" /> Cargar archivo
              </Button>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              {rows.length > 0 && (
                <Button variant="outline" size="sm" onClick={handleGenerarPdf}>
                  <FileText className="h-4 w-4 mr-1" /> PDF
                </Button>
              )}
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowResetDialog(true)}
                className="gap-1.5"
              >
                <RotateCcw className="h-4 w-4" /> Reiniciar a ceros
              </Button>
              <Button
                size="sm"
                onClick={applyAdjustments}
                disabled={applying || changedRows.length === 0 || !almacenId}
                className="gap-1.5"
              >
                <Save className="h-4 w-4" />
                {applying ? 'Aplicando...' : `Aplicar ${changedRows.length} ajuste(s)`}
              </Button>
            </div>
          </div>

          {/* Products table */}
          <div className="border border-border rounded-lg overflow-hidden">
            <div className="max-h-[calc(100vh-380px)] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow>
                     <TableHead className="w-[100px]">Código</TableHead>
                     <TableHead>Producto</TableHead>
                     <TableHead className="w-[80px]">Unidad</TableHead>
                     <TableHead className="w-[140px]">Categoría</TableHead>
                     <TableHead className="text-right w-[110px]">En sistema</TableHead>
                     <TableHead className="text-right w-[130px]">Cantidad real</TableHead>
                     <TableHead className="text-right w-[100px]">Diferencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadingProducts && (
                     <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Cargando productos...</TableCell></TableRow>
                  )}
                  {!loadingProducts && filteredRows.length === 0 && (
                     <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-12">
                       <Package className="h-8 w-8 mx-auto mb-2 opacity-30" />
                       {almacenId ? 'No hay productos' : 'Selecciona un almacén'}
                     </TableCell></TableRow>
                  )}
                  {filteredRows.map(row => {
                    const diff = row.touched && row.cantidadReal !== null ? row.cantidadReal - row.cantidadSistema : 0;
                    return (
                      <TableRow
                        key={row.id}
                        className={row.touched && diff !== 0 ? 'bg-primary/5' : ''}
                      >
                         <TableCell className="font-mono text-xs text-muted-foreground">{row.codigo}</TableCell>
                         <TableCell className="text-sm">{row.nombre}</TableCell>
                         <TableCell className="text-xs text-muted-foreground">{row.unidad}</TableCell>
                         <TableCell className="text-xs text-muted-foreground truncate max-w-[140px]">{row.clasificacionNombre || '—'}</TableCell>
                        <TableCell className="text-right font-mono text-sm">{row.cantidadSistema}</TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            min={0}
                            className="w-[100px] ml-auto text-right font-mono h-8 text-sm"
                            placeholder={String(row.cantidadSistema)}
                            value={row.cantidadReal ?? ''}
                            onChange={e => updateRow(row.id, e.target.value === '' ? row.cantidadSistema : Number(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-semibold ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {row.touched && diff !== 0 ? `${diff > 0 ? '+' : ''}${diff}` : '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

         <TabsContent value="historial" className="mt-4 space-y-3">
          {/* Sub-tabs: agrupado vs detalle */}
          <div className="flex items-center justify-between border-b border-border">
            <div className="flex gap-1">
              <button
                onClick={() => setHistorialView('agrupado')}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
                  historialView === 'agrupado' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <List className="h-3.5 w-3.5" /> Agrupado
              </button>
              <button
                onClick={() => setHistorialView('detalle')}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium border-b-2 transition-colors",
                  historialView === 'detalle' ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
                )}
              >
                <Package className="h-3.5 w-3.5" /> Detalle
              </button>
            </div>
          </div>

          {/* ─── AGRUPADO VIEW ─── */}
          {historialView === 'agrupado' && (
            <div className="space-y-2">
              {loadingHistorial && <div className="text-center text-muted-foreground py-8">Cargando...</div>}
              {!loadingHistorial && (historial ?? []).length === 0 && (
                <div className="text-center text-muted-foreground py-12">
                  <Package className="h-8 w-8 mx-auto mb-2 opacity-30" /> No hay ajustes registrados
                </div>
              )}
              {(historial ?? []).map((group: any) => {
                const isOpen = expandedGroup === group.key;
                const items = group?.items ?? [];
                const totalItems = items.length;
                const totalDiff = items.reduce((sum: number, i: any) => sum + (i.diferencia ?? 0), 0);
                return (
                  <div key={group.key} className="border border-border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-card transition-colors"
                      onClick={() => setExpandedGroup(isOpen ? null : group.key)}
                    >
                      {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />}
                      <div className="flex items-center gap-4 flex-1 flex-wrap">
                        <span className="flex items-center gap-1.5 text-sm font-medium">
                          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                          {fmtDate(group.fecha)}{' '}
                          <span className="text-xs text-muted-foreground font-normal">
                            {new Date(group.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <User className="h-3.5 w-3.5" />
                          {group.userName}
                        </span>
                        <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" />
                          {group.almacenName}
                        </span>
                        <span className="text-xs text-muted-foreground italic flex-1 truncate max-w-[250px]">
                          {group.motivo || 'Sin motivo'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <Badge variant="outline" className="text-xs">{totalItems} producto{totalItems !== 1 ? 's' : ''}</Badge>
                        <span className={`font-mono text-sm font-semibold ${totalDiff > 0 ? 'text-green-600' : totalDiff < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {totalDiff > 0 ? '+' : ''}{totalDiff}
                        </span>
                      </div>
                    </button>
                    {isOpen && (
                      <div className="border-t border-border">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código</TableHead>
                              <TableHead>Producto</TableHead>
                              <TableHead className="text-right">Anterior</TableHead>
                              <TableHead className="text-right">Nueva</TableHead>
                              <TableHead className="text-right">Diferencia</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {(group?.items ?? []).map((a: any) => (
                              <TableRow key={a.id}>
                                <TableCell className="font-mono text-xs text-muted-foreground">{a.productos?.codigo}</TableCell>
                                <TableCell className="text-sm">{a.productos?.nombre}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{a.cantidad_anterior}</TableCell>
                                <TableCell className="text-right font-mono text-sm">{a.cantidad_nueva}</TableCell>
                                <TableCell className={`text-right font-mono text-sm font-semibold ${a.diferencia > 0 ? 'text-green-600' : a.diferencia < 0 ? 'text-destructive' : ''}`}>
                                  {a.diferencia > 0 ? '+' : ''}{a.diferencia}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── DETALLE VIEW ─── */}
          {historialView === 'detalle' && (() => {
            const AJUSTE_FILTER_OPTIONS = [
              { key: 'almacen', label: 'Almacén', options: (almacenes ?? []).map((a: any) => ({ value: a.id, label: a.nombre })) },
            ];
            const AJUSTE_GROUP_BY_OPTIONS = [
              { value: 'almacen', label: 'Almacén' },
              { value: 'producto', label: 'Producto' },
              { value: 'motivo', label: 'Motivo' },
              { value: 'usuario', label: 'Usuario' },
              { value: 'fecha', label: 'Fecha (día)' },
              { value: 'fecha_anio_mes', label: 'Año-Mes' },
            ];
            const AJUSTE_DETALLE_COLUMNS: ExportColumn[] = [
              { key: 'fecha', header: 'Fecha', format: 'date', width: 12 },
              { key: 'almacen', header: 'Almacén', width: 20 },
              { key: 'usuario', header: 'Usuario', width: 20 },
              { key: 'codigo', header: 'Código', width: 14 },
              { key: 'producto', header: 'Producto', width: 25 },
              { key: 'cantidad_anterior', header: 'Anterior', format: 'number', width: 12 },
              { key: 'cantidad_nueva', header: 'Nueva', format: 'number', width: 12 },
              { key: 'diferencia', header: 'Diferencia', format: 'number', width: 12 },
              { key: 'motivo', header: 'Motivo', width: 20 },
            ];

            // Flatten all historial items
            const allItems = useMemo(() => {
              if (!historial) return [];
              return historial.flatMap((g: any) =>
                (g.items ?? []).map((a: any) => ({
                  id: a.id,
                  fecha: a.fecha,
                  almacen: g.almacenName,
                  almacen_id: a.almacen_id,
                  usuario: g.userName,
                  codigo: a.productos?.codigo ?? '',
                  producto: a.productos?.nombre ?? '',
                  cantidad_anterior: a.cantidad_anterior,
                  cantidad_nueva: a.cantidad_nueva,
                  diferencia: a.diferencia,
                  motivo: a.motivo ?? g.motivo ?? '',
                }))
              );
            }, [historial]);

            const filteredH = useMemo(() => {
              let list = allItems;
              const almF = filtersH.almacen;
              if (almF && almF.length > 0) list = list.filter(l => almF.includes(l.almacen_id));
              if (searchH) {
                const s = searchH.toLowerCase();
                list = list.filter(l =>
                  l.producto.toLowerCase().includes(s) ||
                  l.codigo.toLowerCase().includes(s) ||
                  l.almacen.toLowerCase().includes(s) ||
                  l.usuario.toLowerCase().includes(s) ||
                  l.motivo.toLowerCase().includes(s)
                );
              }
              if (desdeH) list = list.filter(l => (l.fecha ?? '') >= desdeH);
              if (hastaH) list = list.filter(l => (l.fecha ?? '') <= hastaH);
              return list;
            }, [allItems, searchH, filtersH.almacen, desdeH, hastaH]);

            const totalH = filteredH.length;
            const fromH = Math.min((pageH - 1) * PAGE_SIZE_H + 1, totalH);
            const toH = Math.min(pageH * PAGE_SIZE_H, totalH);
            const pageDataH = filteredH.slice(fromH - 1, toH);
            const totalDiffH = filteredH.reduce((s, l) => s + (l.diferencia ?? 0), 0);

            const groupsH = useMemo(() => groupData(pageDataH, groupByH, (item: any, key) => {
              if (key === 'almacen') return item.almacen;
              if (key === 'producto') return item.producto;
              if (key === 'motivo') return item.motivo || 'Sin motivo';
              if (key === 'usuario') return item.usuario;
              if (key.startsWith('fecha')) return dateGroupLabel(item.fecha, key as any);
              return '';
            }, groupByLevelsH), [pageDataH, groupByH, groupByLevelsH]);

            const renderDetalleTable = (items: any[]) => (
              <div className={cn(!groupByH && "bg-card border border-border rounded overflow-x-auto")}>
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="border-b border-table-border text-left">
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Fecha</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Almacén</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden lg:table-cell">Usuario</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Código</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px]">Producto</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Anterior</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Nueva</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] text-right">Diferencia</th>
                      <th className="py-2 px-3 text-muted-foreground font-medium text-[11px] hidden md:table-cell">Motivo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.length === 0 && (
                      <tr><td colSpan={9} className="text-center py-12 text-muted-foreground">No hay ajustes.</td></tr>
                    )}
                    {items.map((l: any) => (
                      <tr key={l.id} className="border-b border-table-border transition-colors hover:bg-table-hover">
                        <td className="py-2 px-3 text-muted-foreground">{fmtDate(l.fecha)}</td>
                        <td className="py-2 px-3">{l.almacen}</td>
                        <td className="py-2 px-3 hidden lg:table-cell text-muted-foreground">{l.usuario}</td>
                        <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{l.codigo}</td>
                        <td className="py-2 px-3 font-medium">{l.producto}</td>
                        <td className="py-2 px-3 text-right font-mono">{l.cantidad_anterior}</td>
                        <td className="py-2 px-3 text-right font-mono">{l.cantidad_nueva}</td>
                        <td className={`py-2 px-3 text-right font-mono font-semibold ${l.diferencia > 0 ? 'text-green-600' : l.diferencia < 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                          {l.diferencia > 0 ? '+' : ''}{l.diferencia}
                        </td>
                        <td className="py-2 px-3 hidden md:table-cell text-xs text-muted-foreground truncate max-w-[200px]">{l.motivo}</td>
                      </tr>
                    ))}
                  </tbody>
                  {items.length > 0 && (
                    <tfoot>
                      <tr className="bg-card border-t border-border font-semibold text-[12px]">
                        <td colSpan={7} className="py-2 px-3 text-muted-foreground">{items.length} ajustes</td>
                        <td className={`py-2 px-3 text-right font-mono font-bold ${items.reduce((s: number, l: any) => s + (l.diferencia ?? 0), 0) >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                          {(() => { const d = items.reduce((s: number, l: any) => s + (l.diferencia ?? 0), 0); return (d > 0 ? '+' : '') + d; })()}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            );

            return (
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <OdooFilterBar
                    search={searchH}
                    onSearchChange={val => { setSearchH(val); setPageH(1); }}
                    placeholder="Buscar por producto, almacén, usuario o motivo..."
                    filterOptions={AJUSTE_FILTER_OPTIONS}
                    activeFilters={filtersH}
                    onToggleFilter={(key, val) => { toggleFilterValueH(key, val); setPageH(1); }}
                    onSetFilter={(key, vals) => { setFilterH(key, vals); setPageH(1); }}
                    onClearFilters={() => { clearFiltersH(); setPageH(1); }}
                    groupByOptions={AJUSTE_GROUP_BY_OPTIONS}
                    activeGroupBy={groupByH}
                    onGroupByChange={setGroupByH}
                    activeGroupByLevels={groupByLevelsH}
                    onGroupByLevelChange={setGroupByLevelH}
                    dateFrom={desdeH}
                    dateTo={hastaH}
                    onDateFromChange={setDesdeH}
                    onDateToChange={setHastaH}
                  />
                  <div className="flex items-center gap-2 shrink-0">
                    <ExportButton
                      onExcel={() => exportToExcel({ fileName: 'Ajustes_Inventario', title: 'Historial de Ajustes de Inventario', columns: AJUSTE_DETALLE_COLUMNS, data: filteredH, totals: { diferencia: totalDiffH } })}
                      onPDF={() => exportToPDF({ fileName: 'Ajustes_Inventario', title: 'Historial de Ajustes de Inventario', columns: AJUSTE_DETALLE_COLUMNS, data: filteredH, totals: { diferencia: totalDiffH } })}
                    />
                  </div>
                </div>

                {totalH > 0 && (
                  <div className="flex items-center gap-6 text-xs text-muted-foreground bg-card rounded px-3 py-2">
                    <span><strong className="text-foreground">{totalH}</strong> ajustes</span>
                    <span>Diferencia total: <strong className={totalDiffH >= 0 ? 'text-green-600' : 'text-destructive'}>{totalDiffH > 0 ? '+' : ''}{totalDiffH}</strong></span>
                  </div>
                )}

                {loadingHistorial ? (
                  <div className="text-center text-muted-foreground py-8">Cargando...</div>
                ) : (
                  <>
                    <GroupedTableWrapper groupBy={groupByH} groups={groupsH} renderTable={renderDetalleTable} />
                    {!groupByH && totalH > 0 && (
                      <OdooPagination from={fromH} to={toH} total={totalH}
                        onPrev={() => setPageH(p => Math.max(1, p - 1))}
                        onNext={() => setPageH(p => p + 1)}
                      />
                    )}
                  </>
                )}
              </div>
            );
          })()}
        </TabsContent>
      </Tabs>

      {/* Reset Dialog */}
      <Dialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" /> Reiniciar stock a ceros
            </DialogTitle>
            <DialogDescription>
              Esto pondrá el stock de <strong>todos los productos</strong> en 0. Se registrará un ajuste y movimiento por cada producto como historial.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Motivo</Label>
              <Textarea
                value={resetMotivo}
                onChange={e => setResetMotivo(e.target.value)}
                rows={2}
                placeholder="Ej: Cierre de ejercicio, inventario inicial..."
              />
            </div>
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3">
              <p className="text-sm text-destructive font-medium">⚠️ Esta acción no se puede deshacer</p>
              <p className="text-xs text-muted-foreground mt-1">
                Se registrará quién lo hizo ({profile?.nombre || user?.email}), cuándo y el motivo.
              </p>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowResetDialog(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={resetStock} disabled={resetting}>
                <RotateCcw className="h-4 w-4 mr-1.5" />
                {resetting ? 'Reiniciando...' : 'Confirmar reinicio'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DocumentPreviewModal
        open={showPdfModal}
        onClose={() => { setShowPdfModal(false); setPdfBlob(null); }}
        pdfBlob={pdfBlob}
        fileName={`ajuste-inventario-${todayLocal()}.pdf`}
        empresaId={empresa?.id ?? ''}
        defaultPhone=""
        caption="Ajuste de inventario"
        tipo="ajuste"
      />
    </div>
  );
}
