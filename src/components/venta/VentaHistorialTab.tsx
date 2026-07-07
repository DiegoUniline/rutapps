import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, RotateCcw, Check, Pencil, Plus, Trash2, Banknote, X, FileText, Truck, Package, MapPin, AlertCircle } from 'lucide-react';
import { fmtDate } from '@/lib/utils';

const ACCION_ICONS: Record<string, any> = {
  creada: Plus,
  editada: Pencil,
  confirmada: Check,
  cancelada: X,
  vuelta_borrador: RotateCcw,
  pago_agregado: Banknote,
  pago_eliminado: Trash2,
  linea_agregada: Plus,
  linea_editada: Pencil,
  linea_eliminada: Trash2,
  entregada: Check,
  facturada: FileText,
  entrega_creada: Truck,
  entrega_surtida: Package,
  entrega_asignada: Package,
  entrega_cargada: Truck,
  entrega_en_ruta: MapPin,
  entrega_lista: Check,
  entrega_hecha: Check,
  entrega_editada: Pencil,
  entrega_cancelada: X,
  entrega_no_entregada: AlertCircle,
};

const ACCION_COLORS: Record<string, string> = {
  creada: 'bg-primary/10 text-primary',
  editada: 'bg-warning/10 text-warning',
  confirmada: 'bg-success/10 text-success',
  cancelada: 'bg-destructive/10 text-destructive',
  vuelta_borrador: 'bg-warning/10 text-warning',
  pago_agregado: 'bg-success/10 text-success',
  pago_eliminado: 'bg-destructive/10 text-destructive',
  entregada: 'bg-success/10 text-success',
  facturada: 'bg-primary/10 text-primary',
  linea_agregada: 'bg-primary/10 text-primary',
  linea_editada: 'bg-warning/10 text-warning',
  linea_eliminada: 'bg-destructive/10 text-destructive',
  entrega_creada: 'bg-brand-orange/15 text-brand-orange',
  entrega_surtida: 'bg-brand-orange/15 text-brand-orange',
  entrega_asignada: 'bg-brand-orange/15 text-brand-orange',
  entrega_cargada: 'bg-brand-orange/15 text-brand-orange',
  entrega_en_ruta: 'bg-brand-orange/15 text-brand-orange',
  entrega_lista: 'bg-brand-orange/15 text-brand-orange',
  entrega_hecha: 'bg-success/10 text-success',
  entrega_editada: 'bg-warning/10 text-warning',
  entrega_cancelada: 'bg-destructive/10 text-destructive',
  entrega_no_entregada: 'bg-destructive/10 text-destructive',
};

const ACCION_LABELS: Record<string, string> = {
  creada: 'Venta creada',
  editada: 'Venta editada',
  confirmada: 'Venta confirmada',
  cancelada: 'Venta cancelada',
  vuelta_borrador: 'Regresada a borrador',
  pago_agregado: 'Pago registrado',
  pago_eliminado: 'Pago eliminado',
  linea_agregada: 'Producto agregado',
  linea_editada: 'Producto editado',
  linea_eliminada: 'Producto eliminado',
  entregada: 'Venta entregada',
  facturada: 'Venta facturada',
  entrega_creada: 'Entrega creada',
  entrega_surtida: 'Entrega surtida',
  entrega_asignada: 'Entrega asignada a ruta',
  entrega_cargada: 'Entrega cargada al camión',
  entrega_en_ruta: 'Entrega en ruta',
  entrega_lista: 'Entrega lista',
  entrega_hecha: 'Entrega completada',
  entrega_editada: 'Entrega editada',
  entrega_cancelada: 'Entrega cancelada',
  entrega_no_entregada: 'Entrega no realizada',
};

interface Props {
  ventaId: string;
}

export function VentaHistorialTab({ ventaId }: Props) {
  const { data: historial, isLoading } = useQuery({
    queryKey: ['venta-historial', ventaId],
    enabled: !!ventaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('venta_historial')
        .select('*')
        .eq('venta_id', ventaId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Cargando historial...</div>;

  if (!historial?.length) {
    return (
      <div className="p-6 text-center">
        <Clock className="h-10 w-10 mx-auto mb-2 text-muted-foreground/30" />
        <p className="text-sm text-muted-foreground">Sin historial de cambios</p>
      </div>
    );
  }

  const renderDetalles = (detalles: any) => {
    if (!detalles) return null;
    if (Array.isArray(detalles)) {
      return detalles.map((d: any, i: number) => (
        <span key={i} className="mr-2">{typeof d === 'string' ? d : JSON.stringify(d)}</span>
      ));
    }
    if (typeof detalles !== 'object') return String(detalles);
    const entries = Object.entries(detalles);
    if (!entries.length) return null;
    return (
      <div className="flex flex-wrap gap-x-3 gap-y-0.5">
        {entries.map(([key, val]: [string, any]) => {
          const isChange = val && typeof val === 'object' && !Array.isArray(val) && ('anterior' in val || 'nuevo' in val);
          return (
            <span key={key} className="text-[11px]">
              <span className="text-muted-foreground">{key}: </span>
              {isChange ? (
                <>
                  {'anterior' in val && val.anterior !== null && val.anterior !== undefined && (
                    <>
                      <span className="line-through text-destructive/70">{String(val.anterior)}</span>
                      {' → '}
                    </>
                  )}
                  <span className="font-medium text-foreground">{String(val.nuevo ?? '')}</span>
                </>
              ) : val && typeof val === 'object' ? (
                <span className="font-medium text-foreground">{JSON.stringify(val)}</span>
              ) : (
                <span className="font-medium text-foreground">{String(val)}</span>
              )}
            </span>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-3">
      <div className="border border-border rounded-lg overflow-hidden bg-card">
        <table className="w-full text-[12px]">
          <thead className="bg-accent/60">
            <tr className="text-left text-muted-foreground">
              <th className="px-3 py-2 font-semibold w-10">#</th>
              <th className="px-3 py-2 font-semibold w-44">Fecha</th>
              <th className="px-3 py-2 font-semibold w-56">Evento</th>
              <th className="px-3 py-2 font-semibold w-40">Usuario</th>
              <th className="px-3 py-2 font-semibold">Detalles</th>
            </tr>
          </thead>
          <tbody>
            {historial.map((entry: any, idx: number) => {
              const Icon = ACCION_ICONS[entry.accion] || Clock;
              const color = ACCION_COLORS[entry.accion] || 'bg-muted text-muted-foreground';
              const label = ACCION_LABELS[entry.accion] || entry.accion;
              const fecha = new Date(entry.created_at);
              return (
                <tr key={entry.id} className="border-t border-border hover:bg-accent/30">
                  <td className="px-3 py-2 text-muted-foreground tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {fecha.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit', year: '2-digit' })}{' '}
                    {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-medium ${color}`}>
                      <Icon className="h-3 w-3" />
                      {label}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-foreground">{entry.user_nombre || 'Sistema'}</td>
                  <td className="px-3 py-2">{renderDetalles(entry.detalles)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
