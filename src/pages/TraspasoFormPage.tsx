import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Trash2, Plus, Check, FileText, Ban, Search } from 'lucide-react';
import { OdooTabs } from '@/components/OdooTabs';
import { TableSkeleton } from '@/components/TableSkeleton';
import SearchableSelect from '@/components/SearchableSelect';

import { generarTraspasoPdf } from '@/lib/traspasoPdf';
import DocumentPreviewModal from '@/components/DocumentPreviewModal';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn , todayLocal } from '@/lib/utils';
import { usePinAuth } from '@/hooks/usePinAuth';

const TIPO_LABELS: Record<string, string> = {
  almacen_almacen: 'Almacén → Almacén',
  almacen_ruta: 'Almacén → Ruta',
  ruta_almacen: 'Ruta → Almacén',
};

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  borrador: { label: 'Borrador', color: 'bg-muted text-muted-foreground' },
  confirmado: { label: 'Confirmado', color: 'bg-primary text-primary-foreground' },
  cancelado: { label: 'Cancelado', color: 'bg-destructive text-destructive-foreground' },
};

interface LineaForm {
  id?: string;
  producto_id: string;
  cantidad: number;
}

// For the bulk grid: map producto_id → cantidad to transfer
type CantidadesMap = Record<string, number>;

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
  const [lineas, setLineas] = useState<LineaForm[]>([]);
  const [cantidades, setCantidades] = useState<CantidadesMap>({});
  const [gridSearch, setGridSearch] = useState('');
  const [filtroClasificacion, setFiltroClasificacion] = useState('');
  const [filtroMarca, setFiltroMarca] = useState('');
  const [dirty, setDirty] = useState(false);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [showPdfModal, setShowPdfModal] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; action: string; title: string; description: string } | null>(null);
  const { requestPin, PinDialog } = usePinAuth();

  const handleGenerarPdf = () => {
    const blob = generarTraspasoPdf({
      empresa: {
        nombre: empresa?.nombre ?? '',
        razon_social: empresa?.razon_social,
        rfc: empresa?.rfc,
        direccion: empresa?.direccion,
        telefono: empresa?.telefono,
      },
      traspaso: {
        folio: folio || 'Nuevo',
        fecha: todayLocal(),
        status,
        tipo,
        notas: notas || undefined,
      },
      origen: origenLabel || '—',
      destino: destinoLabel || '—',
      responsable: profile?.nombre,
      lineas: lineasFromCantidades.map(l => {
        const prod = allProductos?.find(p => p.id === l.producto_id);
        return {
          codigo: prod?.codigo ?? '',
          nombre: prod?.nombre ?? '',
          cantidad: l.cantidad,
          unidad: (prod as any)?.unidades_venta?.abreviatura || '',
        };
      }),
    });
    setPdfBlob(blob);
    setShowPdfModal(true);
  };

  const readOnly = !isNew && status !== 'borrador';
  const isCancelled = status === 'cancelado';
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

  // Fetch ALL products with clasificacion/marca info
  const { data: allProductos } = useQuery({
    queryKey: ['productos-select', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('productos').select('id, codigo, nombre, cantidad, clasificacion_id, marca_id, unidades_venta:unidades!productos_unidad_venta_id_fkey(nombre, abreviatura)').eq('empresa_id', empresa!.id).eq('status', 'activo').order('nombre');
      return data ?? [];
    },
  });

  // Fetch clasificaciones for filter
  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  // Fetch marcas for filter
  const { data: marcas } = useQuery({
    queryKey: ['marcas', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('marcas').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
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

  // Fetch per-warehouse stock for the selected origin almacen
  const { data: stockAlmacenOrigen } = useQuery({
    queryKey: ['stock-almacen-origen', almacenOrigenId],
    enabled: (tipo === 'almacen_almacen' || tipo === 'almacen_ruta') && !!almacenOrigenId,
    queryFn: async () => {
      const { data } = await supabase.from('stock_almacen')
        .select('producto_id, cantidad')
        .eq('almacen_id', almacenOrigenId)
        .gt('cantidad', 0);
      return data ?? [];
    },
  });

  // Filtered product list: only those with stock > 0 from the selected origin
  const productosList = useMemo(() => {
    if (!allProductos) return [];
    if (readOnly) return allProductos; // show all for read-only view

    if (tipo === 'ruta_almacen') {
      if (!stockCamion || !vendedorOrigenId) return [];
      const scMap = new Map(stockCamion.map(s => [s.producto_id, s.cantidad_actual]));
      return allProductos
        .filter(p => (scMap.get(p.id) ?? 0) > 0)
        .map(p => ({ ...p, cantidad: scMap.get(p.id) ?? 0 }));
    }

    // almacen_almacen or almacen_ruta: filter by stock_almacen for selected origin
    if (almacenOrigenId && stockAlmacenOrigen && stockAlmacenOrigen.length > 0) {
      const saMap = new Map(stockAlmacenOrigen.map(s => [s.producto_id, s.cantidad]));
      return allProductos
        .filter(p => (saMap.get(p.id) ?? 0) > 0)
        .map(p => ({ ...p, cantidad: saMap.get(p.id) ?? 0 }));
    }

    // Fallback: show all products with global stock > 0
    return allProductos.filter(p => (p.cantidad ?? 0) > 0);
  }, [allProductos, stockCamion, stockAlmacenOrigen, tipo, vendedorOrigenId, almacenOrigenId, readOnly]);

  // Max stock map for validation
  const maxStockMap = useMemo(() => {
    const map = new Map<string, number>();
    if (tipo === 'ruta_almacen' && stockCamion) {
      stockCamion.forEach(s => map.set(s.producto_id, s.cantidad_actual));
    } else if (stockAlmacenOrigen && almacenOrigenId) {
      stockAlmacenOrigen.forEach(s => map.set(s.producto_id, s.cantidad));
    } else if (allProductos) {
      allProductos.forEach(p => map.set(p.id, p.cantidad ?? 0));
    }
    return map;
  }, [allProductos, stockCamion, stockAlmacenOrigen, tipo, almacenOrigenId]);

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
      setLineas(existingLines);
      // Build cantidades map from existing lines
      const map: CantidadesMap = {};
      existingLines.forEach((l: LineaForm) => { if (l.producto_id) map[l.producto_id] = l.cantidad; });
      setCantidades(map);
    }
  }, [existing]);

  // Update cantidad for a product in the bulk grid
  const updateCantidad = useCallback((productoId: string, val: number) => {
    if (readOnly) return;
    const maxStock = maxStockMap.get(productoId) ?? 0;
    const capped = Math.min(Math.max(0, val), maxStock);
    setCantidades(prev => {
      const next = { ...prev };
      if (capped > 0) next[productoId] = capped;
      else delete next[productoId];
      return next;
    });
    setDirty(true);
  }, [readOnly, maxStockMap]);

  // Derive lineas from cantidades for save
  const lineasFromCantidades = useMemo(() => {
    return Object.entries(cantidades)
      .filter(([, qty]) => qty > 0)
      .map(([producto_id, cantidad]) => ({ producto_id, cantidad }));
  }, [cantidades]);

  // Filtered products for the bulk grid
  const filteredGridProducts = useMemo(() => {
    let list = productosList ?? [];
    if (gridSearch) {
      const q = gridSearch.toLowerCase();
      list = list.filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q));
    }
    if (filtroClasificacion) {
      list = list.filter(p => (p as any).clasificacion_id === filtroClasificacion);
    }
    if (filtroMarca) {
      list = list.filter(p => (p as any).marca_id === filtroMarca);
    }
    return list;
  }, [productosList, gridSearch, filtroClasificacion, filtroMarca]);

  // Count how many products have quantities assigned
  const totalProductosSeleccionados = Object.keys(cantidades).length;
  const totalUnidades = Object.values(cantidades).reduce((sum, q) => sum + q, 0);

  // Save mutation
  const saveMut = useMutation({
    mutationFn: async () => {
      const validLines = lineasFromCantidades;
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

  // Confirm mutation — single RPC call instead of ~50 sequential HTTP requests
  const confirmarMut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc('confirmar_traspaso', {
        p_traspaso_id: id!,
        p_user_id: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Traspaso confirmado — stock actualizado');
      setStatus('confirmado');
      qc.invalidateQueries({ queryKey: ['traspasos'] });
      qc.invalidateQueries({ queryKey: ['traspaso', id] });
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-select'] });
      qc.invalidateQueries({ queryKey: ['stock-camion'] });
      qc.invalidateQueries({ queryKey: ['stock-almacen-origen'] });
      qc.invalidateQueries({ queryKey: ['inventario-dashboard'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Cancel mutation (reverses stock)
  const cancelarMut = useMutation({
    mutationFn: async () => {
      const traspasoId = id!;
      const { data: traspaso } = await supabase.from('traspasos').select('*').eq('id', traspasoId).single();
      if (!traspaso) throw new Error('Traspaso no encontrado');

      // Only reverse stock if it was confirmed (stock was already moved)
      if (traspaso.status === 'confirmado') {
        const { data: tLineas } = await supabase.from('traspaso_lineas').select('*').eq('traspaso_id', traspasoId);
        const today = todayLocal();

        for (const l of tLineas ?? []) {
          // Reverse: add back to origin
          if (traspaso.almacen_origen_id) {
            // Restore stock_almacen at origin
            const { data: saO } = await supabase.from('stock_almacen')
              .select('id, cantidad')
              .eq('almacen_id', traspaso.almacen_origen_id)
              .eq('producto_id', l.producto_id)
              .maybeSingle();
            if (saO) {
              await supabase.from('stock_almacen').update({ cantidad: (saO.cantidad ?? 0) + Number(l.cantidad), updated_at: new Date().toISOString() } as any).eq('id', saO.id);
            } else {
              await supabase.from('stock_almacen').insert({
                empresa_id: empresa!.id, almacen_id: traspaso.almacen_origen_id,
                producto_id: l.producto_id, cantidad: Number(l.cantidad),
              } as any);
            }
            // Restore global stock
            const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
            await supabase.from('productos').update({ cantidad: (prod?.cantidad ?? 0) + Number(l.cantidad) } as any).eq('id', l.producto_id);
            await supabase.from('movimientos_inventario').insert({
              empresa_id: empresa!.id, tipo: 'entrada', producto_id: l.producto_id,
              cantidad: l.cantidad, almacen_destino_id: traspaso.almacen_origen_id,
              referencia_tipo: 'traspaso', referencia_id: traspasoId,
              user_id: user?.id, fecha: today, notas: `Cancelación traspaso ${traspaso.folio}`,
            } as any);
          }

          if (traspaso.vendedor_origen_id) {
            await supabase.from('stock_camion').insert({
              empresa_id: empresa!.id, vendedor_id: traspaso.vendedor_origen_id,
              producto_id: l.producto_id, cantidad_inicial: l.cantidad,
              cantidad_actual: l.cantidad, fecha: today,
            } as any);
            await supabase.from('movimientos_inventario').insert({
              empresa_id: empresa!.id, tipo: 'entrada', producto_id: l.producto_id,
              cantidad: l.cantidad, vendedor_destino_id: traspaso.vendedor_origen_id,
              referencia_tipo: 'traspaso', referencia_id: traspasoId,
              user_id: user?.id, fecha: today, notas: `Cancelación traspaso ${traspaso.folio} (devuelto a ruta)`,
            } as any);
          }

          // Reverse: subtract from destination
          if (traspaso.almacen_destino_id) {
            // Deduct stock_almacen at destination
            const { data: saD } = await supabase.from('stock_almacen')
              .select('id, cantidad')
              .eq('almacen_id', traspaso.almacen_destino_id)
              .eq('producto_id', l.producto_id)
              .maybeSingle();
            if (saD) {
              await supabase.from('stock_almacen').update({ cantidad: Math.max(0, (saD.cantidad ?? 0) - Number(l.cantidad)), updated_at: new Date().toISOString() } as any).eq('id', saD.id);
            }
            // Deduct global stock
            const { data: prod } = await supabase.from('productos').select('cantidad').eq('id', l.producto_id).single();
            await supabase.from('productos').update({ cantidad: Math.max(0, (prod?.cantidad ?? 0) - Number(l.cantidad)) } as any).eq('id', l.producto_id);
            await supabase.from('movimientos_inventario').insert({
              empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id,
              cantidad: l.cantidad, almacen_origen_id: traspaso.almacen_destino_id,
              referencia_tipo: 'traspaso', referencia_id: traspasoId,
              user_id: user?.id, fecha: today, notas: `Cancelación traspaso ${traspaso.folio}`,
            } as any);
          }

          if (traspaso.vendedor_destino_id) {
            const { data: sc } = await supabase.from('stock_camion')
              .select('id, cantidad_actual')
              .eq('vendedor_id', traspaso.vendedor_destino_id)
              .eq('producto_id', l.producto_id)
              .gt('cantidad_actual', 0)
              .order('created_at', { ascending: false })
              .limit(1)
              .single();
            if (sc) {
              await supabase.from('stock_camion').update({ cantidad_actual: Math.max(0, sc.cantidad_actual - Number(l.cantidad)) } as any).eq('id', sc.id);
            }
            await supabase.from('movimientos_inventario').insert({
              empresa_id: empresa!.id, tipo: 'salida', producto_id: l.producto_id,
              cantidad: l.cantidad, vendedor_destino_id: traspaso.vendedor_destino_id,
              referencia_tipo: 'traspaso', referencia_id: traspasoId,
              user_id: user?.id, fecha: today, notas: `Cancelación traspaso ${traspaso.folio} (retirado de ruta)`,
            } as any);
          }
        }
      }

      await supabase.from('traspasos').update({ status: 'cancelado' } as any).eq('id', traspasoId);
    },
    onSuccess: () => {
      toast.success('Traspaso cancelado — stock revertido');
      setStatus('cancelado');
      Promise.all([
        qc.refetchQueries({ queryKey: ['traspasos'] }),
        qc.refetchQueries({ queryKey: ['traspaso', id] }),
        qc.refetchQueries({ queryKey: ['productos'] }),
        qc.refetchQueries({ queryKey: ['productos-select'] }),
        qc.refetchQueries({ queryKey: ['stock-camion'] }),
        qc.refetchQueries({ queryKey: ['stock-almacen-origen'] }),
        qc.refetchQueries({ queryKey: ['inventario-dashboard'] }),
      ]);
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
          {!readOnly && (
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-odoo-primary">
              <Save className="h-3.5 w-3.5" /> Guardar
            </button>
          )}
          {!isNew && status === 'borrador' && (
            <button
              onClick={() => setConfirmDialog({
                open: true, action: 'confirmar',
                title: 'Confirmar traspaso',
                description: '¿Confirmar este traspaso? Se moverá el stock del origen al destino.',
              })}
              disabled={confirmarMut.isPending}
              className="btn-odoo-primary bg-green-600 hover:bg-green-700 border-green-600"
            >
              <Check className="h-3.5 w-3.5" /> Confirmar
            </button>
          )}
          {!isNew && status !== 'cancelado' && (
            <button
              onClick={() => setConfirmDialog({
                open: true, action: 'cancelar',
                title: 'Cancelar traspaso',
                description: status === 'confirmado'
                  ? '¿Cancelar este traspaso? Se revertirá todo el stock movido.'
                  : '¿Cancelar este traspaso?',
              })}
              disabled={cancelarMut.isPending}
              className="btn-odoo-secondary text-destructive"
            >
              <Ban className="h-3.5 w-3.5" /> Cancelar
            </button>
          )}
          {!isNew && (
            <button onClick={handleGenerarPdf} className="btn-odoo-secondary">
              <FileText className="h-3.5 w-3.5" /> PDF
            </button>
          )}
          {!isNew && status === 'borrador' && (
            <button onClick={handleDelete} className="btn-odoo-secondary text-destructive !px-2">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Status chips */}
      {!isNew && (
        <div className="px-5 pt-3 flex gap-1.5">
          {Object.entries(STATUS_LABELS).map(([key, cfg]) => (
            <span
              key={key}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-all",
                status === key ? cfg.color : "bg-card text-muted-foreground/50"
              )}
            >
              {cfg.label}
            </span>
          ))}
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
              label: `Productos${totalProductosSeleccionados > 0 ? ` (${totalProductosSeleccionados})` : ''}`,
              content: (
                <div className="p-4 space-y-3">
                  {/* Filters bar */}
                  {!readOnly && (
                    <div className="flex flex-wrap gap-2 items-center">
                      <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <input
                          type="text"
                          placeholder="Buscar por código o nombre..."
                          value={gridSearch}
                          onChange={e => setGridSearch(e.target.value)}
                          className="w-full pl-8 pr-3 py-1.5 text-[12px] bg-transparent border border-input rounded focus:border-primary outline-none"
                        />
                      </div>
                      {(clasificaciones ?? []).length > 0 && (
                        <select
                          value={filtroClasificacion}
                          onChange={e => setFiltroClasificacion(e.target.value)}
                          className="text-[12px] border border-input rounded px-2 py-1.5 bg-transparent outline-none focus:border-primary min-w-[140px]"
                        >
                          <option value="">Todas las categorías</option>
                          {(clasificaciones ?? []).map(c => (
                            <option key={c.id} value={c.id}>{c.nombre}</option>
                          ))}
                        </select>
                      )}
                      {(marcas ?? []).length > 0 && (
                        <select
                          value={filtroMarca}
                          onChange={e => setFiltroMarca(e.target.value)}
                          className="text-[12px] border border-input rounded px-2 py-1.5 bg-transparent outline-none focus:border-primary min-w-[140px]"
                        >
                          <option value="">Todas las marcas</option>
                          {(marcas ?? []).map(m => (
                            <option key={m.id} value={m.id}>{m.nombre}</option>
                          ))}
                        </select>
                      )}
                      {totalProductosSeleccionados > 0 && (
                        <span className="text-[11px] text-muted-foreground bg-primary/10 px-2 py-1 rounded">
                          {totalProductosSeleccionados} productos · {totalUnidades} uds
                        </span>
                      )}
                    </div>
                  )}

                  {/* No origin selected warning */}
                  {!readOnly && !almacenOrigenId && !vendedorOrigenId && (
                    <div className="text-center py-8 text-muted-foreground text-[13px]">
                      Selecciona un origen para ver los productos disponibles
                    </div>
                  )}

                  {/* Bulk product grid */}
                  {(readOnly || almacenOrigenId || vendedorOrigenId) && (
                    <div className="max-h-[500px] overflow-auto border border-border rounded">
                      <table className="w-full text-[13px]">
                        <thead className="sticky top-0 bg-card z-[1]">
                          <tr className="border-b border-table-border text-left">
                            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-20">Código</th>
                            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px]">Producto</th>
                            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-24 text-right">Disponible</th>
                            <th className="py-2 px-2 text-muted-foreground font-medium text-[11px] w-28 text-right">A traspasar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {readOnly ? (
                            // Read-only: show only products that were transferred
                            lineas.map((l, idx) => {
                              const prod = (allProductos ?? []).find(p => p.id === l.producto_id);
                              return (
                                <tr key={l.producto_id} className="border-b border-table-border hover:bg-table-hover">
                                  <td className="py-1.5 px-2 text-muted-foreground font-mono text-[11px]">{prod?.codigo ?? ''}</td>
                                  <td className="py-1.5 px-2 text-[12px]">{prod?.nombre ?? '—'}</td>
                                  <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">—</td>
                                  <td className="py-1.5 px-2 text-right tabular-nums font-medium">{l.cantidad}</td>
                                </tr>
                              );
                            })
                          ) : (
                            // Edit mode: show all products with stock
                            filteredGridProducts.length === 0 ? (
                              <tr>
                                <td colSpan={4} className="text-center py-6 text-muted-foreground text-[12px]">
                                  {gridSearch || filtroClasificacion || filtroMarca
                                    ? 'Sin resultados con los filtros actuales'
                                    : 'Sin productos con stock en el origen seleccionado'}
                                </td>
                              </tr>
                            ) : (
                              filteredGridProducts.map(p => {
                                const maxStock = maxStockMap.get(p.id) ?? 0;
                                const qty = cantidades[p.id] ?? 0;
                                const hasQty = qty > 0;
                                return (
                                  <tr key={p.id} className={cn(
                                    "border-b border-table-border transition-colors",
                                    hasQty ? "bg-primary/5 hover:bg-primary/10" : "hover:bg-table-hover"
                                  )}>
                                    <td className="py-1.5 px-2 text-muted-foreground font-mono text-[11px]">{p.codigo}</td>
                                    <td className="py-1.5 px-2 text-[12px]">{p.nombre}</td>
                                    <td className="py-1.5 px-2 text-right text-muted-foreground tabular-nums">{maxStock}</td>
                                    <td className="py-1 px-2 text-right">
                                      <input
                                        type="number"
                                        min={0}
                                        max={maxStock}
                                        value={qty || ''}
                                        placeholder="0"
                                        onChange={e => updateCantidad(p.id, Number(e.target.value))}
                                        className={cn(
                                          "w-full text-right bg-transparent border-0 border-b border-transparent focus:border-primary outline-none py-1 text-[13px] tabular-nums",
                                          hasQty && "font-semibold text-primary"
                                        )}
                                      />
                                    </td>
                                  </tr>
                                );
                              })
                            )
                          )}
                        </tbody>
                      </table>
                    </div>
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

      <DocumentPreviewModal
        open={showPdfModal}
        onClose={() => { setShowPdfModal(false); setPdfBlob(null); }}
        pdfBlob={pdfBlob}
        fileName={`traspaso-${folio || 'doc'}.pdf`}
        empresaId={empresa?.id ?? ''}
        defaultPhone=""
        caption={`Traspaso ${folio}`}
        tipo="traspaso"
        referencia_id={id}
      />

      {/* Confirmation Dialog */}
      <AlertDialog open={!!confirmDialog?.open} onOpenChange={open => { if (!open) setConfirmDialog(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmDialog?.title}</AlertDialogTitle>
            <AlertDialogDescription>{confirmDialog?.description}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>No, volver</AlertDialogCancel>
            <AlertDialogAction
              className={confirmDialog?.action === 'cancelar' ? 'bg-destructive hover:bg-destructive/90' : ''}
              onClick={() => {
                if (confirmDialog?.action === 'confirmar') confirmarMut.mutate();
                else if (confirmDialog?.action === 'cancelar') {
                  requestPin('Cancelar traspaso', 'Ingresa tu PIN para cancelar este traspaso.', () => cancelarMut.mutate());
                }
                setConfirmDialog(null);
              }}
            >
              {confirmDialog?.action === 'cancelar' ? 'Sí, cancelar' : 'Sí, confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PinDialog />
    </div>
  );
}
