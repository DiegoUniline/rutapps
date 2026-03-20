import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { ArrowDownLeft, ArrowUpRight, RefreshCw, Truck, ShoppingCart, X } from 'lucide-react';

interface Props {
  conteoId: string;
  lineaId: string;
  open: boolean;
  onClose: () => void;
}

const TIPO_ICON: Record<string, React.ElementType> = {
  entrada: ArrowDownLeft,
  salida: ArrowUpRight,
};

const REF_LABELS: Record<string, string> = {
  venta: 'Venta',
  compra: 'Compra',
  ajuste: 'Ajuste',
  traspaso: 'Traspaso',
  conteo_fisico: 'Conteo Físico',
  carga: 'Carga',
  devolucion: 'Devolución',
  importacion: 'Importación',
};

export default function ConteoKardexModal({ conteoId, lineaId, open, onClose }: Props) {
  const { data } = useQuery({
    queryKey: ['conteo-kardex', conteoId, lineaId],
    enabled: !!lineaId,
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

      // Get movements
      const { data: movements } = await supabase
        .from('movimientos_inventario')
        .select('*')
        .eq('producto_id', linea.producto_id)
        .eq('almacen_origen_id', almacenId)
        .gte('created_at', openedAt)
        .lte('created_at', closedAt)
        .order('created_at');

      const totalChange = (movements ?? []).reduce((s: number, m: any) => {
        return s + (m.tipo === 'entrada' ? Number(m.cantidad) : -Number(m.cantidad));
      }, 0);

      return {
        linea,
        producto: linea.productos,
        movements: movements ?? [],
        stockInicial: linea.stock_inicial,
        totalChange,
        stockEsperado: linea.stock_esperado ?? linea.stock_inicial + totalChange,
        openedAt,
        closedAt,
      };
    },
  });

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Kardex: {(data?.producto as any)?.nombre ?? '...'}</DialogTitle>
        </DialogHeader>

        {data && (
          <div className="space-y-4">
            {/* Summary values */}
            <div className="grid grid-cols-3 gap-3">
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Stock Inicial</p>
                <p className="text-xl font-bold">{data.stockInicial}</p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Movimientos</p>
                <p className={cn("text-xl font-bold", data.totalChange >= 0 ? "text-green-600" : "text-red-600")}>
                  {data.totalChange >= 0 ? '+' : ''}{data.totalChange}
                </p>
              </Card>
              <Card className="p-3 text-center">
                <p className="text-xs text-muted-foreground">Esperado</p>
                <p className="text-xl font-bold">{data.stockEsperado}</p>
              </Card>
            </div>

            {/* Period */}
            <p className="text-xs text-muted-foreground text-center">
              {format(new Date(data.openedAt), 'dd/MM/yyyy HH:mm', { locale: es })} → {format(new Date(data.closedAt), 'dd/MM/yyyy HH:mm', { locale: es })}
            </p>

            {/* Movements list */}
            {data.movements.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Sin movimientos en el período</p>
            ) : (
              <div className="space-y-2">
                {data.movements.map((m: any) => {
                  const Icon = TIPO_ICON[m.tipo] ?? RefreshCw;
                  const isEntry = m.tipo === 'entrada';
                  const qty = Number(m.cantidad);
                  return (
                    <div key={m.id} className="flex items-center gap-3 p-2 border border-border rounded">
                      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", isEntry ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600")}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <Badge variant="outline" className="text-[10px]">
                            {REF_LABELS[m.referencia_tipo] ?? m.referencia_tipo ?? 'Otro'}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {format(new Date(m.created_at), 'dd/MM HH:mm', { locale: es })}
                          {m.notas && ` — ${m.notas}`}
                        </p>
                      </div>
                      <span className={cn("text-sm font-mono font-bold shrink-0", isEntry ? "text-green-600" : "text-red-600")}>
                        {isEntry ? '+' : '-'}{qty}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Final result if closed */}
            {data.linea.status === 'cerrado' && (
              <Card className="p-3 border-primary">
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Contado</p>
                    <p className="font-bold">{data.linea.cantidad_contada}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Esperado</p>
                    <p className="font-bold">{data.linea.stock_esperado}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Diferencia</p>
                    <p className={cn("font-bold", (data.linea.diferencia ?? 0) >= 0 ? "text-green-600" : "text-red-600")}>
                      {(data.linea.diferencia ?? 0) >= 0 ? '+' : ''}{data.linea.diferencia}
                    </p>
                  </div>
                </div>
              </Card>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
