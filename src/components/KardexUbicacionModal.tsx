import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Download, Search } from 'lucide-react';
import { cn, fmtNum } from '@/lib/utils';
import { useKardexUbicacion } from '@/hooks/useKardexUbicacion';

const REFERENCIA_LABELS: Record<string, string> = {
  ajuste: 'Ajuste inventario',
  auditoria: 'Auditoría',
  compra: 'Compra',
  venta: 'Venta',
  venta_ruta: 'Venta ruta',
  traspaso: 'Traspaso',
  entrega: 'Surtido / Entrega',
  carga: 'Carga camión',
  devolucion: 'Devolución',
  descarga: 'Descarga ruta',
  cancelacion_venta: 'Cancel. venta',
  conteo: 'Conteo físico',
  manual: 'Manual',
};

const TIPO_CONFIG: Record<string, { label: string; icon: any; color: string }> = {
  entrada: { label: 'Entrada', icon: ArrowDownCircle, color: 'text-green-600' },
  salida: { label: 'Salida', icon: ArrowUpCircle, color: 'text-destructive' },
  transferencia: { label: 'Transferencia', icon: RefreshCw, color: 'text-primary' },
};

interface Props {
  open: boolean;
  onClose: () => void;
  productoId: string;
  productoNombre: string;
  ubicacionId: string;
  ubicacionNombre: string;
  ubicacionTipo: 'almacen' | 'camion';
  stockActual: number;
}

export default function KardexUbicacionModal({
  open, onClose, productoId, productoNombre, ubicacionId, ubicacionNombre, ubicacionTipo, stockActual,
}: Props) {
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [filterTipo, setFilterTipo] = useState('todos');
  const [search, setSearch] = useState('');

  const { rows, isLoading, refetch } = useKardexUbicacion(
    open ? productoId : null,
    open ? ubicacionId : null,
    ubicacionTipo,
    fechaDesde || undefined,
    fechaHasta || undefined,
  );

  const filtered = useMemo(() => {
    let list = [...rows].reverse();
    if (filterTipo.startsWith('ref:')) {
      const refKey = filterTipo.slice(4);
      list = list.filter(r => r.referencia_tipo === refKey);
    } else if (filterTipo !== 'todos') {
      list = list.filter(r => r.tipo === filterTipo);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.referencia_tipo ?? '').toLowerCase().includes(q) ||
        (r.notas ?? '').toLowerCase().includes(q) ||
        (REFERENCIA_LABELS[r.referencia_tipo ?? ''] ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterTipo, search]);

  const handleExportCSV = () => {
    const header = 'Fecha,Tipo,Referencia,Entrada,Salida,Saldo,Notas';
    const csvRows = filtered.map(r => {
      const fecha = new Date(r.created_at).toLocaleString('es-MX');
      const tipo = REFERENCIA_LABELS[r.referencia_tipo ?? ''] ?? r.referencia_tipo ?? '';
      const entrada = r.delta > 0 ? r.delta : '';
      const salida = r.delta < 0 ? Math.abs(r.delta) : '';
      const notas = (r.notas ?? '').replace(/,/g, ' ');
      return `${fecha},${tipo},${r.referencia_id ?? ''},${entrada},${salida},${r.saldo},${notas}`;
    });
    const blob = new Blob([header + '\n' + csvRows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kardex_${productoNombre.replace(/\s+/g, '_')}_${ubicacionNombre.replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle className="text-base">
              Kardex — {productoNombre} · {ubicacionNombre}
            </DialogTitle>
            <Badge variant="secondary" className="text-sm px-3 py-1 shrink-0">
              Stock: {fmtNum(stockActual)}
            </Badge>
          </div>
        </DialogHeader>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[150px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Buscar..." className="pl-8 h-8 text-[12px]" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Input type="date" className="h-8 text-[12px] w-[140px]" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} placeholder="Desde" />
          <Input type="date" className="h-8 text-[12px] w-[140px]" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} placeholder="Hasta" />
          <select
            className="h-8 text-[12px] border border-border rounded px-2 bg-background text-foreground"
            value={filterTipo}
            onChange={e => setFilterTipo(e.target.value)}
          >
            <option value="todos">Todos los tipos</option>
            <option value="entrada">Solo entradas</option>
            <option value="salida">Solo salidas</option>
            <optgroup label="Por concepto">
              {Object.entries(REFERENCIA_LABELS).map(([k, v]) => (
                <option key={k} value={`ref:${k}`}>{v}</option>
              ))}
            </optgroup>
          </select>
          <div className="flex gap-1">
            {[
              { key: 'todos', label: 'Todos' },
              { key: 'entrada', label: 'Entradas' },
              { key: 'salida', label: 'Salidas' },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterTipo(f.key)}
                className={cn(
                  "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
                  filterTipo === f.key
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary/40"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3 mr-1" /> Actualizar
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[11px]" onClick={handleExportCSV} disabled={filtered.length === 0}>
            <Download className="h-3 w-3 mr-1" /> CSV
          </Button>
        </div>

        {/* Summary */}
        {rows.length > 0 && (
          <div className="flex gap-4 text-[12px]">
            <span className="text-muted-foreground">{rows.length} movimientos</span>
            <span className="text-green-600 font-medium">
              + {rows.filter(r => r.delta > 0).reduce((s, r) => s + r.delta, 0).toLocaleString('es-MX')} entradas
            </span>
            <span className="text-destructive font-medium">
              − {Math.abs(rows.filter(r => r.delta < 0).reduce((s, r) => s + r.delta, 0)).toLocaleString('es-MX')} salidas
            </span>
          </div>
        )}

        {/* Table */}
        <div className="flex-1 overflow-auto border border-border rounded">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border">
                <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Fecha</th>
                <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Tipo</th>
                <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Referencia</th>
                <th className="text-right text-[11px] font-medium px-3 py-2 text-muted-foreground">Entrada</th>
                <th className="text-right text-[11px] font-medium px-3 py-2 text-muted-foreground">Salida</th>
                <th className="text-right text-[11px] font-medium px-3 py-2 text-muted-foreground font-semibold">Saldo</th>
                <th className="text-left text-[11px] font-medium px-3 py-2 text-muted-foreground">Notas</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="py-8 text-center text-[12px] text-muted-foreground">Cargando kardex...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-[12px] text-muted-foreground">
                  {rows.length === 0 ? 'Sin movimientos registrados' : 'Sin resultados con los filtros actuales'}
                </td></tr>
              ) : (
                filtered.map(row => {
                  const cfg = TIPO_CONFIG[row.tipo] ?? TIPO_CONFIG.entrada;
                  const Icon = cfg.icon;
                  return (
                    <tr key={row.id} className="border-b border-border/50 last:border-0 hover:bg-accent/30">
                      <td className="py-1.5 px-3 text-[12px] whitespace-nowrap">
                        {new Date(row.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}
                        <span className="text-muted-foreground ml-1 text-[10px]">
                          {new Date(row.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-1.5 px-3">
                        <span className={cn("flex items-center gap-1 text-[12px] font-medium", cfg.color)}>
                          <Icon className="h-3.5 w-3.5" />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 text-[12px]">
                        {REFERENCIA_LABELS[row.referencia_tipo ?? ''] ?? row.referencia_tipo ?? '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-[12px]">
                        {row.delta > 0 ? <span className="text-green-600 font-semibold">+{row.delta}</span> : ''}
                      </td>
                      <td className="py-1.5 px-3 text-right font-mono text-[12px]">
                        {row.delta < 0 ? <span className="text-destructive font-semibold">{row.delta}</span> : ''}
                      </td>
                      <td className={cn("py-1.5 px-3 text-right font-mono text-[12px] font-bold", row.saldo < 0 ? "text-destructive" : "")}>
                        {row.saldo}
                      </td>
                      <td className="py-1.5 px-3 text-[11px] text-muted-foreground max-w-[180px] truncate">
                        {row.notas ?? '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Stock comparison footer */}
        {rows.length > 0 && (() => {
          const saldoFinal = rows[rows.length - 1]?.saldo ?? 0;
          const coincide = saldoFinal === stockActual;
          return (
            <div className={cn(
              "flex items-center justify-between px-4 py-2.5 rounded-lg border text-[13px]",
              coincide
                ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/30"
                : "border-destructive/50 bg-destructive/5"
            )}>
              <div className="flex gap-6">
                <span>Stock real (almacén): <strong>{fmtNum(stockActual)}</strong></span>
                <span>Saldo kardex: <strong>{fmtNum(saldoFinal)}</strong></span>
              </div>
              {coincide ? (
                <span className="text-green-700 dark:text-green-400 font-medium">✅ Coinciden</span>
              ) : (
                <span className="text-destructive font-semibold">🔴 Descuadre: {fmtNum(saldoFinal - stockActual)}</span>
              )}
            </div>
          );
        })()}
      </DialogContent>
    </Dialog>
  );
}
