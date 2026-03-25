import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Clock, RotateCcw, Check, Pencil, Plus, Trash2, Banknote, X, FileText } from 'lucide-react';
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
        .order('created_at', { ascending: false });
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

  return (
    <div className="p-4 space-y-0">
      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-5 top-0 bottom-0 w-px bg-border" />
        
        {historial.map((entry: any, idx: number) => {
          const Icon = ACCION_ICONS[entry.accion] || Clock;
          const color = ACCION_COLORS[entry.accion] || 'bg-muted text-muted-foreground';
          const label = ACCION_LABELS[entry.accion] || entry.accion;
          const detalles = entry.detalles;
          const fecha = new Date(entry.created_at);

          return (
            <div key={entry.id} className="relative pl-12 pb-6 last:pb-0">
              {/* Icon circle */}
              <div className={`absolute left-2.5 w-5 h-5 rounded-full flex items-center justify-center ${color} ring-2 ring-background`}>
                <Icon className="h-3 w-3" />
              </div>
              
              <div>
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[13px] font-semibold text-foreground">{label}</p>
                  <p className="text-[10px] text-muted-foreground shrink-0">
                    {fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} {fecha.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  por {entry.user_nombre || 'Sistema'}
                </p>

                {/* Show change details */}
                {detalles && typeof detalles === 'object' && !Array.isArray(detalles) && Object.keys(detalles).length > 0 && (
                  <div className="mt-2 bg-accent/40 rounded-lg p-2.5 space-y-1">
                    {Object.entries(detalles).map(([key, val]: [string, any]) => (
                      <div key={key} className="text-[11px]">
                        <span className="text-muted-foreground">{key}: </span>
                        {val && typeof val === 'object' && 'anterior' in val ? (
                          <span>
                            <span className="line-through text-destructive/70">{String(val.anterior)}</span>
                            {' → '}
                            <span className="font-medium text-foreground">{String(val.nuevo)}</span>
                          </span>
                        ) : (
                          <span className="font-medium text-foreground">{String(val)}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {Array.isArray(detalles) && detalles.length > 0 && (
                  <div className="mt-2 bg-accent/40 rounded-lg p-2.5 space-y-1">
                    {detalles.map((d: any, i: number) => (
                      <p key={i} className="text-[11px] text-foreground">
                        {typeof d === 'string' ? d : JSON.stringify(d)}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
