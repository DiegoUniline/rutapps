import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Package } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const FILTROS = [
  { value: 'todos', label: 'Todos los productos' },
  { value: 'positivo', label: 'Stock > 0' },
  { value: 'negativo', label: 'Stock < 0' },
  { value: 'no_cero', label: 'Stock ≠ 0' },
];

export default function CrearConteoDialog({ open, onClose, onCreated }: Props) {
  const { empresa, user } = useAuth();
  const [almacenId, setAlmacenId] = useState('');
  const [filtroStock, setFiltroStock] = useState('todos');
  const [clasificacionId, setClasificacionId] = useState('');
  const [notas, setNotas] = useState('');
  const [saving, setSaving] = useState(false);

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-activos', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('almacenes').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  const { data: clasificaciones } = useQuery({
    queryKey: ['clasificaciones', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return data ?? [];
    },
  });

  // Auto-select if only one almacen
  useEffect(() => {
    if (almacenes?.length === 1 && !almacenId) setAlmacenId(almacenes[0].id);
  }, [almacenes, almacenId]);

  // Preview count
  const { data: previewCount } = useQuery({
    queryKey: ['conteo-preview', almacenId, filtroStock, clasificacionId],
    enabled: !!almacenId && !!empresa?.id,
    queryFn: async () => {
      // Get products with stock in this warehouse
      let q = supabase
        .from('stock_almacen')
        .select('producto_id, cantidad, productos!inner(id, status, clasificacion_id)')
        .eq('almacen_id', almacenId)
        .eq('empresa_id', empresa!.id)
        .eq('productos.status', 'activo' as any);

      if (clasificacionId) {
        q = q.eq('productos.clasificacion_id', clasificacionId as any);
      }

      const { data } = await q;
      let items = data ?? [];

      if (filtroStock === 'positivo') items = items.filter((i: any) => i.cantidad > 0);
      else if (filtroStock === 'negativo') items = items.filter((i: any) => i.cantidad < 0);
      else if (filtroStock === 'no_cero') items = items.filter((i: any) => i.cantidad !== 0);

      return items.length;
    },
  });

  const handleCreate = async () => {
    if (!almacenId) { toast.error('Selecciona un almacén'); return; }
    setSaving(true);
    try {
      // Generate folio
      const now = new Date();
      const prefix = `CF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const { count } = await supabase
        .from('conteos_fisicos')
        .select('id', { count: 'exact', head: true })
        .eq('empresa_id', empresa!.id)
        .like('folio', `${prefix}%`);
      const folio = `${prefix}-${String((count ?? 0) + 1).padStart(4, '0')}`;

      // Get products
      let q = supabase
        .from('stock_almacen')
        .select('producto_id, cantidad, productos!inner(id, status, clasificacion_id, costo)')
        .eq('almacen_id', almacenId)
        .eq('empresa_id', empresa!.id)
        .eq('productos.status', 'activo' as any);

      if (clasificacionId) q = q.eq('productos.clasificacion_id', clasificacionId as any);

      const { data: stockData } = await q;
      let items = stockData ?? [];

      if (filtroStock === 'positivo') items = items.filter((i: any) => i.cantidad > 0);
      else if (filtroStock === 'negativo') items = items.filter((i: any) => i.cantidad < 0);
      else if (filtroStock === 'no_cero') items = items.filter((i: any) => i.cantidad !== 0);

      if (items.length === 0) { toast.error('No hay productos con los filtros seleccionados'); setSaving(false); return; }

      // Insert conteo
      const { data: conteo, error: err1 } = await supabase.from('conteos_fisicos').insert({
        folio,
        empresa_id: empresa!.id,
        almacen_id: almacenId,
        creado_por: user!.id,
        clasificacion_id: clasificacionId || null,
        filtro_stock: filtroStock,
        status: 'abierto',
        total_productos: items.length,
        notas: notas || null,
      } as any).select('id').single();
      if (err1) throw err1;

      // Insert lines
      const lineas = items.map((i: any) => ({
        conteo_id: conteo!.id,
        producto_id: i.producto_id,
        stock_inicial: i.cantidad,
        costo_unitario: (i.productos as any)?.costo ?? 0,
      }));

      const { error: err2 } = await supabase.from('conteo_lineas').insert(lineas as any);
      if (err2) throw err2;

      toast.success(`Conteo ${folio} creado con ${items.length} productos`);
      onCreated();
    } catch (err: any) {
      toast.error(err.message ?? 'Error al crear conteo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nuevo Conteo Físico</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Almacén *</Label>
            <Select value={almacenId} onValueChange={setAlmacenId}>
              <SelectTrigger><SelectValue placeholder="Seleccionar almacén" /></SelectTrigger>
              <SelectContent>
                {(almacenes ?? []).map(a => (
                  <SelectItem key={a.id} value={a.id}>{a.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Filtro de Stock</Label>
            <Select value={filtroStock} onValueChange={setFiltroStock}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FILTROS.map(f => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Categoría (opcional)</Label>
            <Select value={clasificacionId} onValueChange={setClasificacionId}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">Todas</SelectItem>
                {(clasificaciones ?? []).map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={e => setNotas(e.target.value)} placeholder="Notas opcionales..." rows={2} />
          </div>

          {almacenId && previewCount !== undefined && (
            <div className="flex items-center gap-2 p-3 bg-card rounded-lg">
              <Package className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">{previewCount} productos</span>
              <span className="text-xs text-muted-foreground">entrarán al conteo</span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={saving || !almacenId}>
            {saving ? 'Creando...' : 'Crear Conteo'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
