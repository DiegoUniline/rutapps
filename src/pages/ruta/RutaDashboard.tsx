import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Users, Package, Banknote, TrendingUp, MapPinned, RotateCcw, PackageCheck } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOfflineQuery } from '@/hooks/useOfflineData';

export default function RutaDashboard() {
  const navigate = useNavigate();
  const { profile, empresa, user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const vendedorId = profile?.vendedor_id;

  const { data: ventas } = useOfflineQuery('ventas', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: clientes } = useOfflineQuery('clientes', { empresa_id: empresa?.id, vendedor_id: vendedorId }, { enabled: !!empresa?.id && !!vendedorId });
  const { data: gastos } = useOfflineQuery('gastos', { empresa_id: empresa?.id, fecha: today, user_id: user?.id }, { enabled: !!empresa?.id && !!user?.id });
  const { data: cobros } = useOfflineQuery('cobros', { empresa_id: empresa?.id, fecha: today, user_id: user?.id }, { enabled: !!empresa?.id && !!user?.id });

  const ventasHoy = (ventas ?? []).filter((v: any) => v.fecha === today);
  const stats = {
    ventasHoy: ventasHoy.length,
    totalVentas: ventasHoy.reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    clientesActivos: (clientes ?? []).length,
    gastosHoy: (gastos ?? []).reduce((s: number, g: any) => s + (g.monto ?? 0), 0),
    numGastos: (gastos ?? []).length,
    cobrosHoy: (cobros ?? []).reduce((s: number, c: any) => s + (c.monto ?? 0), 0),
    numCobros: (cobros ?? []).length,
  };

  const dayName = new Date().toLocaleDateString('es-MX', { weekday: 'long' });
  const dateStr = new Date().toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });

  const cards = [
    { key: 'ventas', label: 'Ventas de hoy', icon: ShoppingCart, color: 'bg-primary/10 text-primary', path: '/ruta/ventas',
      stat: `${stats.ventasHoy} ventas`, sub: `$ ${stats.totalVentas.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` },
    { key: 'clientes', label: 'Clientes', icon: Users, color: 'bg-success/10 text-success', path: '/ruta/clientes',
      stat: `${stats.clientesActivos} activos`, sub: 'Ver todos' },
    { key: 'stock', label: 'Stock abordo', icon: Package, color: 'bg-warning/10 text-warning', path: '/ruta/stock',
      stat: 'Consultar', sub: 'Productos cargados' },
    { key: 'cobros', label: 'Cobros de hoy', icon: Banknote, color: 'bg-success/10 text-success', path: '/ruta/cobros',
      stat: `${stats.numCobros} cobros`, sub: `$ ${stats.cobrosHoy.toLocaleString('es-MX', { minimumFractionDigits: 2 })}` },
  ];

  return (
    <div className="p-4 space-y-5">
      <div>
        <p className="text-muted-foreground text-[13px] capitalize">{dayName}, {dateStr}</p>
        <h1 className="text-[22px] font-bold text-foreground">
          Hola, {profile?.nombre?.split(' ')[0] ?? 'Vendedor'} 👋
        </h1>
      </div>

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

      <div className="grid grid-cols-2 gap-3">
        {cards.map(card => (
          <button key={card.key} onClick={() => navigate(card.path)}
            className="bg-card border border-border rounded-2xl p-4 text-left active:scale-[0.97] transition-transform">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 ${card.color}`}>
              <card.icon className="h-5 w-5" />
            </div>
            <p className="text-[13px] font-semibold text-foreground">{card.label}</p>
            <p className="text-[15px] font-bold text-foreground mt-0.5">{card.stat}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{card.sub}</p>
          </button>
        ))}
      </div>

      <div className="space-y-2">
        <button onClick={() => navigate('/ruta/ventas/nueva')}
          className="w-full bg-primary text-primary-foreground rounded-2xl py-4 text-[15px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
          <ShoppingCart className="h-5 w-5" /> Nueva venta rápida
        </button>
        <button onClick={() => navigate('/ruta/devolucion')}
          className="w-full bg-card border border-border text-foreground rounded-2xl py-3.5 text-[14px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
          <RotateCcw className="h-4 w-4 text-destructive" /> Registrar devolución
        </button>
        <button onClick={() => navigate('/ruta/mapa')}
          className="w-full bg-card border border-border text-foreground rounded-2xl py-3.5 text-[14px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
          <MapPinned className="h-4 w-4 text-primary" /> Ver mapa de ruta
        </button>
        <button onClick={() => navigate('/ruta/descarga')}
          className="w-full bg-card border border-border text-foreground rounded-2xl py-3.5 text-[14px] font-semibold active:scale-[0.98] transition-transform flex items-center justify-center gap-2">
          <PackageCheck className="h-4 w-4 text-primary" /> Descargar ruta
        </button>
      </div>
    </div>
  );
}
