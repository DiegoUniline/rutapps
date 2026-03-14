import { X, ShoppingCart, Banknote, Calendar, TrendingUp } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

interface Props {
  clienteId: string;
  clienteNombre: string;
  onClose: () => void;
}

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2 });

export default function ClienteHistorial({ clienteId, clienteNombre, onClose }: Props) {
  const { empresa } = useAuth();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['cliente-historial', clienteId],
    enabled: !!clienteId,
    queryFn: async () => {
      const [ventas, cobros, ultimaVisita] = await Promise.all([
        supabase.from('ventas')
          .select('id, folio, fecha, total, saldo_pendiente, status, condicion_pago, tipo')
          .eq('cliente_id', clienteId)
          .order('fecha', { ascending: false })
          .limit(20),
        supabase.from('cobros')
          .select('id, fecha, monto, metodo_pago')
          .eq('cliente_id', clienteId)
          .order('fecha', { ascending: false })
          .limit(10),
        supabase.from('ventas')
          .select('fecha')
          .eq('cliente_id', clienteId)
          .in('status', ['confirmado', 'entregado', 'facturado'])
          .order('fecha', { ascending: false })
          .limit(1),
      ]);

      const ventasData = ventas.data ?? [];
      const cobrosData = cobros.data ?? [];
      const saldoTotal = ventasData
        .filter(v => (v.saldo_pendiente ?? 0) > 0)
        .reduce((s, v) => s + (v.saldo_pendiente ?? 0), 0);
      const totalComprado = ventasData
        .filter(v => v.status !== 'cancelado')
        .reduce((s, v) => s + (v.total ?? 0), 0);
      const numVentas = ventasData.filter(v => v.status !== 'cancelado').length;

      return {
        ventas: ventasData,
        cobros: cobrosData,
        saldoTotal,
        totalComprado,
        numVentas,
        ultimaVisita: ultimaVisita.data?.[0]?.fecha ?? null,
      };
    },
  });

  const statusLabel: Record<string, string> = {
    borrador: 'Borrador',
    confirmado: 'Confirmado',
    entregado: 'Entregado',
    facturado: 'Facturado',
    cancelado: 'Cancelado',
  };

  const statusColor: Record<string, string> = {
    borrador: 'bg-muted text-muted-foreground',
    confirmado: 'bg-primary/10 text-primary',
    entregado: 'bg-accent text-accent-foreground',
    facturado: 'bg-accent text-accent-foreground',
    cancelado: 'bg-destructive/10 text-destructive',
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card border-b border-border px-4 py-3 flex items-center gap-3">
        <button onClick={onClose} className="p-1 -ml-1"><X className="h-5 w-5 text-foreground" /></button>
        <div className="flex-1 min-w-0">
          <h1 className="text-[16px] font-bold text-foreground truncate">{clienteNombre}</h1>
          <p className="text-[11px] text-muted-foreground">Historial del cliente</p>
        </div>
        <button
          onClick={() => { onClose(); navigate(`/ruta/ventas/nueva?clienteId=${clienteId}`); }}
          className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-[12px] font-semibold active:scale-95 transition-transform"
        >
          Vender
        </button>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        {isLoading ? (
          <p className="text-center text-muted-foreground text-[13px] py-8">Cargando...</p>
        ) : data ? (
          <>
            {/* Stats cards */}
            <div className="grid grid-cols-2 gap-2">
              <StatCard icon={ShoppingCart} label="Compras" value={`${data.numVentas}`} sub={`$ ${fmt(data.totalComprado)}`} color="text-primary bg-primary/10" />
              <StatCard icon={Banknote} label="Saldo pendiente" value={`$ ${fmt(data.saldoTotal)}`} sub={data.saldoTotal > 0 ? 'Por cobrar' : 'Al corriente'} color={data.saldoTotal > 0 ? 'text-destructive bg-destructive/10' : 'text-primary bg-primary/10'} />
              <StatCard icon={Calendar} label="Última compra" value={data.ultimaVisita ? new Date(data.ultimaVisita + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : '—'} sub="" color="text-muted-foreground bg-muted" />
              <StatCard icon={TrendingUp} label="Promedio" value={data.numVentas > 0 ? `$ ${fmt(data.totalComprado / data.numVentas)}` : '—'} sub="por compra" color="text-muted-foreground bg-muted" />
            </div>

            {/* Recent sales */}
            <div>
              <p className="text-[12px] font-semibold text-muted-foreground uppercase mb-2">Últimas ventas</p>
              {data.ventas.length === 0 ? (
                <p className="text-[13px] text-muted-foreground text-center py-4">Sin ventas registradas</p>
              ) : (
                <div className="space-y-1.5">
                  {data.ventas.slice(0, 10).map(v => (
                    <button
                      key={v.id}
                      onClick={() => { onClose(); navigate(`/ruta/ventas/${v.id}`); }}
                      className="w-full bg-card border border-border rounded-xl px-3 py-2.5 flex items-center justify-between active:bg-muted/30 transition-colors"
                    >
                      <div className="text-left min-w-0">
                        <p className="text-[13px] font-semibold text-foreground">{v.folio ?? '—'}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{v.tipo === 'pedido' ? 'Pedido' : 'Venta'}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <p className="text-[13px] font-bold text-foreground">$ {fmt(v.total ?? 0)}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${statusColor[v.status] ?? 'bg-muted text-muted-foreground'}`}>
                          {statusLabel[v.status] ?? v.status}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Recent cobros */}
            {data.cobros.length > 0 && (
              <div>
                <p className="text-[12px] font-semibold text-muted-foreground uppercase mb-2">Últimos cobros</p>
                <div className="space-y-1.5">
                  {data.cobros.map(c => (
                    <div key={c.id} className="bg-card border border-border rounded-xl px-3 py-2.5 flex items-center justify-between">
                      <div>
                        <p className="text-[12px] text-muted-foreground">
                          {new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[11px] text-muted-foreground capitalize">{c.metodo_pago}</p>
                      </div>
                      <p className="text-[13px] font-bold text-primary">$ {fmt(c.monto)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-bold text-foreground">{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}
