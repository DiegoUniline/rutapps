import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2, Plus, Check, FileText } from 'lucide-react';
import { OdooStatusbar } from '@/components/OdooStatusbar';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import SearchableSelect from '@/components/SearchableSelect';
import ProductSearchInput from '@/components/ProductSearchInput';
import { generarTraspasoPdf } from '@/lib/traspasoPdf';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const TIPO_LABELS: Record<string, string> = {
  almacen_almacen: 'Almacén → Almacén',
  almacen_ruta: 'Almacén → Ruta',
  ruta_almacen: 'Ruta → Almacén',
};

const STEPS = [
  { key: 'borrador', label: 'Borrador' },
  { key: 'confirmado', label: 'Confirmado' },
];

interface LineaForm {
  id?: string;
  producto_id: string;
  cantidad: number;
}

function emptyLine(): LineaForm {
  return { producto_id: '', cantidad: 1 };
}

export default function TraspasoFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { empresa, user, profile } = useAuth();
  const qc = useQueryClient();
  const isNew = id === 'nuevo';

  const [tipo, setTipo] = useState('almacen_almacen');
  const [almacenOrigenId, setAlmacenOrigenId] = useState('');
  const [almacenDestinoId, setAlmacenDestinoId] = useState('');
  const [vendedorOrigenId, setVendedorOrigenId] = useState('');
  const [vendedorDestinoId, setVendedorDestinoId] = useState('');
  const [notas, setNotas] = useState('');
  const [status, setStatus] = useState('borrador');
  const [folio, setFolio] = useState('');
  const [lineas, setLineas] = useState<LineaForm[]>([emptyLine()]);
  const [dirty, setDirty] = useState(false);

  const readOnly = !isNew && status !== 'borrador';

  // Fetch existing traspaso
  const { data: existing, isLoading } = useQuery({
    queryKey: ['traspaso', id],
    enabled: !isNew && !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('traspasos')
        .select('*, almacen_origen:almacenes!traspasos_almacen_origen_id_fkey(nombre), almacen_destino:almacenes!traspasos_almacen_destino_id_fkey(nombre), vendedor_origen:vendedores!traspasos_vendedor_origen_id_fkey(nombre), vendedor_destino:vendedores!traspasos_vendedor_destino_id_fkey(nombre)')
        .eq('id', id!)
        .single();
      if (error) throw error;
      const { data: lines } = await supabase
        .from('traspaso_lineas')
        .select('*')
        .eq('traspaso_id', id!);
      return { ...data, lineas: lines ?? [] };
    },
  });

  // Fetch almacenes & vendedores
  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  const { data: vendedores } = useQuery({
    queryKey: ['vendedores-list', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  // Fetch ALL products (for display on existing traspasos)
  const { data: allProductos } = useQuery({
    queryKey: ['productos-select', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, codigo, nombre, cantidad').eq('empresa_id', empresa!.id).order('nombre');
      return data ?? [];
    },
  });

  // Fetch stock_camion for ruta origin
  const { data: stockCamion } = useQuery({
    queryKey: ['stock-camion-vendedor', vendedorOrigenId],
    enabled: tipo === 'ruta_almacen' && !!vendedorOrigenId,
    queryFn: async () => {
      const { data } = await supabase.from('stock_camion')
        .select('producto_id, cantidad_actual')
        .eq('vendedor_id', vendedorOrigenId)
        .gt('cantidad_actual', 0);
      return data ?? [];
    },
  });

  // Filtered product list: only those with stock > 0 from the selected origin
  const productosList = useMemo(() => {
    if (!allProductos) return [];
    if (readOnly) return allProductos; // show all for read-only view

    if (tipo === 'ruta_almacen') {
      // Only products that have stock_camion > 0 for the selected vendedor
      if (!stockCamion || !vendedorOrigenId) return [];
      const scMap = new Map(stockCamion.map(s => [s.producto_id, s.cantidad_actual]));
      return allProductos
        .filter(p => (scMap.get(p.id) ?? 0) > 0)
        .map(p => ({ ...p, cantidad: scMap.get(p.id) ?? 0 }));
    }

    // almacen_almacen or almacen_ruta: filter by productos.cantidad > 0
    return allProductos.filter(p => (p.cantidad ?? 0) > 0);
  }, [allProductos, stockCamion, tipo, vendedorOrigenId, readOnly]);

  // Max stock map for validation
  const maxStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (tipo === 'ruta_almacen' && stockCamion) {
      stockCamion.forEach(s => map.set(s.producto_id, s.cantidad_actual));
    } else if (allProductos) {
      allProductos.forEach(p => map.set(p.id, p.cantidad ?? 0));
    }
    return map;
  }, [allProductos, stockCamion, tipo]);

  const almacenOpts = (almacenes ?? []).map(a => ({ value: a.id, label: a.nombre }));
  const vendedorOpts = (vendedores ?? []).map(v => ({ value: v.id, label: v.nombre }));

  // Load existing data
  useEffect(() => {
    if (existing) {
      setTipo(existing.tipo);
      setAlmacenOrigenId(existing.almacen_origen_id ?? '');
      setAlmacenDestinoId(existing.almacen_destino_id ?? '');
      setVendedorOrigenId(existing.vendedor_origen_id ?? '');
      setVendedorDestinoId(existing.vendedor_destino_id ?? '');
      setNotas(existing.notas ?? '');
      setStatus(existing.status);
      setFolio(existing.folio ?? '');
      const existingLines = (existing.lineas ?? []).map((l: any) => ({
        id: l.id,
        producto_id: l.producto_id,
        cantidad: l.cantidad,
      }));
      setLineas(readOnly ? existingLines : [...existingLines, emptyLine()]);
    }
  }, [existing]);

  // Cell refs for keyboard navigation
  const cellRefs = useRef<Map<string, HTMLElement>>(new Map());
  const setCellRef = useCallback((row: number, col: number, el: HTMLElement | null) => {
    const key = `${row}-${col}`;
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  }, []);
  const focusCell = useCallback((row: number, col: number) => {
    const el = cellRefs.current.get(`${row}-${col}`);
    if (el) { el.focus(); if (el instanceof HTMLInputElement) el.select(); }
  }, []);

  const navigateCell = useCallback((rowIdx: number, colIdx: number, dir: 'next' | 'prev') => {
    if (dir === 'next') {
      if (colIdx < 1) focusCell(rowIdx, colIdx + 1);
      else if (rowIdx >= lineas.length - 1) {
        setLineas(prev => [...prev, emptyLine()]);
        setDirty(true);
        setTimeout(() => focusCell(rowIdx + 1, 0), 50);
      } else focusCell(rowIdx + 1, 0);
    } else {
      if (colIdx > 0) focusCell(rowIdx, colIdx - 1);
      else if (rowIdx > 0) focusCell(rowIdx - 1, 1);
    }
  }, [lineas.length, focusCell]);

  const handleCellKeyDown = (e: React.KeyboardEvent, rowIdx: number, colIdx: number) => {
    if (e.key === 'Tab' || e.key === 'Enter') {
      e.preventDefault();
      navigateCell(rowIdx, colIdx, e.shiftKey ? 'prev' : 'next');
    }
  };

  const handleProductSelect = (idx: number, productoId: string) => {
    if (readOnly) return;
    setLineas(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], producto_id: productoId };
      return next;
    });
    setDirty(true);
  };

  const updateLine = (idx: number, field: string, val: any) => {
    if (readOnly) return;
    setLineas(prev => {
      const next = [...prev];
      const line = { ...next[idx], [field]: val };
      // Cap quantity at max stock
      if (field === 'cantidad' && line.producto_id) {
        const maxStock = maxStockMap.get(line.producto_id) ?? 0;
        if (val > maxStock) line.cantidad = maxStock;
      }
      next[idx] = line;
      return next;
    });
    setDirty(true);
  };

  const removeLine = (idx: number) => {
    if (readOnly) return;
    const next = lineas.filter((_, i) => i !== idx);
    setLineas(next.length === 0 ? [emptyLine()] : next);
    setDirty(true);
  };

  const addLine = () => {
    if (readOnly) return;
    setLineas(prev => [...prev, emptyLine()]);
    setDirty(true);
    setTimeout(() => focusCell(lineas.length, 0), 50);
  };

  // Save mutation
  const saveMut = useMutation({
    mutationFn: async () => {
      const validLines = lineas.filter(l => l.producto_id && l.cantidad > 0);
      if (validLines.length === 0) throw new Error('Agrega al menos un producto');

      // Validate stock before saving
      for (const l of validLines) {
        const maxStock = maxStockMap.get(l.producto_id) ?? 0;
        if (l.cantidad > maxStock) {
          const prod = allProductos?.find(p => p.id === l.producto_id);
          throw new Error(`"${prod?.nombre}" excede stock disponible (${maxStock})`);
        }
      }

      const insert: any = {
        empresa_id: empresa!.id,
        tipo,
        user_id: user!.id,
        notas: notas || null,
      };

      if (tipo === 'almacen_almacen') {
        if (!almacenOrigenId || !almacenDestinoId) throw new Error('Selecciona ambos almacenes');
        if (almacenOrigenId === almacenDestinoId) throw new Error('Los almacenes deben ser diferentes');
        insert.almacen_origen_id = almacenOrigenId;
        insert.almacen_destino_id = almacenDestinoId;
      } else if (tipo === 'almacen_ruta') {
        if (!almacenOrigenId || !vendedorDestinoId) throw new Error('Selecciona almacén y ruta destino');
        insert.almacen_origen_id = almacenOrigenId;
        insert.vendedor_destino_id = vendedorDestinoId;
      } else {
        if (!vendedorOrigenId || !almacenDestinoId) throw new Error('Selecciona ruta origen y almacén destino');
        insert.vendedor_origen_id = vendedorOrigenId;
        insert.almacen_destino_id = almacenDestinoId;
      }

      if (isNew) {
        const { data: traspaso, error } = await supabase
          .from('traspasos')
          .insert(insert)
          .select('id')
          .single();
        if (error) throw error;

        const { error: lErr } = await supabase.from('traspaso_lineas').insert(
          validLines.map(l => ({ traspaso_id: traspaso.id, producto_id: l.producto_id, cantidad: l.cantidad }))
        );
        if (lErr) throw lErr;
        return traspaso;
      } else {
        const { error } = await supabase
          .from('traspasos')
          .update(insert as any)
          .eq('id', id!);
        if (error) throw error;

        await supabase.from('traspaso_lineas').delete().eq('traspaso_id', id!);
        const { error: lErr } = await supabase.from('traspaso_lineas').insert(
          validLines.map(l => ({ traspaso_id: id!, producto_id: l.producto_id, cantidad: l.cantidad }))
        );
        if (lErr) throw lErr;
        return { id };
      }
    },
    onSuccess: (result) => {
      toast.success('Traspaso guardado');
      qc.invalidateQueries({ queryKey: ['traspasos'] });
      qc.invalidateQueries({ queryKey: ['traspaso', id] });
      if (isNew) navigate(`/almacen/traspasos/${result.id}`, { replace: true });
      setDirty(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Confirm mutation (applies stock changes)
  const confirmarMut = useMutation({
    mutationFn: async () => {
      const traspasoId = id!;
      const { data: traspaso } = await supabase.from('traspasos').select('*').eq('id', traspasoId).single();
      if (!traspaso) throw new Error('Traspaso no encontrado');

      const { data: tLineas } = await supabase.from('traspaso_lineas').select('*').eq('traspaso_id', traspasoId);
      const today = new Date().toISOString().slice(0, 10);

      for (const l of tLineas ?? []) {
        if (traspaso.almacen_origen_id) {
          const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
          const stock = prod?.cantidad ?? 0;
          if (l.cantidad > stock) {
            const { data: p } = await supabase.from('productos').select('nombre').eq('id', l.producto_id).single();
            throw new Error(`Stock insuficiente para "${p?.nombre}". Disponible: ${stock}`);
          }
          await supabase.from('productos').update({ cantidad: Math.max(0, stock - l.cantidad) } as any).eq('id', l.producto_id);
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id,
            cantidad: l.cantidad, almacen_origen_id: traspaso.almacen_origen_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio}`,
          } as any);
        }

        if (traspaso.vendedor_origen_id) {
          const { data: sc } = await supabase.from('stock_camion')
            .select('id, cantidad_actual')
            .eq('vendedor_id', traspaso.vendedor_origen_id)
            .eq('producto_id', l.producto_id)
            .gt('cantidad_actual', 0)
            .order('created_at', { ascending: true })
            .limit(1)
            .single();
          if (sc) {
            if (l.cantidad > sc.cantidad_actual) {
              const { data: p } = await supabase.from('productos').select('nombre').eq('id', l.producto_id).single();
              throw new Error(`Stock insuficiente en ruta para "${p?.nombre}". Disponible: ${sc.cantidad_actual}`);
            }
            await supabase.from('stock_camion').update({ cantidad_actual: Math.max(0, sc.cantidad_actual - l.cantidad) } as any).eq('id', sc.id);
          }
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id,
            cantidad: l.cantidad, vendedor_destino_id: traspaso.vendedor_origen_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio} (salida ruta)`,
          } as any);
        }

        if (traspaso.almacen_destino_id) {
          const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
          await supabase.from('productos').update({ cantidad: (prod?.cantidad ?? 0) + Number(l.cantidad) } as any).eq('id', l.producto_id);
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'entrada', producto_id: l.producto_id,
            cantidad: l.cantidad, almacen_destino_id: traspaso.almacen_destino_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio}`,
          } as any);
        }

        if (traspaso.vendedor_destino_id) {
          await supabase.from('stock_camion').insert({
            empresa_id: empresa!.id, vendedor_id: traspaso.vendedor_destino_id,
            producto_id: l.producto_id, cantidad_inicial: l.cantidad,
            cantidad_actual: l.cantidad, fecha: today,
          } as any);
          await supabase.from('movimientos_inventario').insert({
            empresa_id: empresa!.id, tipo: 'entrada', producto_id: l.producto_id,
            cantidad: l.cantidad, vendedor_destino_id: traspaso.vendedor_destino_id,
            referencia_tipo: 'traspaso', referencia_id: traspasoId,
            user_id: user?.id, fecha: today, notas: `Traspaso ${traspaso.folio} (entrada ruta)`,
          } as any);
        }
      }

      await supabase.from('traspasos').update({ status: 'confirmado' } as any).eq('id', traspasoId);
    },
    onSuccess: () => {
      toast.success('Traspaso confirmado — stock actualizado');
      setStatus('confirmado');
      qc.invalidateQueries({ queryKey: ['traspasos'] });
      qc.invalidateQueries({ queryKey: ['traspaso', id] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['stock-camion'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleDelete = async () => {
    if (!id || !confirm('¿Eliminar este traspaso?')) return;
    await supabase.from('traspaso_lineas').delete().eq('traspaso_id', id);
    await supabase.from('traspasos').delete().eq('id', id);
    toast.success('Traspaso eliminado');
    qc.invalidateQueries({ queryKey: ['traspasos'] });
    navigate('/almacen/traspasos');
  };

  if (!isNew && isLoading) {
    return <div className="p-4 min-h-full"><TableSkeleton rows={6} cols={4} /></div>;
  }

  // Derive display labels
  const origenLabel = almacenOpts.find(a => a.value === almacenOrigenId)?.label
    || vendedorOpts.find(v => v.value === vendedorOrigenId)?.label || '';
  const destinoLabel = almacenOpts.find(a => a.value === almacenDestinoId)?.label
    || vendedorOpts.find(v => v.value === vendedorDestinoId)?.label || '';

  return (
    <div className="min-h-full">
      {/* Header bar */}
      <div className="bg-card border-b border-border px-5 py-2.5 flex items-center justify-between gap-3 sticky top-0 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate('/almacen/traspasos')} className="btn-odoo-secondary !px-2.5">
            <ArrowLeft className="h-3.5 w-3.5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold text-foreground truncate">
              {isNew ? 'Nuevo traspaso' : (folio || 'Traspaso')}
            </h1>
            {!isNew && (
              <p className="text-xs text-muted-foreground truncate">{TIPO_LABELS[tipo]}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isNew && status === 'borrador' && (
            <button onClick={() => confirmarMut.mutate()} disabled={confirmarMut.isPending} className="btn-odoo-primary">
              <Check className="h-3.5 w-3.5" /> Confirmar
            </button>
          )}
          {!readOnly && (
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-odoo-primary">
              <Save className="h-3.5 w-3.5" /> Guardar
            </button>
          )}
          {!isNew && status === 'borrador' && (
            <button onClick={handleDelete} className="btn-odoo-secondary text-destructive !px-2">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status bar */}
      {!isNew && (
        <div className="px-5 pt-3">
          <OdooStatusbar steps={STEPS} current={status} />
        </div>
      )}

      {/* Form body */}
      <div className="p-5 space-y-4 max-w-[1200px]">
        <div className="bg-card border border-border rounded-md p-5">
          {readOnly && (
            <div className="mb-3 text-xs text-muted-foreground bg-muted/60 border border-border px-3 py-2 rounded flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/50" />
              Este traspaso está {status} y no se puede editar.
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Col 1 - Tipo */}
            <div className="space-y-3">
              <div>
                <label className="label-odoo">Tipo de traspaso</label>
                {readOnly ? (
                  <div className="text-[13px] py-1.5 px-1 text-foreground">{TIPO_LABELS[tipo]}</div>
                ) : (
                  <div className="flex gap-1">
                    {Object.entries(TIPO_LABELS).map(([k, l]) => (
                      <button key={k}
                        onClick={() => { setTipo(k); setDirty(true); }}
                        className={cn("flex-1 py-1.5 text-[11px] font-medium rounded border transition-colors",
                          tipo === k ? "bg-primary text-primary-foreground border-primary" : "bg-card text-foreground border-input hover:bg-secondary"
                        )}
                      >{l}</button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="label-odoo">Folio</label>
                <div className="text-[13px] text-muted-foreground py-1.5 px-1">
                  {folio || (isNew ? 'Se asigna al guardar' : '—')}
                </div>
              </div>
            </div>

            {/* Col 2 - Origen */}
            <div className="space-y-3">
              {(tipo === 'almacen_almacen' || tipo === 'almacen_ruta') && (
                <div>
                  <label className="label-odoo">Almacén origen</label>
                  {readOnly ? (
                    <div className="text-[13px] py-1.5 px-1 text-foreground">{origenLabel || '—'}</div>
                  ) : (
                    <SearchableSelect options={almacenOpts} value={almacenOrigenId} onChange={v => { setAlmacenOrigenId(v); setDirty(true); }} placeholder="Seleccionar..." />
                  )}
                </div>
              )}
              {tipo === 'ruta_almacen' && (
                <div>
                  <label className="label-odoo">Ruta origen (vendedor)</label>
                  {readOnly ? (
                    <div className="text-[13px] py-1.5 px-1 text-foreground">{origenLabel || '—'}</div>
                  ) : (
                    <SearchableSelect options={vendedorOpts} value={vendedorOrigenId} onChange={v => { setVendedorOrigenId(v); setDirty(true); }} placeholder="Seleccionar..." />
                  )}
                </div>
              )}
            </div>

            {/* Col 3 - Destino */}
            <div className="space-y-3">
              {(tipo === 'almacen_almacen' || tipo === 'ruta_almacen') && (
                <div>
                  <label className="label-odoo">Almacén destino</label>
                  {readOnly ? (
                    <div className="text-[13px] py-1.5 px-1 text-foreground">{destinoLabel || '—'}</div>
                  ) : (
                    <SearchableSelect options={almacenOpts} value={almacenDestinoId} onChange={v => { setAlmacenDestinoId(v); setDirty(true); }} placeholder="Seleccionar..." />
                  )}
                </div>
              )}
              {tipo === 'almacen_ruta' && (
                <div>
                  <label className="label-odoo">Ruta destino (vendedor)</label>
                  {readOnly ? (
                    <div className="text-[13px] py-1.5 px-1 text-foreground">{destinoLabel || '—'}</div>
                  ) : (
                    <SearchableSelect options={vendedorOpts} value={vendedorDestinoId} onChange={v => { setVendedorDestinoId(v); setDirty(true); }} placeholder="Seleccionar..." />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tabs: Líneas + Notas */}
        <div className="bg-card border border-border rounded-md">
          <OdooTabs tabs={[
            {
              key: 'lineas',
              label: 'Productos',
              content: (
                <div className="p-4 space-y-3">
                  <table className="w-full text-[13px]">
                    <thead>
                      <tr className="border-b border-table-border text-left">
                        <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-8">#</th>
                        <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] min-w-[240px]">Producto</th>
                        <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Disponible</th>
                        <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Cantidad</th>
                        <th className="py-2 px-2 w-8"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineas.map((l, idx) => {
                        const prod = (allProductos ?? []).find(p => p.id === l.producto_id);
                        const maxStock = l.producto_id ? (maxStockMap.get(l.producto_id) ?? 0) : 0;
                        const isEmpty = !l.producto_id;
                        const isLast = idx === lineas.length - 1;
                        const overMax = !isEmpty && l.cantidad > maxStock;
                        return (
                          <tr key={idx} className={cn(
                            "border-b border-table-border transition-colors group",
                            isEmpty ? "bg-transparent" : "hover:bg-table-hover",
                            overMax && "bg-destructive/5"
                          )}>
                            <td className="py-1.5 px-2 text-muted-foreground text-xs">{isEmpty ? '' : idx + 1}</td>
                            <td className="py-1 px-2">
                              {readOnly ? (
                                <span className="text-[12px]">{prod ? `${prod.codigo} · ${prod.nombre}` : '—'}</span>
                              ) : (
                                <ProductSearchInput
                                  products={(productosList ?? []).filter(p => {
                                    const usedIds = lineas.filter((_, j) => j !== idx).map(ll => ll.producto_id).filter(Boolean);
                                    return !usedIds.includes(p.id);
                                  }).map(p => ({ id: p.id, codigo: p.codigo, nombre: p.nombre, precio_principal: 0 }))}
                                  value={l.producto_id}
                                  displayText={prod ? `${prod.codigo} · ${prod.nombre}` : undefined}
                                  onSelect={pid => handleProductSelect(idx, pid)}
                                  onNavigate={dir => navigateCell(idx, 0, dir)}
                                  autoFocus={isLast && isEmpty}
                                  readOnly={readOnly}
                                />
                              )}
                            </td>
                            <td className={cn("py-1 px-2 text-right tabular-nums", overMax ? "text-destructive font-semibold" : "text-muted-foreground")}>
                              {!isEmpty ? maxStock : ''}
                            </td>
                            <td className="py-1 px-2 text-right">
                              {readOnly ? (
                                <span className="tabular-nums">{l.cantidad}</span>
                              ) : (
                                <input
                                  ref={el => setCellRef(idx, 1, el)}
                                  type="number"
                                  min={1}
                                  max={maxStock || undefined}
                                  value={l.cantidad || ''}
                                  onChange={e => updateLine(idx, 'cantidad', Number(e.target.value))}
                                  onKeyDown={e => handleCellKeyDown(e, idx, 1)}
                                  className={cn(
                                    "w-full text-right bg-transparent border-0 border-b border-transparent focus:border-primary outline-none py-1 text-[13px] tabular-nums",
                                    overMax && "text-destructive"
                                  )}
                                />
                              )}
                            </td>
                            <td className="py-1 px-2">
                              {!readOnly && !isEmpty && (
                                <button onClick={() => removeLine(idx)} className="opacity-0 group-hover:opacity-100 text-destructive text-xs">×</button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {!readOnly && (
                    <button onClick={addLine} className="btn-odoo-secondary text-xs">
                      <Plus className="h-3 w-3" /> Agregar línea
                    </button>
                  )}
                </div>
              ),
            },
            {
              key: 'notas',
              label: 'Notas',
              content: (
                <div className="p-4">
                  {readOnly ? (
                    <p className="text-[13px] text-foreground whitespace-pre-wrap">{notas || 'Sin notas'}</p>
                  ) : (
                    <textarea
                      value={notas}
                      onChange={e => { setNotas(e.target.value); setDirty(true); }}
                      rows={3}
                      placeholder="Notas internas..."
                      className="w-full text-[13px] bg-transparent border border-input rounded px-3 py-2 focus:border-primary outline-none resize-none"
                    />
                  )}
                </div>
              ),
            },
          ]} />
        </div>
      </div>
    </div>
  );
}
