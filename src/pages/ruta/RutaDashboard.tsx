import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Users, Package, Banknote, TrendingUp, MapPin, Truck, RotateCcw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

function useTodayStats() {
  const { empresa } = useAuth();
  const today = new Date().toISOString().slice(0, 10);

  return useQuery({
    queryKey: ['ruta-stats', empresa?.id, today],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const eid = empresa!.id;
      const [ventas, clientes, gastos, cobros] = await Promise.all([
        supabase.from('ventas').select('id, total, status').eq('empresa_id', eid).eq('fecha', today),
        supabase.from('clientes').select('id').eq('empresa_id', eid).eq('status', 'activo'),
        supabase.from('gastos').select('id, monto').eq('empresa_id', eid).eq('fecha', today),
        supabase.from('cobros').select('id, monto').eq('empresa_id', eid).eq('fecha', today),
      ]);
      const ventasData = ventas.data ?? [];
      const gastosData = gastos.data ?? [];
      const cobrosData = cobros.data ?? [];
      return {
        ventasHoy: ventasData.length,
        totalVentas: ventasData.reduce((s, v) => s + (v.total ?? 0), 0),
        clientesActivos: (clientes.data ?? []).length,
        gastosHoy: gastosData.reduce((s, g) => s + (g.monto ?? 0), 0),
        numGastos: gastosData.length,
        cobrosHoy: cobrosData.reduce((s, c) => s + (c.monto ?? 0), 0),
        numCobros: cobrosData.length,
      };
    },
  });
}

const cards = [
  {
    key: 'ventas',
    label: 'Ventas de hoy',
    icon: ShoppingCart,
    color: 'bg-primary/10 text-primary',
    path: '/ruta/ventas',
    stat: (s: any) => `${s.ventasHoy} ventas`,
    sub: (s: any) => `$ ${s.totalVentas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
  },
  {
    key: 'clientes',
    label: 'Clientes',
    icon: Users,
    color: 'bg-success/10 text-success',
    path: '/ruta/clientes',
    stat: (s: any) => `${s.clientesActivos} activos`,
    sub: () => 'Ver todos',
  },
  {
    key: 'stock',
    label: 'Stock abordo',
    icon: Package,
    color: 'bg-warning/10 text-warning',
    path: '/ruta/stock',
    stat: () => 'Consultar',
    sub: () => 'Productos cargados',
  },
  {
    key: 'cobros',
    label: 'Cobros de hoy',
    icon: Banknote,
    color: 'bg-success/10 text-success',
    path: '/ruta/cobros',
    stat: (s: any) => `${s.numCobros} cobros`,
    sub: (s: any) => `$ ${s.cobrosHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`,
  },
];

export default function RutaDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: stats } = useTodayStats();
  const today = new Date();
  const dayName = today.toLocaleDateString('es-MX', { weekday: 'long' });
  const dateStr = today.toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

  return (
    <div className="p-4 space-y-5">
      {/* Header */}
      <div>
        <p className="text-muted-foreground text-[13px] capitalize">{dayName}, {dateStr}</p>
        <h1 className="text-[22px] font-bold text-foreground">
          Hola, {profile?.nombre?.split(' ')[0] ?? 'Vendedor'} 👋
        </h1>
      </div>

      {/* Quick stats banner */}
      {stats && (
        <div className="bg-primary rounded-2xl p-4 text-primary-foreground">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4" />
            <span className="text-[13px] font-medium opacity-90">Resumen del día</span>
          </div>
          <div className="text-[28px] font-bold">
            $ {stats.totalVentas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
          </div>
          <p className="text-[12px] opacity-75">{stats.ventasHoy} ventas realizadas</p>
        </div>
      )}

      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <button
            key={card.key}
            onClick={() => navigate(card.path)}
            className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.97] transition-transform"
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-[13px] font-semibold text-foreground">{card.label}</p>
            <p className="text-[15px] font-bold text-foreground mt-0.5">
              {stats ? card.stat(stats) : '—'}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {stats ? card.sub(stats) : ''}
            </p>
          </button>
        ))}
      </div>

      {/* Quick action */}
      <button
        onClick={() => navigate('/ruta/ventas/nueva')}
        className="w-full bg-primary text-primary-foreground rounded-2xl py-4 text-[15px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
      >
        <ShoppingCart className="h-5 w-5" />
        Nueva venta rápida
      </button>
    </div>
  );
}
