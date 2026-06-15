import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useUpsertMeta, useCreateMetasBatch, type MetaInput, type MetaVenta } from '../hooks/useMetasVenta';
import { cn } from '@/lib/utils';
import { X } from 'lucide-react';

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
  { value: 'producto', label: 'Producto', hint: 'Meta para uno o varios productos.' },
  { value: 'categoria', label: 'Categoría', hint: 'Meta para una o varias categorías.' },
  { value: 'marca', label: 'Marca', hint: 'Meta para una o varias marcas.' },
];

export default function MetaFormModal({ open, onClose, year, month, editing }: Props) {
  const { empresa } = useAuth();
  const upsert = useUpsertMeta();
  const batch = useCreateMetasBatch();
  const isEdit = !!editing?.id;

  const [tipo, setTipo] = useState<Tipo>('general');
  const [vendedorId, setVendedorId] = useState<string>('');
  const [productoIds, setProductoIds] = useState<string[]>([]);
  const [presentacionId, setPresentacionId] = useState<string>('');
  const [clasificacionIds, setClasificacionIds] = useState<string[]>([]);
  const [marcaIds, setMarcaIds] = useState<string[]>([]);
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
    setProductoIds(editing?.producto_id ? [editing.producto_id] : []);
    setPresentacionId(editing?.presentacion_id ?? '');
    setClasificacionIds(editing?.clasificacion_id ? [editing.clasificacion_id] : []);
    setMarcaIds(editing?.marca_id ? [editing.marca_id] : []);
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
    queryKey: ['metas-meta-presentaciones', empresa?.id, productoIds[0]],
    enabled: !!empresa?.id && open && tipo === 'producto' && productoIds.length === 1,
    queryFn: async () => {
      const { data } = await supabase
        .from('producto_presentaciones' as any)
        .select('id, nombre')
        .eq('producto_id', productoIds[0])
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

  const productoOptions = useMemo(() => (productosQ.data ?? []).map((p) => ({ value: p.id, label: p.nombre })), [productosQ.data]);
  const presentacionOptions = useMemo(
    () => [{ value: '', label: '— Sin presentación específica —' }, ...((presentacionesQ.data ?? []).map((p) => ({ value: p.id, label: p.nombre })))],
    [presentacionesQ.data]
  );
  const clasificacionOptions = useMemo(() => (clasificacionesQ.data ?? []).map((c) => ({ value: c.id, label: c.nombre })), [clasificacionesQ.data]);
  const marcaOptions = useMemo(() => (marcasQ.data ?? []).map((m) => ({ value: m.id, label: m.nombre })), [marcasQ.data]);

  const changeTipo = (t: Tipo) => {
    setTipo(t);
    setProductoIds([]); setPresentacionId(''); setClasificacionIds([]); setMarcaIds([]);
  };

  const toggleInArray = (arr: string[], id: string) =>
    arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id];

  const canSave = () => {
    if (tipo === 'producto' && productoIds.length === 0) return false;
    if (tipo === 'categoria' && clasificacionIds.length === 0) return false;
    if (tipo === 'marca' && marcaIds.length === 0) return false;
    return (Number(metaMonto) || 0) > 0 || (Number(metaUnidades) || 0) > 0;
  };

  const buildRow = (overrides: Partial<MetaInput>): MetaInput => ({
    vendedor_id: vendedorId || null,
    producto_id: null,
    presentacion_id: null,
    clasificacion_id: null,
    marca_id: null,
    periodo_year: year,
    periodo_month: month,
    meta_unidades: Number(metaUnidades) || 0,
    meta_monto: Number(metaMonto) || 0,
    notas: notas.trim() || null,
    ...overrides,
  });

  const submit = async () => {
    if (isEdit) {
      const input: MetaInput = {
        id: editing!.id,
        ...buildRow({
          producto_id: tipo === 'producto' ? (productoIds[0] || null) : null,
          presentacion_id: tipo === 'producto' && productoIds.length === 1 ? (presentacionId || null) : null,
          clasificacion_id: tipo === 'categoria' ? (clasificacionIds[0] || null) : null,
          marca_id: tipo === 'marca' ? (marcaIds[0] || null) : null,
        }),
      };
      await upsert.mutateAsync(input);
      onClose();
    } else {
      const rows: MetaInput[] = [];
      if (tipo === 'general') {
        rows.push(buildRow({}));
      } else if (tipo === 'producto') {
        for (const pid of productoIds) {
          rows.push(buildRow({
            producto_id: pid,
            presentacion_id: productoIds.length === 1 ? (presentacionId || null) : null,
          }));
        }
      } else if (tipo === 'categoria') {
        for (const cid of clasificacionIds) rows.push(buildRow({ clasificacion_id: cid }));
      } else if (tipo === 'marca') {
        for (const mid of marcaIds) rows.push(buildRow({ marca_id: mid }));
      }
      if (rows.length > 0) {
        await batch.mutateAsync(rows);
        onClose();
      }
    }
  };

  const renderMultiSelect = (
    label: string,
    options: { value: string; label: string }[],
    selected: string[],
    onChange: (ids: string[]) => void
  ) => {
    const toggle = (id: string) => onChange(toggleInArray(selected, id));
    const remove = (id: string) => onChange(selected.filter((x) => x !== id));

    return (
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-muted-foreground">{label}</label>
        {selected.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {selected.map((id) => {
              const opt = options.find((o) => o.value === id);
              return (
                <Badge key={id} variant="secondary" className="text-[10px] gap-1 pr-1">
                  {opt?.label ?? id}
                  <button type="button" onClick={() => remove(id)} className="hover:text-destructive">
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              );
            })}
          </div>
        )}
        <ScrollArea className="border rounded-md h-40">
          <div className="p-2 space-y-1">
            {options.length === 0 ? (
              <div className="text-[11px] text-muted-foreground p-2">Sin opciones disponibles</div>
            ) : (
              options.map((o) => (
                <label
                  key={o.value}
                  className={cn(
                    'flex items-center gap-2 text-xs cursor-pointer px-2 py-1.5 rounded transition',
                    selected.includes(o.value) ? 'bg-primary/10' : 'hover:bg-accent/50'
                  )}
                >
                  <Checkbox
                    checked={selected.includes(o.value)}
                    onCheckedChange={() => toggle(o.value)}
                  />
                  <span className="truncate">{o.label}</span>
                </label>
              ))
            )}
          </div>
        </ScrollArea>
        <div className="text-[10px] text-muted-foreground">{selected.length} seleccionado(s)</div>
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="z-[60] max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Editar meta' : 'Nueva meta'}</DialogTitle>
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
                  disabled={isEdit}
                  className={cn(
                    'text-left rounded-lg border px-3 py-2 text-xs transition',
                    tipo === t.value
                      ? 'border-primary bg-primary/10 text-primary font-semibold'
                      : 'border-border hover:bg-accent',
                    isEdit && tipo !== t.value && 'opacity-50 cursor-not-allowed'
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
              {isEdit ? (
                <>
                  <div>
                    <label className="text-xs font-semibold text-muted-foreground">Producto *</label>
                    <SearchableSelect
                      options={productoOptions}
                      value={productoIds[0] ?? ''}
                      onChange={(v) => { setProductoIds(v ? [v] : []); setPresentacionId(''); }}
                      placeholder="Producto..."
                    />
                  </div>
                  {productoIds.length === 1 && (
                    <div>
                      <label className="text-xs font-semibold text-muted-foreground">Presentación (opcional)</label>
                      <SearchableSelect options={presentacionOptions} value={presentacionId} onChange={setPresentacionId} placeholder="Presentación..." />
                    </div>
                  )}
                </>
              ) : (
                renderMultiSelect('Producto(s) *', productoOptions, productoIds, setProductoIds)
              )}
            </>
          )}

          {tipo === 'categoria' && (
            isEdit ? (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Categoría *</label>
                <SearchableSelect
                  options={clasificacionOptions}
                  value={clasificacionIds[0] ?? ''}
                  onChange={(v) => setClasificacionIds(v ? [v] : [])}
                  placeholder="Categoría..."
                />
              </div>
            ) : (
              renderMultiSelect('Categoría(s) *', clasificacionOptions, clasificacionIds, setClasificacionIds)
            )
          )}

          {tipo === 'marca' && (
            isEdit ? (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Marca *</label>
                <SearchableSelect
                  options={marcaOptions}
                  value={marcaIds[0] ?? ''}
                  onChange={(v) => setMarcaIds(v ? [v] : [])}
                  placeholder="Marca..."
                />
              </div>
            ) : (
              renderMultiSelect('Marca(s) *', marcaOptions, marcaIds, setMarcaIds)
            )
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
          <Button onClick={submit} disabled={upsert.isPending || batch.isPending || !canSave()}>
            {upsert.isPending || batch.isPending ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Guardar metas')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
