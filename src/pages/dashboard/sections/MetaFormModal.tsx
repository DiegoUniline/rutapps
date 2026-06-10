import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import SearchableSelect from '@/components/SearchableSelect';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useUpsertMeta, type MetaInput, type MetaVenta } from '../hooks/useMetasVenta';

interface Props {
  open: boolean;
  onClose: () => void;
  year: number;
  month: number;
  editing?: MetaVenta | null;
}

export default function MetaFormModal({ open, onClose, year, month, editing }: Props) {
  const { empresa } = useAuth();
  const upsert = useUpsertMeta();

  const [vendedorId, setVendedorId] = useState<string>('');
  const [productoId, setProductoId] = useState<string>('');
  const [presentacionId, setPresentacionId] = useState<string>('');
  const [metaUnidades, setMetaUnidades] = useState<string>('0');
  const [metaMonto, setMetaMonto] = useState<string>('0');
  const [notas, setNotas] = useState<string>('');

  useEffect(() => {
    if (!open) return;
    setVendedorId(editing?.vendedor_id ?? '');
    setProductoId(editing?.producto_id ?? '');
    setPresentacionId(editing?.presentacion_id ?? '');
    setMetaUnidades(String(editing?.meta_unidades ?? 0));
    setMetaMonto(String(editing?.meta_monto ?? 0));
    setNotas(editing?.notas ?? '');
  }, [open, editing]);

  const vendedoresQ = useQuery({
    queryKey: ['metas-meta-vendedores', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles' as any)
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  const productosQ = useQuery({
    queryKey: ['metas-meta-productos', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('productos' as any)
        .select('id, nombre')
        .eq('empresa_id', empresa!.id)
        .eq('activo', true)
        .order('nombre')
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  const presentacionesQ = useQuery({
    queryKey: ['metas-meta-presentaciones', empresa?.id, productoId],
    enabled: !!empresa?.id && open && !!productoId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('producto_presentaciones' as any)
        .select('id, nombre')
        .eq('producto_id', productoId)
        .order('nombre');
      if (error) throw error;
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  const vendedorOptions = useMemo(
    () => [{ value: '', label: '— Todos los vendedores (empresa) —' }, ...((vendedoresQ.data ?? []).map((v) => ({ value: v.id, label: v.nombre })))],
    [vendedoresQ.data]
  );
  const productoOptions = useMemo(
    () => [{ value: '', label: '— Todos los productos —' }, ...((productosQ.data ?? []).map((p) => ({ value: p.id, label: p.nombre })))],
    [productosQ.data]
  );
  const presentacionOptions = useMemo(
    () => [{ value: '', label: '— Sin presentación específica —' }, ...((presentacionesQ.data ?? []).map((p) => ({ value: p.id, label: p.nombre })))],
    [presentacionesQ.data]
  );

  const submit = async () => {
    const input: MetaInput = {
      id: editing?.id,
      vendedor_id: vendedorId || null,
      producto_id: productoId || null,
      presentacion_id: productoId ? (presentacionId || null) : null,
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
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Vendedor</label>
            <SearchableSelect options={vendedorOptions} value={vendedorId} onChange={setVendedorId} placeholder="Vendedor..." />
          </div>

          <div>
            <label className="text-xs font-semibold text-muted-foreground">Producto</label>
            <SearchableSelect options={productoOptions} value={productoId} onChange={(v) => { setProductoId(v); setPresentacionId(''); }} placeholder="Producto..." />
          </div>

          {productoId && (
            <div>
              <label className="text-xs font-semibold text-muted-foreground">Presentación (opcional)</label>
              <SearchableSelect options={presentacionOptions} value={presentacionId} onChange={setPresentacionId} placeholder="Presentación..." />
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
          <Button onClick={submit} disabled={upsert.isPending}>{upsert.isPending ? 'Guardando...' : 'Guardar meta'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
