import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ArrowDownCircle, ArrowUpCircle, RefreshCw, Search, Filter } from 'lucide-react';
import { cn } from '@/lib/utils';

const REFERENCIA_LABELS: Record<string, string> = {
  ajuste: 'Ajuste inventario',
  auditoria: 'Auditoría',
  compra: 'Compra',
  venta: 'Venta',
  traspaso: 'Traspaso',
  entrega: 'Entrega',
  carga: 'Carga camión',
  devolucion: 'Devolución',
  descarga: 'Descarga ruta',
  manual: 'Manual',
};

const TIPO_CONFIG = {
  entrada: { label: 'Entrada', icon: ArrowDownCircle, color: 'text-green-600' },
  salida: { label: 'Salida', icon: ArrowUpCircle, color: 'text-destructive' },
  transferencia: { label: 'Transferencia', icon: RefreshCw, color: 'text-primary' },
};

interface KardexTabProps {
  productoId?: string;
  isNew: boolean;
}

export default function KardexTab({ productoId, isNew }: KardexTabProps) {
  const { empresa } = useAuth();
  const [search, setSearch] = useState('');
  const [filterTipo, setFilterTipo] = useState<string>('todos');

  const { data: movimientos, isLoading } = useQuery({
    queryKey: ['kardex', productoId, empresa?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('movimientos_inventario')
        .select('id, fecha, tipo, cantidad, referencia_tipo, referencia_id, notas, created_at, almacen_origen_id, almacen_destino_id, almacenes:almacen_origen_id(nombre), almacen_dest:almacen_destino_id(nombre)')
        .eq('producto_id', productoId!)
        .eq('empresa_id', empresa!.id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!productoId && !!empresa?.id && !isNew,
  });

  // Calculate running balance
  const rows = useMemo(() => {
    if (!movimientos) return [];
    let saldo = 0;
    return movimientos.map((m: any) => {
      const delta = m.tipo === 'entrada' ? m.cantidad : m.tipo === 'salida' ? -m.cantidad : 0;
      saldo += delta;
      return { ...m, delta, saldo };
    });
  }, [movimientos]);

  // Reverse for display (newest first) then apply filters
  const filtered = useMemo(() => {
    let list = [...rows].reverse();
    if (filterTipo !== 'todos') list = list.filter(r => r.tipo === filterTipo);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(r =>
        (r.referencia_tipo ?? '').toLowerCase().includes(q) ||
        (r.notas ?? '').toLowerCase().includes(q) ||
        (REFERENCIA_LABELS[r.referencia_tipo] ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  }, [rows, filterTipo, search]);

  if (isNew) {
    return (
      <div className="text-[12px] text-muted-foreground py-4 bg-accent/30 border border-accent/50 rounded px-3">
        💡 Guarda el producto primero para ver el kardex.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Buscar en movimientos..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-odoo pl-8 py-1.5 text-[12px] w-full"
          />
        </div>
        <div className="flex gap-1">
          {[
            { key: 'todos', label: 'Todos' },
            { key: 'entrada', label: 'Entradas' },
            { key: 'salida', label: 'Salidas' },
            { key: 'transferencia', label: 'Transf.' },
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
      </div>

      {/* Summary */}
      {rows.length > 0 && (
        <div className="flex gap-4 text-[12px]">
          <span className="text-muted-foreground">
            {rows.length} movimientos
          </span>
          <span className="text-green-600 font-medium">
            + {rows.filter(r => r.tipo === 'entrada').reduce((s, r) => s + r.cantidad, 0).toLocaleString('es-MX')} entradas
          </span>
          <span className="text-destructive font-medium">
            − {rows.filter(r => r.tipo === 'salida').reduce((s, r) => s + r.cantidad, 0).toLocaleString('es-MX')} salidas
          </span>
          <span className="font-semibold text-foreground">
            Saldo: {rows[rows.length - 1]?.saldo?.toLocaleString('es-MX') ?? 0}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-border rounded">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-table-border">
              <th className="th-odoo text-left">Fecha</th>
              <th className="th-odoo text-left">Tipo</th>
              <th className="th-odoo text-left">Origen</th>
              <th className="th-odoo text-left">Referencia</th>
              <th className="th-odoo text-right">Entrada</th>
              <th className="th-odoo text-right">Salida</th>
              <th className="th-odoo text-right font-semibold">Saldo</th>
              <th className="th-odoo text-left">Notas</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={8} className="py-6 text-center text-[12px] text-muted-foreground">Cargando kardex...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={8} className="py-6 text-center text-[12px] text-muted-foreground">
                {rows.length === 0 ? 'Sin movimientos registrados para este producto' : 'Sin resultados con los filtros actuales'}
              </td></tr>
            ) : (
              filtered.map((row: any) => {
                const cfg = TIPO_CONFIG[row.tipo as keyof typeof TIPO_CONFIG] ?? TIPO_CONFIG.entrada;
                const Icon = cfg.icon;
                const almOrigen = (row.almacenes as any)?.nombre;
                const almDest = (row.almacen_dest as any)?.nombre;
                const ubicacion = row.tipo === 'transferencia'
                  ? `${almOrigen ?? '?'} → ${almDest ?? '?'}`
                  : almOrigen || almDest || '—';

                return (
                  <tr key={row.id} className="border-b border-table-border last:border-0 hover:bg-table-hover">
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
                    <td className="py-1.5 px-3 text-[12px] text-muted-foreground">{ubicacion}</td>
                    <td className="py-1.5 px-3 text-[12px]">
                      <span className="font-medium">{REFERENCIA_LABELS[row.referencia_tipo] ?? row.referencia_tipo ?? '—'}</span>
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[12px]">
                      {row.tipo === 'entrada' ? (
                        <span className="text-green-600 font-semibold">+{row.cantidad}</span>
                      ) : ''}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[12px]">
                      {row.tipo === 'salida' ? (
                        <span className="text-destructive font-semibold">−{row.cantidad}</span>
                      ) : ''}
                    </td>
                    <td className="py-1.5 px-3 text-right font-mono text-[12px] font-bold">
                      {row.saldo}
                    </td>
                    <td className="py-1.5 px-3 text-[11px] text-muted-foreground max-w-[200px] truncate">
                      {row.notas ?? '—'}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
