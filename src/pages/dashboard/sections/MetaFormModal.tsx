import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useUpsertMeta, type MetaInput, type MetaVenta } from '../hooks/useMetasVenta';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  editing?: MetaVenta | null;
}

type Tipo = 'general' | 'producto' | 'categoria' | 'marca';

const TIPO_OPTS: { value: Tipo; label: string; hint: string }[] = [
  { value: 'general', label: 'General (monto)', hint: 'Meta mensual por monto, sin filtro de producto.' },
  { value: 'producto', label: 'Producto', hint: 'Meta para un producto (y opcionalmente su presentación).' },
  { value: 'categoria', label: 'Categoría', hint: 'Suma de ventas de todos los productos de una categoría.' },
  { value: 'marca', label: 'Marca', hint: 'Suma de ventas de todos los productos de una marca.' },
];

export default function MetaFormModal({ open, onClose, year, month, editing }: Props) {
  const { empresa } = useAuth();
  const upsert = useUpsertMeta();

  const [tipo, setTipo] = useState<Tipo>('general');
  const [vendedorId, setVendedorId] = useState<string>('');
  const [productoId, setProductoId] = useState<string>('');
  const [presentacionId, setPresentacionId] = useState<string>('');
  const [clasificacionId, setClasificacionId] = useState<string>('');
  const [marcaId, setMarcaId] = useState<string>('');
  const [metaUnidades, setMetaUnidades] = useState<string>('0');
  const [metaMonto, setMetaMonto] = useState<string>('0');
  const [notas, setNotas] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    let t: Tipo = 'general';
    if (editing?.producto_id) t = 'producto';
    else if (editing?.clasificacion_id) t = 'categoria';
    else if (editing?.marca_id) t = 'marca';
    setTipo(t);
    setVendedorId(editing?.vendedor_id ?? '');
    setProductoId(editing?.producto_id ?? '');
    setPresentacionId(editing?.presentacion_id ?? '');
    setClasificacionId(editing?.clasificacion_id ?? '');
    setMarcaId(editing?.marca_id ?? '');
    setMetaUnidades(String(editing?.meta_unidades ?? 0));
    setMetaMonto(String(editing?.meta_monto ?? 0));
    setNotas(editing?.notas ?? '');
  }, [open, editing]);

  const vendedoresQ = useQuery({
    queryKey: ['metas-meta-vendedores', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase
        .from('profiles' as any)
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('estado', 'activo')
        .order('nombre');
      return (data ?? []) as unknown as { id: string; nombre: string }[];
    },
  });

  const productosQ = useQuery({
    queryKey: ['metas-meta-productos', empresa?.id],
    enabled: !!empresa?.id && open && tipo === 'producto',
    queryFn: async () => {
      const { data } = await supabase
        .from('productos' as any)
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .order('nombre')
        .limit(2000);
      return (data ?? []) as unknown as { id: string; nombre: string }[];
    },
  });

  const presentacionesQ = useQuery({
    queryKey: ['metas-meta-presentaciones', empresa?.id, productoId],
    enabled: !!empresa?.id && open && tipo === 'producto' && !!productoId,
    queryFn: async () => {
      const { data } = await supabase
        .from('producto_presentaciones' as any)
        .select('id, nombre')
        .eq('producto_id', productoId)
        .order('nombre');
      return (data ?? []) as unknown as { id: string; nombre: string }[];
    },
  });

  const clasificacionesQ = useQuery({
    queryKey: ['metas-meta-clasificaciones', empresa?.id],
    enabled: !!empresa?.id && open && tipo === 'categoria',
    queryFn: async () => {
      const { data } = await supabase
        .from('clasificaciones' as any)
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .order('nombre');
      return (data ?? []) as unknown as { id: string; nombre: string }[];
    },
  });

  const marcasQ = useQuery({
    queryKey: ['metas-meta-marcas', empresa?.id],
    enabled: !!empresa?.id && open && tipo === 'marca',
    queryFn: async () => {
      const { data } = await supabase
        .from('marcas' as any)
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .order('nombre');
      return (data ?? []) as unknown as { id: string; nombre: string }[];
    },
  });

  const vendedorOptions = useMemo(
    () => [{ value: '', label: '— Todos los vendedores (empresa) —' }, ...((vendedoresQ.data ?? []).map((v) => ({ value: v.id, label: v.nombre })))],
    [vendedoresQ.data]
  );
  const productoOptions = useMemo(
    () => (productosQ.data ?? []).map((p) => ({ value: p.id, label: p.nombre })),
    [productosQ.data]
  );
  const presentacionOptions = useMemo(
    () => [{ value: '', label: '— Sin presentación específica —' }, ...((presentacionesQ.data ?? []).map((p) => ({ value: p.id, label: p.nombre })))],
    [presentacionesQ.data]
  );
  const clasificacionOptions = useMemo(
    () => (clasificacionesQ.data ?? []).map((c) => ({ value: c.id, label: c.nombre })),
    [clasificacionesQ.data]
  );
  const marcaOptions = useMemo(
    () => (marcasQ.data ?? []).map((m) => ({ value: m.id, label: m.nombre })),
    [marcasQ.data]
  );

  const changeTipo = (t: Tipo) => {
    setTipo(t);
    setProductoId(''); setPresentacionId(''); setClasificacionId(''); setMarcaId('');
  };

  const canSave = () => {
    if (tipo === 'producto' && !productoId) return false;
    if (tipo === 'categoria' && !clasificacionId) return false;
    if (tipo === 'marca' && !marcaId) return false;
    return (Number(metaMonto) || 0) > 0 || (Number(metaUnidades) || 0) > 0;
  };

  const submit = async () => {
    const input: MetaInput = {
      id: editing?.id,
      vendedor_id: vendedorId || null,
      producto_id: tipo === 'producto' ? (productoId || null) : null,
      presentacion_id: tipo === 'producto' && productoId ? (presentacionId || null) : null,
      clasificacion_id: tipo === 'categoria' ? (clasificacionId || null) : null,
      marca_id: tipo === 'marca' ? (marcaId || null) : null,
      periodo_year: year,
      periodo_month: month,
      meta_unidades: Number(metaUnidades) || 0,
      meta_monto: Number(metaMonto) || 0,
      notas: notas.trim() || null,
    };
    await upsert.mutateAsync(input);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[60] max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Editar meta' : 'Nueva meta'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Tipo de meta */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Tipo de meta</label>
            <div className="grid grid-cols-2 gap-2 mt-1">
              {TIPO_OPTS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => changeTipo(t.value)}
                  className={cn(
                    'text-left rounded-lg border px-3 py-2 text-xs transition',
                    tipo === t.value
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:bg-accent'
                  )}
                >
                  <div className="font-semibold">{t.label}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{t.hint}</div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Vendedor</label>
            <SearchableSelect options={vendedorOptions} value={vendedorId} onChange={setVendedorId} placeholder="Vendedor..." />
          </div>

          {tipo === 'producto' && (
            <>
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Producto *</label>
                <SearchableSelect options={productoOptions} value={productoId} onChange={(v) => { setProductoId(v); setPresentacionId(''); }} placeholder="Producto..." />
              </div>
              {productoId && (
                <div>
                  <label className="text-xs font-semibold text-muted-foreground">Presentación (opcional)</label>
                  <SearchableSelect options={presentacionOptions} value={presentacionId} onChange={setPresentacionId} placeholder="Presentación..." />
                </div>
              )}
            </>
          )}

          {tipo === 'categoria' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Categoría *</label>
              <SearchableSelect options={clasificacionOptions} value={clasificacionId} onChange={setClasificacionId} placeholder="Categoría..." />
            </div>
          )}

          {tipo === 'marca' && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Marca *</label>
              <SearchableSelect options={marcaOptions} value={marcaId} onChange={setMarcaId} placeholder="Marca..." />
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Meta unidades</label>
              <Input type="number" step="0.001" inputMode="decimal" value={metaUnidades} onChange={(e) => setMetaUnidades(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Meta monto</label>
              <Input type="number" step="0.01" inputMode="decimal" value={metaMonto} onChange={(e) => setMetaMonto(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Notas</label>
            <Input value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Opcional" />
          </div>

          <div className="text-[11px] text-muted-foreground">
            Periodo: <span className="font-semibold">{String(month).padStart(2, '0')}/{year}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={upsert.isPending || !canSave()}>{upsert.isPending ? 'Guardando...' : 'Guardar meta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
