import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { ShoppingCart, Banknote, Users, TrendingUp } from 'lucide-react';
import { useVendedores } from '@/hooks/useClientes';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function SupervisorDashboardPage() {
  const { empresa } = useAuth();
  const today = new Date().toISOString().split('T')[0];
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);

  // All vendedores (filtered by empresa via centralized hook)
  const { data: vendedores } = useVendedores();

  // Today's sales for all vendedores
  const { data: ventasHoy } = useQuery({
    queryKey: ['supervisor-ventas-hoy', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, vendedor_id, total, status, tipo, created_at, cliente_id, clientes(nombre)')
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000, // Refresh every 30s
  });

  // Today's cobros
  const { data: cobrosHoy } = useQuery({
    queryKey: ['supervisor-cobros-hoy', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('cobros')
        .select('id, user_id, monto, metodo_pago, created_at, cliente_id, clientes(nombre)')
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Today's gastos
  const { data: gastosHoy } = useQuery({
    queryKey: ['supervisor-gastos-hoy', today],
    queryFn: async () => {
      const { data } = await supabase
        .from('gastos')
        .select('id, vendedor_id, monto, concepto, created_at')
        .eq('fecha', today);
      return data ?? [];
    },
    refetchInterval: 30000,
  });

  // Active cargas
  const { data: cargasActivas } = useQuery({
    queryKey: ['supervisor-cargas-activas'],
    queryFn: async () => {
      const { data } = await supabase
        .from('cargas')
        .select('id, vendedor_id, status, fecha, vendedores(nombre)')
        .in('status', ['en_ruta', 'pendiente'] as any)
        .order('fecha', { ascending: false });
      return data ?? [];
    },
    refetchInterval: 60000,
  });

  // Aggregate per vendedor
  const vendedorStats = useMemo(() => {
    const stats: Record<string, {
      ventas: number; totalVentas: number; cobros: number; totalCobros: number;
      gastos: number; totalGastos: number; cargaActiva: boolean;
    }> = {};

    (vendedores ?? []).forEach(v => {
      stats[v.id] = { ventas: 0, totalVentas: 0, cobros: 0, totalCobros: 0, gastos: 0, totalGastos: 0, cargaActiva: false };
    });

    (ventasHoy ?? []).forEach((v: any) => {
      if (v.vendedor_id && stats[v.vendedor_id]) {
        stats[v.vendedor_id].ventas++;
        stats[v.vendedor_id].totalVentas += v.total ?? 0;
      }
    });

    (cobrosHoy ?? []).forEach((c: any) => {
      // cobros don't have vendedor_id directly, skip for now
    });

    (gastosHoy ?? []).forEach((g: any) => {
      if (g.vendedor_id && stats[g.vendedor_id]) {
        stats[g.vendedor_id].gastos++;
        stats[g.vendedor_id].totalGastos += g.monto ?? 0;
      }
    });

    (cargasActivas ?? []).forEach((c: any) => {
      if (c.vendedor_id && stats[c.vendedor_id]) {
        stats[c.vendedor_id].cargaActiva = true;
      }
    });

    return stats;
  }, [vendedores, ventasHoy, cobrosHoy, gastosHoy, cargasActivas]);

  // Global totals
  const globalStats = useMemo(() => ({
    totalVentas: (ventasHoy ?? []).reduce((s: number, v: any) => s + (v.total ?? 0), 0),
    numVentas: (ventasHoy ?? []).length,
    totalCobros: (cobrosHoy ?? []).reduce((s: number, c: any) => s + (c.monto ?? 0), 0),
    numCobros: (cobrosHoy ?? []).length,
    totalGastos: (gastosHoy ?? []).reduce((s: number, g: any) => s + (g.monto ?? 0), 0),
    vendedoresActivos: Object.values(vendedorStats).filter(v => v.ventas > 0 || v.cargaActiva).length,
  }), [ventasHoy, cobrosHoy, gastosHoy, vendedorStats]);

  const filteredVentas = selectedVendedor
    ? (ventasHoy ?? []).filter((v: any) => v.vendedor_id === selectedVendedor)
    : ventasHoy ?? [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Panel supervisor</h1>
          <p className="text-sm text-muted-foreground">Actividad del día en tiempo real</p>
        </div>
        <Badge variant="outline" className="text-xs gap-1">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          En vivo
        </Badge>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={ShoppingCart} label="Ventas" value={`$${fmt(globalStats.totalVentas)}`} sub={`${globalStats.numVentas} ventas`} color="text-primary" />
        <KpiCard icon={Banknote} label="Cobros" value={`$${fmt(globalStats.totalCobros)}`} sub={`${globalStats.numCobros} cobros`} color="text-emerald-600" />
        <KpiCard icon={TrendingUp} label="Gastos" value={`$${fmt(globalStats.totalGastos)}`} sub="Gastos del día" color="text-destructive" />
        <KpiCard icon={Users} label="Vendedores activos" value={String(globalStats.vendedoresActivos)} sub={`de ${vendedores?.length ?? 0} totales`} color="text-primary" />
      </div>

      {/* Vendedor cards */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">Vendedores</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {(vendedores ?? []).map(v => {
            const st = vendedorStats[v.id];
            if (!st) return null;
            const isSelected = selectedVendedor === v.id;
            return (
              <button key={v.id}
                onClick={() => setSelectedVendedor(isSelected ? null : v.id)}
                className={cn(
                  "bg-card border rounded-xl p-4 text-left transition-all active:scale-[0.98]",
                  isSelected ? "border-primary ring-1 ring-primary/20" : "border-border hover:border-primary/30"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-foreground">{v.nombre}</span>
                  <div className="flex items-center gap-1.5">
                    {st.cargaActiva && <Badge variant="default" className="text-[10px] h-5">En ruta</Badge>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg font-bold text-foreground">{st.ventas}</p>
                    <p className="text-[10px] text-muted-foreground">Ventas</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-primary">${fmt(st.totalVentas)}</p>
                    <p className="text-[10px] text-muted-foreground">Total</p>
                  </div>
                  <div>
                    <p className="text-lg font-bold text-destructive">${fmt(st.totalGastos)}</p>
                    <p className="text-[10px] text-muted-foreground">Gastos</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Recent activity feed */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3">
          {selectedVendedor ? `Ventas de ${vendedores?.find(v => v.id === selectedVendedor)?.nombre}` : 'Últimas ventas'}
        </h2>
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          {filteredVentas.length === 0 ? (
            <p className="text-center py-8 text-sm text-muted-foreground">No hay ventas registradas hoy</p>
          ) : (
            <div className="divide-y divide-border">
              {filteredVentas.slice(0, 20).map((v: any) => (
                <div key={v.id} className="px-4 py-3 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <ShoppingCart className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{(v.clientes as any)?.nombre || 'Sin cliente'}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(v.created_at).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      <Badge variant={v.status === 'confirmado' ? 'default' : 'secondary'} className="text-[9px] h-4">{v.status}</Badge>
                    </p>
                  </div>
                  <span className="text-sm font-bold text-foreground tabular-nums">${fmt(v.total ?? 0)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color }: { icon: any; label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={cn("h-4 w-4", color)} />
        <span className="text-xs text-muted-foreground font-medium">{label}</span>
      </div>
      <p className="text-xl font-bold text-foreground">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>
    </div>
  );
}
