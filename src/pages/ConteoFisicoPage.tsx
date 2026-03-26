import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Search, Plus, Lock, X, Package, CheckCircle, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ConteoItem {
  id: string;
  producto_id: string;
  codigo: string;
  nombre: string;
  stock_inicial: number;
  cantidad_contada: number | null;
  diferencia: number | null;
  status: string;
  costo_unitario: number;
}

export default function ConteoFisicoPage() {
  const { countId } = useParams<{ countId: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef<HTMLInputElement>(null);
  const cantidadRef = useRef<HTMLInputElement>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [cantidadInput, setCantidadInput] = useState('1');
  const [closeLineId, setCloseLineId] = useState<string | null>(null);

  // Optimistic local state
  const [localCounts, setLocalCounts] = useState<Record<string, number>>({});

  const { data: conteo } = useQuery({
    queryKey: ['conteo-fisico', countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conteos_fisicos')
        .select('*, almacenes(nombre)')
        .eq('id', countId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: items, refetch: refetchItems } = useQuery({
    queryKey: ['conteo-items', countId],
    enabled: !!countId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('conteo_lineas')
        .select('*, productos(codigo, nombre)')
        .eq('conteo_id', countId!)
        .order('created_at');
      if (error) throw error;
      return (data ?? []).map((l: any) => ({
        id: l.id,
        producto_id: l.producto_id,
        codigo: (l.productos as any)?.codigo ?? '',
        nombre: (l.productos as any)?.nombre ?? '',
        stock_inicial: l.stock_inicial,
        cantidad_contada: l.cantidad_contada,
        diferencia: l.diferencia,
        status: l.status,
        costo_unitario: l.costo_unitario,
      })) as ConteoItem[];
    },
  });

  const mergedItems = useMemo(() => {
    return (items ?? []).map(item => ({
      ...item,
      cantidad_contada: localCounts[item.id] !== undefined ? localCounts[item.id] : item.cantidad_contada,
      status: localCounts[item.id] !== undefined && item.status === 'pendiente' ? 'contado' : item.status,
    }));
  }, [items, localCounts]);

  const isClosed = conteo?.status === 'cerrado' || conteo?.status === 'cancelado';
  const totalItems = mergedItems.length;
  const closedItems = mergedItems.filter(i => i.status === 'cerrado').length;
  const pct = totalItems > 0 ? Math.round((closedItems / totalItems) * 100) : 0;

  const selectedItem = useMemo(() => mergedItems.find(i => i.id === selectedItemId), [mergedItems, selectedItemId]);

  // Auto-focus search
  useEffect(() => { searchRef.current?.focus(); }, []);

  const handleSearchEnter = (e: React.KeyboardEvent) => {
    if (e.key !== 'Enter') return;
    const term = searchTerm.trim().toLowerCase();
    if (!term) return;

    const found = mergedItems.find(i =>
      i.codigo.toLowerCase() === term ||
      i.nombre.toLowerCase().includes(term)
    );

    if (!found) { toast.error('Producto no está en este conteo'); return; }
    if (found.status === 'cerrado') { toast.error('Línea cerrada'); return; }

    setSelectedItemId(found.id);
    setSearchTerm('');
    setCantidadInput('1');
    setTimeout(() => cantidadRef.current?.focus(), 50);
  };

  const handleAddEntry = useCallback(async () => {
    if (!selectedItem || !countId || !user) return;
    const qty = Number(cantidadInput) || 0;
    if (qty <= 0) { toast.error('Cantidad debe ser mayor a 0'); return; }

    const prevCount = localCounts[selectedItem.id] ?? selectedItem.cantidad_contada ?? 0;
    const newCount = prevCount + qty;

    // Optimistic update
    setLocalCounts(prev => ({ ...prev, [selectedItem.id]: newCount }));
    setCantidadInput('1');
    toast.success(`+${qty} → ${selectedItem.nombre} → Total: ${newCount}`);

    // Focus back to search
    setSelectedItemId(null);
    setTimeout(() => searchRef.current?.focus(), 50);

    try {
      // Insert entry
      const { error: entryErr } = await supabase.from('conteo_entradas').insert({
        conteo_linea_id: selectedItem.id,
        cantidad: qty,
        creado_por: user.id,
      } as any);
      if (entryErr) throw entryErr;

      // Update line
      await supabase.from('conteo_lineas').update({
        cantidad_contada: newCount,
        status: 'contado',
      } as any).eq('id', selectedItem.id);

      // Update conteo status to en_progreso if abierto
      if (conteo?.status === 'abierto') {
        await supabase.from('conteos_fisicos').update({ status: 'en_progreso' } as any).eq('id', countId);
        qc.invalidateQueries({ queryKey: ['conteo-fisico', countId] });
      }

      // Update productos_contados
      const counted = mergedItems.filter(i => i.status === 'contado' || i.status === 'cerrado' || localCounts[i.id] !== undefined).length;
      await supabase.from('conteos_fisicos').update({ productos_contados: counted } as any).eq('id', countId);

    } catch (err: any) {
      toast.error('Error al guardar entrada');
      // Revert optimistic
      setLocalCounts(prev => {
        const next = { ...prev };
        delete next[selectedItem.id];
        return next;
      });
      refetchItems();
    }
  }, [selectedItem, cantidadInput, countId, user, localCounts, conteo, mergedItems, qc, refetchItems]);

  const handleCloseLine = async () => {
    if (!closeLineId || !countId) return;
    const item = mergedItems.find(i => i.id === closeLineId);
    if (!item) return;

    try {
      const conteoData = conteo;
      const openedAt = conteoData?.abierto_en;
      const now = new Date().toISOString();
      const countedQty = item.cantidad_contada ?? 0;

      // Calculate expected stock from movements
      const { data: movements } = await supabase
        .from('movimientos_inventario')
        .select('tipo, cantidad, referencia_tipo')
        .eq('producto_id', item.producto_id)
        .gte('created_at', openedAt)
        .lte('created_at', now);

      let movDelta = 0;
      for (const m of movements ?? []) {
        if (m.tipo === 'entrada') movDelta += Number(m.cantidad);
        else if (m.tipo === 'salida') movDelta -= Number(m.cantidad);
      }

      const expectedStock = item.stock_inicial + movDelta;
      const difference = countedQty - expectedStock;
      const differenceValue = difference * item.costo_unitario;

      await supabase.from('conteo_lineas').update({
        status: 'cerrado',
        linea_cerrada_en: now,
        stock_esperado: expectedStock,
        diferencia: difference,
        diferencia_valor: differenceValue,
      } as any).eq('id', closeLineId);

      // Recalculate total difference value
      const { data: allLines } = await supabase
        .from('conteo_lineas')
        .select('diferencia_valor')
        .eq('conteo_id', countId)
        .eq('status', 'cerrado');
      const totalDifVal = (allLines ?? []).reduce((s: number, l: any) => s + (l.diferencia_valor ?? 0), 0) + differenceValue;

      await supabase.from('conteos_fisicos').update({
        diferencia_total_valor: totalDifVal,
      } as any).eq('id', countId);

      toast.success('Línea cerrada');
      setCloseLineId(null);
      refetchItems();
      qc.invalidateQueries({ queryKey: ['conteo-fisico', countId] });
    } catch (err: any) {
      toast.error(err.message ?? 'Error al cerrar línea');
    }
  };

  const closeLineItem = mergedItems.find(i => i.id === closeLineId);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/almacen/conteos')}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-base font-semibold truncate font-mono">{conteo?.folio ?? 'Conteo'}</h1>
            <p className="text-xs text-muted-foreground">{(conteo?.almacenes as any)?.nombre}</p>
          </div>
          <Badge variant={isClosed ? 'secondary' : 'default'} className="shrink-0">
            {isClosed && <Lock className="h-3 w-3 mr-1" />}
            {closedItems}/{totalItems} — {pct}%
          </Badge>
        </div>

        {/* Progress bar */}
        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>

        {/* Quick capture */}
        {!isClosed && (
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              ref={searchRef}
              className="pl-9 h-12 text-lg"
              placeholder="Escanear o buscar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              onKeyDown={handleSearchEnter}
            />
          </div>
        )}
      </div>

      {/* Selected product card */}
      {selectedItem && !isClosed && (
        <div className="p-3">
          <Card className="p-3 border-primary ring-2 ring-primary space-y-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{selectedItem.nombre}</p>
                <p className="text-xs text-muted-foreground">Contado: {selectedItem.cantidad_contada ?? 0}</p>
              </div>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => setSelectedItemId(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2">
              <Input
                ref={cantidadRef}
                type="number"
                className="h-12 text-lg font-mono text-center flex-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                value={cantidadInput}
                onChange={e => setCantidadInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAddEntry()}
              />
              <Button size="lg" className="h-12 px-4" onClick={handleAddEntry}>
                <Plus className="h-5 w-5" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="h-12 px-4"
                disabled={(selectedItem.cantidad_contada ?? 0) === 0 && !localCounts[selectedItem.id]}
                onClick={() => setCloseLineId(selectedItem.id)}
              >
                <Lock className="h-5 w-5" />
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Product list */}
      <ScrollArea className="flex-1">
        <div className="divide-y divide-border">
          {mergedItems.map(item => {
            const isSelected = selectedItemId === item.id;
            const isCerrado = item.status === 'cerrado';
            const isContado = item.status === 'contado';

            return (
              <button
                key={item.id}
                className={cn(
                  'w-full p-3 flex items-center gap-3 text-left transition-colors',
                  isCerrado && 'opacity-60 bg-card',
                  isSelected && 'ring-2 ring-primary bg-primary/5',
                  !isCerrado && !isSelected && 'hover:bg-card',
                )}
                onClick={() => {
                  if (isClosed) return;
                  if (isCerrado) { toast.info('Línea cerrada'); return; }
                  setSelectedItemId(item.id);
                  setCantidadInput('1');
                  setTimeout(() => cantidadRef.current?.focus(), 50);
                }}
              >
                {/* Status icon */}
                <div className="shrink-0">
                  {isCerrado ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : isContado ? (
                    <div className="h-5 w-5 rounded-full bg-yellow-500 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-white">{item.cantidad_contada ?? 0}</span>
                    </div>
                  ) : (
                    <Package className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>

                {/* Product info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.nombre}</p>
                  <p className="text-xs text-muted-foreground">{item.codigo}</p>
                </div>

                {/* Counts for closed lines */}
                {isCerrado && (
                  <div className="text-right shrink-0">
                    <p className="text-sm font-mono">{item.cantidad_contada}</p>
                    <p className={cn("text-xs font-mono", (item.diferencia ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                      {(item.diferencia ?? 0) >= 0 ? '+' : ''}{item.diferencia}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </ScrollArea>

      {/* Close line dialog */}
      <AlertDialog open={!!closeLineId} onOpenChange={v => !v && setCloseLineId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cerrar línea?</AlertDialogTitle>
            <AlertDialogDescription>
              Se calculará la diferencia y ya no podrás modificar la cantidad.
              {closeLineItem && (
                <span className="block mt-2 font-medium text-foreground">
                  {closeLineItem.nombre} — Contado: {closeLineItem.cantidad_contada ?? 0}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseLine}>Cerrar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
