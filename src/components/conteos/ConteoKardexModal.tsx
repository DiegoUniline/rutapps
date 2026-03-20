import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import {
  ShoppingCart, Truck, ArrowDownLeft, ArrowUpRight,
  RefreshCw, PackagePlus, PackageMinus, ArrowRightLeft,
} from 'lucide-react';

interface Props {
  conteoId: string;
  lineaId: string;
  open: boolean;
  onClose: () => void;
}

interface Movement {
  id: string;
  tipo: string;
  cantidad: number;
  referencia_tipo: string | null;
  referencia_id: string | null;
  notas: string | null;
  created_at: string;
  user_id: string | null;
}

/* ── Agrupaciones ── */
const GROUPS = [
  { key: 'ventas', label: 'Ventas', icon: ShoppingCart, color: 'text-red-600', bg: 'bg-red-50', sign: -1 },
  { key: 'compras', label: 'Compras', icon: Truck, color: 'text-green-600', bg: 'bg-green-50', sign: +1 },
  { key: 'traspaso_entrada', label: 'Traspasos Entrada', icon: ArrowDownLeft, color: 'text-blue-600', bg: 'bg-blue-50', sign: +1 },
  { key: 'traspaso_salida', label: 'Traspasos Salida', icon: ArrowUpRight, color: 'text-orange-600', bg: 'bg-orange-50', sign: -1 },
  { key: 'ajuste_positivo', label: 'Ajustes Positivos', icon: PackagePlus, color: 'text-emerald-600', bg: 'bg-emerald-50', sign: +1 },
  { key: 'ajuste_negativo', label: 'Ajustes Negativos', icon: PackageMinus, color: 'text-rose-600', bg: 'bg-rose-50', sign: -1 },
] as const;

type GroupKey = typeof GROUPS[number]['key'];

function classifyMovement(m: Movement): GroupKey {
  const ref = m.referencia_tipo ?? '';
  if (ref === 'venta' || ref === 'devolucion') return 'ventas';
  if (ref === 'compra') return 'compras';
  if (ref === 'traspaso') {
    return m.tipo === 'entrada' ? 'traspaso_entrada' : 'traspaso_salida';
  }
  // ajuste, conteo_fisico, carga, importacion, etc.
  if (m.tipo === 'entrada') return 'ajuste_positivo';
  return 'ajuste_negativo';
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export default function ConteoKardexModal({ conteoId, lineaId, open, onClose }: Props) {
  const { data } = useQuery({
    queryKey: ['conteo-kardex', conteoId, lineaId],
    enabled: !!lineaId && open,
    queryFn: async () => {
      // Get line + conteo info
      const { data: linea } = await supabase.from('conteo_lineas')
        .select('*, productos(nombre, codigo), conteos_fisicos!inner(almacen_id, abierto_en)')
        .eq('id', lineaId)
        .single();

      if (!linea) throw new Error('Línea no encontrada');

      const almacenId = (linea.conteos_fisicos as any)?.almacen_id;
      const openedAt = (linea.conteos_fisicos as any)?.abierto_en;
      const closedAt = linea.linea_cerrada_en ?? new Date().toISOString();

      // Get movements in period
      const { data: movements } = await supabase
        .from('movimientos_inventario')
        .select('*')
        .eq('producto_id', linea.producto_id)
        .eq('almacen_origen_id', almacenId)
        .gte('created_at', openedAt)
        .lte('created_at', closedAt)
        .order('created_at');

      const mvs: Movement[] = (movements ?? []).map((m: any) => ({
        ...m,
        cantidad: Number(m.cantidad),
      }));

      // Group movements
      const grouped: Record<GroupKey, Movement[]> = {
        ventas: [], compras: [], traspaso_entrada: [], traspaso_salida: [],
        ajuste_positivo: [], ajuste_negativo: [],
      };
      mvs.forEach(m => grouped[classifyMovement(m)].push(m));

      // Calculate totals
      let totalEntradas = 0;
      let totalSalidas = 0;
      mvs.forEach(m => {
        if (m.tipo === 'entrada') totalEntradas += m.cantidad;
        else totalSalidas += m.cantidad;
      });

      const stockInicial = Number(linea.stock_inicial);
      const stockTeorico = stockInicial + totalEntradas - totalSalidas;
      const contado = linea.cantidad_contada != null ? Number(linea.cantidad_contada) : null;
      const diferencia = contado != null ? contado - stockTeorico : null;

      return {
        linea,
        producto: linea.productos,
        grouped,
        stockInicial,
        totalEntradas,
        totalSalidas,
        stockTeorico,
        contado,
        diferencia,
        openedAt,
        closedAt,
      };
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Kardex: {(data?.producto as any)?.nombre ?? '...'}
          </DialogTitle>
          {data?.producto && (
            <p className="text-xs text-muted-foreground font-mono">{(data.producto as any)?.codigo}</p>
          )}
        </DialogHeader>

        {data && (
          <div className="space-y-4">
            {/* Período */}
            <p className="text-xs text-muted-foreground text-center">
              {format(new Date(data.openedAt), "dd/MM/yyyy HH:mm", { locale: es })} → {format(new Date(data.closedAt), "dd/MM/yyyy HH:mm", { locale: es })}
            </p>

            {/* Groups */}
            {GROUPS.map(group => {
              const items = data.grouped[group.key];
              if (items.length === 0) return null;
              const Icon = group.icon;
              const subtotal = items.reduce((s, m) => s + m.cantidad, 0);
              return (
                <div key={group.key} className="space-y-1">
                  <div className={cn("flex items-center justify-between px-3 py-2 rounded-md", group.bg)}>
                    <div className="flex items-center gap-2">
                      <Icon className={cn("h-4 w-4", group.color)} />
                      <span className={cn("text-sm font-medium", group.color)}>{group.label}</span>
                      <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
                    </div>
                    <span className={cn("text-sm font-mono font-bold", group.color)}>
                      {group.sign > 0 ? '+' : '-'}{fmt(subtotal)}
                    </span>
                  </div>
                  <div className="border border-border rounded overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow className="text-[10px]">
                          <TableHead className="text-[10px] py-1">Fecha/Hora</TableHead>
                          <TableHead className="text-[10px] py-1">Referencia</TableHead>
                          <TableHead className="text-[10px] py-1 text-right">Cantidad</TableHead>
                          <TableHead className="text-[10px] py-1">Notas</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map(m => (
                          <TableRow key={m.id} className="text-[11px]">
                            <TableCell className="py-1 whitespace-nowrap font-mono">
                              {format(new Date(m.created_at), 'dd/MM HH:mm', { locale: es })}
                            </TableCell>
                            <TableCell className="py-1">
                              <Badge variant="outline" className="text-[9px]">
                                {m.referencia_tipo ?? 'otro'}
                              </Badge>
                            </TableCell>
                            <TableCell className={cn("py-1 text-right font-mono font-bold", group.color)}>
                              {group.sign > 0 ? '+' : '-'}{fmt(m.cantidad)}
                            </TableCell>
                            <TableCell className="py-1 text-muted-foreground max-w-[120px] truncate">
                              {m.notas ?? '—'}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              );
            })}

            {/* Sin movimientos */}
            {Object.values(data.grouped).every(g => g.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos en el período</p>
            )}

            <Separator />

            {/* Resumen final */}
            <Card className="p-4 space-y-2">
              <h4 className="text-sm font-semibold">Resumen</h4>
              <div className="grid grid-cols-1 gap-1 text-sm font-mono">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Stock inicial (al abrir)</span>
                  <span className="font-bold">{fmt(data.stockInicial)}</span>
                </div>
                <div className="flex justify-between text-green-600">
                  <span>+ Entradas</span>
                  <span className="font-bold">+{fmt(data.totalEntradas)}</span>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>− Salidas</span>
                  <span className="font-bold">-{fmt(data.totalSalidas)}</span>
                </div>
                <Separator className="my-1" />
                <div className="flex justify-between font-bold">
                  <span className="text-muted-foreground">= Stock teórico</span>
                  <span>{fmt(data.stockTeorico)}</span>
                </div>
                {data.contado != null && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Stock físico contado</span>
                      <span className="font-bold">{fmt(data.contado)}</span>
                    </div>
                    <Separator className="my-1" />
                    <div className={cn("flex justify-between font-bold text-base",
                      (data.diferencia ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      <span>Diferencia</span>
                      <span>{(data.diferencia ?? 0) >= 0 ? '+' : ''}{fmt(data.diferencia ?? 0)}</span>
                    </div>
                  </>
                )}
              </div>
            </Card>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
