import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Loader2, Sparkles } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Nombre pre-rellenado desde el buscador */
  initialName?: string;
  /** Costo pre-rellenado desde la línea de compra (si aplica) */
  initialCosto?: number;
  /** Callback al crear: recibe el producto creado para asignarlo a la línea */
  onCreated: (producto: { id: string; codigo: string; nombre: string; costo: number; iva_pct: number; tiene_iva: boolean; tiene_ieps: boolean; ieps_pct: number }) => void;
}

const MARGIN_DEFAULT = 30;

export default function QuickProductDialog({ open, onOpenChange, initialName = '', initialCosto = 0, onCreated }: Props) {
  const { empresa } = useAuth();
  const qc = useQueryClient();

  const [codigo, setCodigo] = useState('');
  const [nombre, setNombre] = useState('');
  const [unidadId, setUnidadId] = useState('');
  const [categoriaId, setCategoriaId] = useState('');
  const [costo, setCosto] = useState(0);
  const [margen, setMargen] = useState(MARGIN_DEFAULT);
  const [precio, setPrecio] = useState(0);
  const [precioManual, setPrecioManual] = useState(false);
  const [tieneIva, setTieneIva] = useState(true);
  const [ivaPct, setIvaPct] = useState(16);
  const [tieneIeps, setTieneIeps] = useState(false);
  const [iepsPct, setIepsPct] = useState(0);
  const [venderSinStock, setVenderSinStock] = useState(false);
  const [claveSat, setClaveSat] = useState('01010101');
  const [claveUnidadSat, setClaveUnidadSat] = useState('H87');

  // Cargar catálogos
  const { data: unidades = [] } = useQuery({
    queryKey: ['unidades-quick', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from('unidades').select('id, nombre, abreviatura').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return (data ?? []) as { id: string; nombre: string; abreviatura: string }[];
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ['clasificaciones-quick', empresa?.id],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase.from('clasificaciones').select('id, nombre').eq('empresa_id', empresa!.id).eq('activo', true).order('nombre');
      return (data ?? []) as { id: string; nombre: string }[];
    },
  });

  // Auto-código sugerido
  const { data: sugCodigo } = useQuery({
    queryKey: ['next-prod-code', empresa?.id, open],
    enabled: !!empresa?.id && open,
    queryFn: async () => {
      const { data } = await supabase.rpc('next_folio', { prefix: 'PROD', p_empresa_id: empresa!.id });
      return (data as string) ?? '';
    },
  });

  // Reset al abrir
  useEffect(() => {
    if (open) {
      setNombre(initialName);
      setCosto(initialCosto || 0);
      setMargen(MARGIN_DEFAULT);
      setPrecioManual(false);
      setTieneIva(true);
      setIvaPct(16);
      setTieneIeps(false);
      setIepsPct(0);
      setVenderSinStock(false);
      setClaveSat('01010101');
      setClaveUnidadSat('H87');
      setCategoriaId('');
    }
  }, [open, initialName, initialCosto]);

  useEffect(() => {
    if (sugCodigo && !codigo) setCodigo(sugCodigo);
  }, [sugCodigo, codigo]);

  // Default unidad: primera disponible (típicamente "Pieza")
  useEffect(() => {
    if (unidades.length > 0 && !unidadId) {
      const pieza = unidades.find(u => u.abreviatura?.toLowerCase() === 'pza' || u.nombre?.toLowerCase().includes('pieza'));
      setUnidadId(pieza?.id ?? unidades[0].id);
    }
  }, [unidades, unidadId]);

  // Auto-cálculo de precio según margen
  useEffect(() => {
    if (!precioManual) {
      const calc = Math.round(costo * (1 + margen / 100) * 100) / 100;
      setPrecio(calc);
    }
  }, [costo, margen, precioManual]);

  const unidadAbrev = useMemo(() => unidades.find(u => u.id === unidadId)?.abreviatura ?? 'pza', [unidades, unidadId]);

  const createMut = useMutation({
    mutationFn: async () => {
      if (!empresa?.id) throw new Error('Sin empresa');
      if (!nombre.trim()) throw new Error('El nombre es obligatorio');
      if (!unidadId) throw new Error('Selecciona una unidad de medida');
      if (costo < 0 || precio < 0) throw new Error('Los montos no pueden ser negativos');

      const finalCodigo = codigo.trim() || sugCodigo || `PROD-${Date.now()}`;

      // 1. Crear producto
      const { data: prod, error: prodErr } = await supabase
        .from('productos')
        .insert({
          empresa_id: empresa.id,
          codigo: finalCodigo,
          nombre: nombre.trim(),
          unidad_id: unidadId,
          clasificacion_id: categoriaId || null,
          costo,
          precio_principal: precio,
          tiene_iva: tieneIva,
          iva_pct: tieneIva ? ivaPct : 0,
          tiene_ieps: tieneIeps,
          ieps_pct: tieneIeps ? iepsPct : 0,
          ieps_tipo: 'porcentaje',
          vender_sin_stock: venderSinStock,
          se_puede_comprar: true,
          se_puede_vender: true,
          codigo_sat: claveSat || null,
          calculo_costo: 'promedio',
          activo: true,
        } as any)
        .select('id, codigo, nombre, costo, iva_pct, tiene_iva, tiene_ieps, ieps_pct')
        .single();

      if (prodErr) throw prodErr;

      // 2. Asignar a la Lista de Precios principal
      try {
        const { data: listaPrincipal } = await supabase
          .from('lista_precios')
          .select('id')
          .eq('empresa_id', empresa.id)
          .eq('es_principal', true)
          .maybeSingle();

        if (listaPrincipal?.id) {
          await supabase.from('producto_precios').insert({
            producto_id: (prod as any).id,
            lista_precio_id: listaPrincipal.id,
            precio,
          } as any);
        }
      } catch { /* no bloqueante */ }

      return prod as any;
    },
    onSuccess: (prod) => {
      qc.invalidateQueries({ queryKey: ['productos'] });
      qc.invalidateQueries({ queryKey: ['productos-list'] });
      toast.success(`Producto "${prod.nombre}" creado ✅`, {
        description: 'Puedes completar más detalles después en Productos.',
      });
      onCreated(prod);
      onOpenChange(false);
    },
    onError: (err: any) => {
      toast.error(err?.message || 'No se pudo crear el producto');
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Crear producto rápido
          </DialogTitle>
          <DialogDescription className="text-xs">
            Solo lo esencial para que funcione en compras, ventas e inventario. El resto lo puedes completar después.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Código + Nombre */}
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Código *</Label>
              <Input value={codigo} onChange={e => setCodigo(e.target.value)} placeholder="PROD-0001" className="h-9 text-sm" />
            </div>
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Nombre *</Label>
              <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del producto" className="h-9 text-sm" autoFocus />
            </div>
          </div>

          {/* Unidad + Categoría */}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Unidad *</Label>
              <Select value={unidadId} onValueChange={setUnidadId}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Selecciona..." /></SelectTrigger>
                <SelectContent>
                  {unidades.map(u => <SelectItem key={u.id} value={u.id}>{u.nombre} ({u.abreviatura})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Categoría</Label>
              <Select value={categoriaId || 'none'} onValueChange={v => setCategoriaId(v === 'none' ? '' : v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin categoría</SelectItem>
                  {categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Costo / Margen / Precio */}
          <div className="bg-muted/30 rounded-md p-3 space-y-2">
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Costo *</Label>
                <Input type="number" step="0.01" value={costo} onChange={e => setCosto(Number(e.target.value) || 0)} className="h-9 text-sm text-right" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Margen %</Label>
                <Input type="number" value={margen} onChange={e => { setMargen(Number(e.target.value) || 0); setPrecioManual(false); }} disabled={precioManual} className="h-9 text-sm text-right" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Precio venta *</Label>
                <Input type="number" step="0.01" value={precio} onChange={e => { setPrecio(Number(e.target.value) || 0); setPrecioManual(true); }} className="h-9 text-sm text-right font-medium" />
              </div>
            </div>
            {precioManual && (
              <button type="button" onClick={() => setPrecioManual(false)} className="text-[11px] text-primary hover:underline">
                ↺ Volver a calcular automático ({margen}% sobre costo)
              </button>
            )}
          </div>

          {/* Impuestos */}
          <div className="grid grid-cols-2 gap-2">
            <div className="border border-border rounded-md p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs cursor-pointer">IVA</Label>
                <Switch checked={tieneIva} onCheckedChange={setTieneIva} />
              </div>
              {tieneIva && (
                <Input type="number" value={ivaPct} onChange={e => setIvaPct(Number(e.target.value) || 0)} className="h-8 text-xs text-right" />
              )}
            </div>
            <div className="border border-border rounded-md p-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs cursor-pointer">IEPS</Label>
                <Switch checked={tieneIeps} onCheckedChange={setTieneIeps} />
              </div>
              {tieneIeps && (
                <Input type="number" value={iepsPct} onChange={e => setIepsPct(Number(e.target.value) || 0)} className="h-8 text-xs text-right" />
              )}
            </div>
          </div>

          {/* SAT (colapsable visual) */}
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground hover:text-foreground select-none">Claves SAT (para CFDI) — opcional</summary>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="space-y-1">
                <Label className="text-xs">Clave producto SAT</Label>
                <Input value={claveSat} onChange={e => setClaveSat(e.target.value)} className="h-8 text-xs" />
                <span className="text-[10px] text-muted-foreground">01010101 = Genérico</span>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Clave unidad SAT</Label>
                <Input value={claveUnidadSat} onChange={e => setClaveUnidadSat(e.target.value)} className="h-8 text-xs" />
                <span className="text-[10px] text-muted-foreground">H87 = {unidadAbrev}</span>
              </div>
            </div>
          </details>

          <div className="flex items-center justify-between border-t border-border pt-3">
            <div className="flex items-center gap-2">
              <Switch checked={venderSinStock} onCheckedChange={setVenderSinStock} id="vss-quick" />
              <Label htmlFor="vss-quick" className="text-xs cursor-pointer">Permitir vender sin stock</Label>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} className="flex-1" disabled={createMut.isPending}>
              Cancelar
            </Button>
            <Button onClick={() => createMut.mutate()} className="flex-1" disabled={createMut.isPending || !nombre.trim() || !unidadId}>
              {createMut.isPending ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Creando...</> : 'Crear y agregar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
