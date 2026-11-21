import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Package } from 'lucide-react';
import { SortableTableHead, useSortState, ordenarFilas } from '@/hooks/useSortableTable';

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

  // Orden por columna dentro de cada grupo de movimientos.
  const { sort, toggle: toggleSort } = useSortState('auditoria-movimientos');
  const valorMov = (m: any, key: string) => {
    if (key === 'tipo') return (TIPO_CONFIG[m.tipo] ?? TIPO_CONFIG.entrada).label;
    if (key === 'almacen') return m.tipo === 'entrada'
      ? m.almacen_dest?.nombre ?? m.almacenes?.nombre
      : m.almacenes?.nombre ?? m.almacen_dest?.nombre;
    if (key === 'referencia') return m.referencia_id ? `${REF_LABELS[m.referencia_tipo] ?? m.referencia_tipo} #${m.referencia_id.slice(0, 8)}` : null;
    return m[key];
  };

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
      <DialogContent className="max-w-4xl max-h-[90dvh] overflow-y-auto">
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
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          <div className="rounded-lg border p-2 sm:p-3 text-center min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Stock Inicial</p>
            <p className="text-base sm:text-xl font-bold font-mono truncate">{cantidadEsperada}</p>
          </div>
          <div className="rounded-lg border p-2 sm:p-3 text-center min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Entradas</p>
            <p className="text-base sm:text-xl font-bold font-mono text-emerald-600 truncate">+{totalEntradas}</p>
          </div>
          <div className="rounded-lg border p-2 sm:p-3 text-center min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Salidas</p>
            <p className="text-base sm:text-xl font-bold font-mono text-red-600 truncate">-{totalSalidas}</p>
          </div>
          <div className="rounded-lg border p-2 sm:p-3 text-center min-w-0">
            <p className="text-[10px] sm:text-xs text-muted-foreground truncate">Stock Teórico</p>
            <p className="text-base sm:text-xl font-bold font-mono truncate">{stockTeorico}</p>
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
                    <SortableTableHead sortKey="created_at" sort={sort} onToggle={toggleSort} className="w-[160px]">Fecha / Hora</SortableTableHead>
                    <SortableTableHead sortKey="tipo" sort={sort} onToggle={toggleSort}>Tipo</SortableTableHead>
                    <SortableTableHead sortKey="almacen" sort={sort} onToggle={toggleSort}>Almacén</SortableTableHead>
                    <SortableTableHead sortKey="referencia" sort={sort} onToggle={toggleSort}>Referencia</SortableTableHead>
                    <SortableTableHead sortKey="cantidad" sort={sort} onToggle={toggleSort} align="right" className="text-right w-[100px]">Cantidad</SortableTableHead>
                    <SortableTableHead sortKey="notas" sort={sort} onToggle={toggleSort}>Notas</SortableTableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ordenarFilas(items as any[], sort, valorMov).map((m: any) => {
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
