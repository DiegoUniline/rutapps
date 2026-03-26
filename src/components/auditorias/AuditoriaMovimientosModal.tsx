import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Package } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  productoId: string;
  productoNombre: string;
  productoCodigo: string;
  cantidadEsperada: number;
  apertura: string; // ISO timestamp
  cierre?: string | null; // ISO timestamp or null = now
}

const TIPO_CONFIG: Record<string, { label: string; icon: typeof ArrowDownCircle; color: string; sign: '+' | '-' | '↔' }> = {
  entrada: { label: 'Entrada', icon: ArrowDownCircle, color: 'text-emerald-600', sign: '+' },
  salida: { label: 'Salida', icon: ArrowUpCircle, color: 'text-red-600', sign: '-' },
  transferencia: { label: 'Transferencia', icon: ArrowLeftRight, color: 'text-blue-600', sign: '↔' },
};

const REF_LABELS: Record<string, string> = {
  venta: 'Venta',
  compra: 'Compra',
  traspaso: 'Traspaso',
  ajuste: 'Ajuste',
  carga: 'Carga',
  devolucion: 'Devolución',
  importacion: 'Importación',
  conteo: 'Conteo Físico',
};

export default function AuditoriaMovimientosModal({
  open, onOpenChange, productoId, productoNombre, productoCodigo,
  cantidadEsperada, apertura, cierre,
}: Props) {

  const fmtDt = (d: string) => {
    try { return format(new Date(d), "dd/MM/yyyy HH:mm:ss", { locale: es }); } catch { return d; }
  };

  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['audit-movimientos', productoId, apertura, cierre],
    enabled: open && !!productoId,
    queryFn: async () => {
      let query = supabase
        .from('movimientos_inventario')
        .select('id, fecha, tipo, cantidad, referencia_tipo, referencia_id, notas, created_at, almacen_origen_id, almacen_destino_id, almacenes:almacen_origen_id(nombre), almacen_dest:almacen_destino_id(nombre)')
        .eq('producto_id', productoId)
        .gt('created_at', apertura)
        .order('created_at', { ascending: true });

      if (cierre) {
        query = query.lte('created_at', cierre);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  // Group by referencia_tipo
  const grupos = (movimientos ?? []).reduce<Record<string, any[]>>((acc, m) => {
    const key = m.referencia_tipo || 'otro';
    if (!acc[key]) acc[key] = [];
    acc[key].push(m);
    return acc;
  }, {});

  const totalEntradas = (movimientos ?? [])
    .filter((m: any) => m.tipo === 'entrada')
    .reduce((s: number, m: any) => s + Number(m.cantidad), 0);

  const totalSalidas = (movimientos ?? [])
    .filter((m: any) => m.tipo === 'salida')
    .reduce((s: number, m: any) => s + Number(m.cantidad), 0);

  const stockTeorico = cantidadEsperada + totalEntradas - totalSalidas;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Movimientos: {productoNombre}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{productoCodigo}</p>
        </DialogHeader>

        {/* Period info */}
        <div className="flex flex-wrap gap-4 text-sm bg-card rounded-lg p-3">
          <div>
            <span className="text-muted-foreground">Apertura:</span>{' '}
            <span className="font-medium">{fmtDt(apertura)}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Cierre:</span>{' '}
            <span className="font-medium">{cierre ? fmtDt(cierre) : 'Abierto (hasta ahora)'}</span>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-3">
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Stock Inicial</p>
            <p className="text-xl font-bold font-mono">{cantidadEsperada}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Entradas</p>
            <p className="text-xl font-bold font-mono text-emerald-600">+{totalEntradas}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Salidas</p>
            <p className="text-xl font-bold font-mono text-red-600">-{totalSalidas}</p>
          </div>
          <div className="rounded-lg border p-3 text-center">
            <p className="text-xs text-muted-foreground">Stock Teórico</p>
            <p className="text-xl font-bold font-mono">{stockTeorico}</p>
          </div>
        </div>

        <Separator />

        {/* Movements grouped by type */}
        {isLoading && <p className="text-center text-muted-foreground py-6">Cargando movimientos...</p>}

        {!isLoading && (movimientos ?? []).length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No hay movimientos en este período
          </p>
        )}

        {!isLoading && Object.entries(grupos).map(([tipo, items]) => (
          <div key={tipo} className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              {REF_LABELS[tipo] ?? tipo}
              <Badge variant="secondary" className="text-[10px]">{items.length}</Badge>
            </h3>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[160px]">Fecha / Hora</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Almacén</TableHead>
                    <TableHead>Referencia</TableHead>
                    <TableHead className="text-right w-[100px]">Cantidad</TableHead>
                    <TableHead>Notas</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((m: any) => {
                    const cfg = TIPO_CONFIG[m.tipo] ?? TIPO_CONFIG.entrada;
                    const Icon = cfg.icon;
                    const almNombre = m.tipo === 'entrada'
                      ? (m.almacen_dest as any)?.nombre ?? (m.almacenes as any)?.nombre ?? '—'
                      : (m.almacenes as any)?.nombre ?? (m.almacen_dest as any)?.nombre ?? '—';
                    return (
                      <TableRow key={m.id}>
                        <TableCell className="text-xs whitespace-nowrap">{fmtDt(m.created_at)}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                            <span className="text-xs">{cfg.label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{almNombre}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {m.referencia_id ? `${REF_LABELS[m.referencia_tipo] ?? m.referencia_tipo} #${m.referencia_id.slice(0, 8)}` : '—'}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-medium ${cfg.color}`}>
                          {cfg.sign === '-' ? '-' : cfg.sign === '+' ? '+' : ''}{m.cantidad}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">
                          {m.notas ?? '—'}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        ))}
      </DialogContent>
    </Dialog>
  );
}
