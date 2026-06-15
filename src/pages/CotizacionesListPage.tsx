import { useState, useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useCotizaciones, useDeleteCotizacion, type Cotizacion, type CotizacionEstado } from '@/hooks/useCotizaciones';
import { formatCurrency } from '@/lib/currency';
import { Plus, Trash2, FileText, Send, ShoppingCart, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ESTADO_STYLES: Record<CotizacionEstado, string> = {
  borrador: 'bg-muted text-foreground',
  enviada: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  aprobada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200',
  convertida: 'bg-primary/15 text-primary',
  vencida: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  cancelada: 'bg-zinc-200 text-zinc-700 line-through',
};

function fmtDate(d?: string | null) {
  if (!d) return '—';
  try {
    const dt = new Date(d.length === 10 ? d + 'T12:00:00' : d);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(dt.getDate())}/${pad(dt.getMonth() + 1)}/${dt.getFullYear()}`;
  } catch { return d; }
}

export default function CotizacionesListPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useCotizaciones();
  const del = useDeleteCotizacion();
  const [search, setSearch] = useState('');
  const [estadoFilter, setEstadoFilter] = useState<CotizacionEstado | 'todas'>('todas');
  const [toDelete, setToDelete] = useState<Cotizacion | null>(null);

  const list = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter(c => {
      if (estadoFilter !== 'todas' && c.estado !== estadoFilter) return false;
      if (!q) return true;
      return (
        (c.folio || '').toLowerCase().includes(q) ||
        (c.clientes?.nombre || '').toLowerCase().includes(q)
      );
    });
  }, [data, search, estadoFilter]);

  return (
    <div className="p-4 space-y-3 min-h-full">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">Cotizaciones</h1>
        <Button onClick={() => navigate('/cotizaciones/nuevo')} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nueva cotización
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio o cliente"
            className="pl-8"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(['todas', 'borrador', 'enviada', 'aprobada', 'convertida', 'vencida', 'cancelada'] as const).map(e => (
            <button
              key={e}
              onClick={() => setEstadoFilter(e)}
              className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                estadoFilter === e ? 'bg-primary text-primary-foreground border-primary' : 'bg-card hover:bg-muted'
              }`}
            >
              {e === 'todas' ? 'Todas' : e.charAt(0).toUpperCase() + e.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2">Folio</th>
                <th className="text-left px-3 py-2">Fecha</th>
                <th className="text-left px-3 py-2">Cliente</th>
                <th className="text-right px-3 py-2">Total</th>
                <th className="text-left px-3 py-2">Vence</th>
                <th className="text-left px-3 py-2">Estado</th>
                <th className="text-right px-3 py-2">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Cargando…</td></tr>
              )}
              {!isLoading && list.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  Sin cotizaciones
                </td></tr>
              )}
              {list.map(c => (
                <tr
                  key={c.id}
                  className="border-t border-border hover:bg-muted/30 cursor-pointer"
                  onClick={() => navigate(`/cotizaciones/${c.id}`)}
                >
                  <td className="px-3 py-2 font-medium">{c.folio}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.fecha)}</td>
                  <td className="px-3 py-2">{c.clientes?.nombre || 'Sin cliente'}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatCurrency(c.total, c.moneda)}</td>
                  <td className="px-3 py-2 text-muted-foreground">{fmtDate(c.vence_at)}</td>
                  <td className="px-3 py-2">
                    <Badge className={ESTADO_STYLES[c.estado] || 'bg-muted'}>{c.estado}</Badge>
                    {c.enviada_wa_at && <Send className="inline ml-1 h-3 w-3 text-blue-500" />}
                    {c.venta_id && <ShoppingCart className="inline ml-1 h-3 w-3 text-emerald-600" />}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost" size="icon"
                      onClick={() => setToDelete(c)}
                      disabled={c.estado === 'convertida'}
                      title={c.estado === 'convertida' ? 'No se puede eliminar (ya convertida)' : 'Eliminar'}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar cotización</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Eliminar la cotización <strong>{toDelete?.folio}</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (toDelete?.id) await del.mutateAsync(toDelete.id);
                setToDelete(null);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
