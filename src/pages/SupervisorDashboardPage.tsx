import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import {
  AlertCircle,
  Banknote,
  CheckCircle2,
  Clock,
  Eye,
  MapPin,
  Package,
  RotateCcw,
  ShoppingCart,
  TrendingUp,
  Truck,
  Users,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn, todayInTimezone } from '@/lib/utils';
import { useCurrency } from '@/hooks/useCurrency';
import { GoogleMapsProvider, useGoogleMaps } from '@/hooks/useGoogleMapsKey';
import { GoogleMap, InfoWindow, Marker } from '@react-google-maps/api';

const MAP_CONTAINER = { width: '100%', height: '920px' };
const MAP_CENTER = { lat: 20.6597, lng: -103.3496 };

type DashboardSeller = {
  id: string;
  user_id: string;
  nombre: string;
  aliases: string[];
};

type MarkerPoint = {
  id: string;
  nombre: string;
  lat: number;
  lng: number;
  visitado: boolean;
  diasSinComprar: number | null;
  vendedorNombre: string;
};

function normalizePersonName(value?: string | null) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function getThemeColor(variable: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return raw ? `hsl(${raw})` : fallback;
}

function formatHour(dateLike?: string | null) {
  if (!dateLike) return '—';
  return new Date(dateLike).toLocaleTimeString('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function SupervisorDashboardPage() {
  const { empresa } = useAuth();
  const { fmt: fmtMoney } = useCurrency();
  const today = todayInTimezone(empresa?.zona_horaria);
  const [selectedVendedor, setSelectedVendedor] = useState<string | null>(null);
  const [visitFilter, setVisitFilter] = useState<'todos' | 'visitados' | 'pendientes'>('todos');
  const [soloHoy, setSoloHoy] = useState(true);

  const DIAS_SEMANA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const diaHoyLabel = DIAS_SEMANA[new Date().getDay()];

  const { data: vendedores } = useQuery({
    queryKey: ['supervisor-usuarios', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data: adminRoles } = await supabase
        .from('roles')
        .select('id')
        .eq('empresa_id', empresa!.id)
        .eq('nombre', 'Administrador');

      const adminRoleIds = (adminRoles ?? []).map((role) => role.id);

      const [adminAssignmentsResult, profilesResult, vendedoresResult] = await Promise.all([
        adminRoleIds.length > 0
          ? supabase.from('user_roles').select('user_id').in('role_id', adminRoleIds)
          : Promise.resolve({ data: [] as { user_id: string }[] }),
        supabase
          .from('profiles')
          .select('id, user_id, nombre, estado')
          .eq('empresa_id', empresa!.id)
          .eq('estado', 'activo')
          .order('nombre'),
        supabase.from('vendedores').select('id, nombre').eq('empresa_id', empresa!.id),
      ]);

      const adminUserIds = (adminAssignmentsResult.data ?? []).map((row) => row.user_id);
      const visibleProfiles = (profilesResult.data ?? []).filter((profile) => !adminUserIds.includes(profile.user_id));

      const aliasesByName = new Map<string, string[]>();
      (vendedoresResult.data ?? []).forEach((seller) => {
        const key = normalizePersonName(seller.nombre);
        if (!key) return;
        const current = aliasesByName.get(key) ?? [];
        current.push(seller.id);
        aliasesByName.set(key, current);
      });

      return visibleProfiles.map((profile) => {
        const key = normalizePersonName(profile.nombre);
        const aliases = Array.from(new Set([profile.id, ...(aliasesByName.get(key) ?? [])]));

        return {
          id: profile.id,
          user_id: profile.user_id,
          nombre: profile.nombre ?? 'Sin nombre',
          aliases,
        } satisfies DashboardSeller;
      });
    },
  });

  const sellerIdMap = useMemo(() => {
    const map = new Map<string, string>();
    (vendedores ?? []).forEach((seller) => {
      seller.aliases.forEach((alias) => map.set(alias, seller.id));
    });
    return map;
  }, [vendedores]);

  const sellerNameMap = useMemo(() => {
    const map = new Map<string, string>();
    (vendedores ?? []).forEach((seller) => {
      map.set(seller.id, seller.nombre);
      seller.aliases.forEach((alias) => map.set(alias, seller.nombre));
    });
    return map;
  }, [vendedores]);

  const selectedSeller = useMemo(
    () => (vendedores ?? []).find((seller) => seller.id === selectedVendedor) ?? null,
    [selectedVendedor, vendedores],
  );

  const selectedAliases = selectedSeller?.aliases ?? null;
  const allDashboardSellerIds = useMemo(
    () => Array.from(new Set((vendedores ?? []).flatMap((seller) => seller.aliases))),
    [vendedores],
  );

  const { data: ventasHoy } = useQuery({
    queryKey: ['supervisor-ventas-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('ventas')
        .select('id, vendedor_id, total, subtotal, status, tipo, condicion_pago, created_at, cliente_id, clientes(nombre), venta_lineas(producto_id, cantidad, total, productos(nombre, codigo))')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .neq('status', 'cancelado')
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: cobrosHoy } = useQuery({
    queryKey: ['supervisor-cobros-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('cobros')
        .select('id, user_id, monto, metodo_pago, created_at, cliente_id, clientes(nombre)')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: gastosHoy } = useQuery({
    queryKey: ['supervisor-gastos-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('gastos')
        .select('id, vendedor_id, monto, concepto, created_at')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: entregasHoy } = useQuery({
    queryKey: ['supervisor-entregas-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('entregas')
        .select('id, vendedor_id, vendedor_ruta_id, status, cliente_id, clientes(nombre), folio')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today);
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: visitasHoy } = useQuery({
    queryKey: ['supervisor-visitas-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('visitas')
        .select('id, user_id, cliente_id, tipo, motivo, gps_lat, gps_lng, created_at, clientes(nombre, gps_lat, gps_lng)')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const MOTIVO_LABELS: Record<string, string> = { no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro' };

  const { data: devolucionesHoy } = useQuery({
    queryKey: ['supervisor-devoluciones-hoy', today, empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('devoluciones')
        .select('id, vendedor_id, tipo, clientes(nombre), created_at, devolucion_lineas(cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(nombre))')
        .eq('empresa_id', empresa!.id)
        .eq('fecha', today)
        .order('created_at', { ascending: false });
      return (data ?? []) as any[];
    },
    refetchInterval: 30000,
  });

  const { data: clientesAsignados } = useQuery({
    queryKey: ['supervisor-clientes-asignados', empresa?.id, allDashboardSellerIds],
    enabled: !!empresa?.id && allDashboardSellerIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from('clientes')
        .select('id, nombre, vendedor_id, gps_lat, gps_lng, dia_visita')
        .eq('empresa_id', empresa!.id)
        .in('vendedor_id', allDashboardSellerIds);
      return (data ?? []) as any[];
    },
  });

  const { data: ventasRecientes } = useQuery({
    queryKey: ['supervisor-ventas-recientes', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const desde = new Date();
      desde.setDate(desde.getDate() - 90);
      const { data } = await supabase
        .from('ventas')
        .select('id, cliente_id, fecha, total')
        .eq('empresa_id', empresa!.id)
        .neq('status', 'cancelado')
        .gte('fecha', desde.toISOString().slice(0, 10))
        .order('fecha', { ascending: false });
      return (data ?? []) as any[];
    },
  });

  const { data: cargasActivas } = useQuery({
    queryKey: ['supervisor-cargas-activas', empresa?.id],
    enabled: !!empresa?.id,
    queryFn: async () => {
      const { data } = await supabase
        .from('cargas')
        .select('id, vendedor_id, status, fecha')
        .eq('empresa_id', empresa!.id)
        .in('status', ['en_ruta', 'pendiente'] as any);
      return (data ?? []) as any[];
    },
    refetchInterval: 60000,
  });

  const filteredVentas = useMemo(
    () => (ventasHoy ?? []).filter((venta) => !selectedAliases || selectedAliases.includes(venta.vendedor_id)),
    [ventasHoy, selectedAliases],
  );

  const filteredCobros = useMemo(
    () => (cobrosHoy ?? []).filter((cobro) => !selectedSeller || cobro.user_id === selectedSeller.user_id),
    [cobrosHoy, selectedSeller],
  );

  const filteredGastos = useMemo(
    () => (gastosHoy ?? []).filter((gasto) => !selectedAliases || selectedAliases.includes(gasto.vendedor_id)),
    [gastosHoy, selectedAliases],
  );

  const filteredEntregas = useMemo(
    () =>
      (entregasHoy ?? []).filter((entrega) => {
        if (!selectedAliases) return true;
        const ownerId = entrega.vendedor_ruta_id || entrega.vendedor_id;
        return selectedAliases.includes(ownerId);
      }),
    [entregasHoy, selectedAliases],
  );

  const filteredVisitas = useMemo(
    () => (visitasHoy ?? []).filter((visita) => !selectedSeller || visita.user_id === selectedSeller.user_id),
    [visitasHoy, selectedSeller],
  );

  const filteredDevoluciones = useMemo(
    () => (devolucionesHoy ?? []).filter((dev: any) => !selectedAliases || selectedAliases.includes(dev.vendedor_id)),
    [devolucionesHoy, selectedAliases],
  );

  const devolucionesStats = useMemo(() => {
    let totalUnidades = 0;
    let totalCredito = 0;
    const porMotivo: Record<string, number> = {};
    filteredDevoluciones.forEach((d: any) => {
      (d.devolucion_lineas ?? []).forEach((l: any) => {
        const qty = Number(l.cantidad) || 0;
        totalUnidades += qty;
        totalCredito += Number(l.monto_credito) || 0;
        const motivo = l.motivo || 'otro';
        porMotivo[motivo] = (porMotivo[motivo] || 0) + qty;
      });
    });
    return { totalUnidades, totalCredito, porMotivo, count: filteredDevoluciones.length };
  }, [filteredDevoluciones]);

  const productosSummary = useMemo(() => {
    const summary: Record<string, { nombre: string; codigo: string; cantidad: number; total: number }> = {};

    filteredVentas.forEach((venta) => {
      (venta.venta_lineas ?? []).forEach((linea: any) => {
        if (!linea.producto_id) return;
        const producto = linea.productos as any;
        if (!summary[linea.producto_id]) {
          summary[linea.producto_id] = {
            nombre: producto?.nombre ?? '—',
            codigo: producto?.codigo ?? '',
            cantidad: 0,
            total: 0,
          };
        }

        summary[linea.producto_id].cantidad += linea.cantidad ?? 0;
        summary[linea.producto_id].total += linea.total ?? 0;
      });
    });

    return Object.values(summary).sort((a, b) => b.total - a.total);
  }, [filteredVentas]);

  const vendedorStats = useMemo(() => {
    const stats: Record<
      string,
      {
        ventas: number;
        totalVentas: number;
        cobros: number;
        totalCobros: number;
        gastos: number;
        totalGastos: number;
        cargaActiva: boolean;
        entregas: number;
        entregasHecho: number;
        visitas: number;
      }
    > = {};

    (vendedores ?? []).forEach((seller) => {
      stats[seller.id] = {
        ventas: 0,
        totalVentas: 0,
        cobros: 0,
        totalCobros: 0,
        gastos: 0,
        totalGastos: 0,
        cargaActiva: false,
        entregas: 0,
        entregasHecho: 0,
        visitas: 0,
      };
    });

    (ventasHoy ?? []).forEach((venta) => {
      const canonicalSellerId = sellerIdMap.get(venta.vendedor_id);
      if (!canonicalSellerId || !stats[canonicalSellerId]) return;
      stats[canonicalSellerId].ventas += 1;
      stats[canonicalSellerId].totalVentas += venta.total ?? 0;
    });

    (cobrosHoy ?? []).forEach((cobro) => {
      const seller = (vendedores ?? []).find((item) => item.user_id === cobro.user_id);
      if (!seller || !stats[seller.id]) return;
      stats[seller.id].cobros += 1;
      stats[seller.id].totalCobros += cobro.monto ?? 0;
    });

    (gastosHoy ?? []).forEach((gasto) => {
      const canonicalSellerId = sellerIdMap.get(gasto.vendedor_id);
      if (!canonicalSellerId || !stats[canonicalSellerId]) return;
      stats[canonicalSellerId].gastos += 1;
      stats[canonicalSellerId].totalGastos += gasto.monto ?? 0;
    });

    (cargasActivas ?? []).forEach((carga) => {
      const canonicalSellerId = sellerIdMap.get(carga.vendedor_id);
      if (!canonicalSellerId || !stats[canonicalSellerId]) return;
      stats[canonicalSellerId].cargaActiva = true;
    });

    (entregasHoy ?? []).forEach((entrega) => {
      const canonicalSellerId = sellerIdMap.get(entrega.vendedor_ruta_id || entrega.vendedor_id);
      if (!canonicalSellerId || !stats[canonicalSellerId]) return;
      stats[canonicalSellerId].entregas += 1;
      if (entrega.status === 'hecho') stats[canonicalSellerId].entregasHecho += 1;
    });

    (visitasHoy ?? []).forEach((visita) => {
      const seller = (vendedores ?? []).find((item) => item.user_id === visita.user_id);
      if (!seller || !stats[seller.id]) return;
      stats[seller.id].visitas += 1;
    });

    return stats;
  }, [vendedores, ventasHoy, cobrosHoy, gastosHoy, cargasActivas, entregasHoy, visitasHoy, sellerIdMap]);

  const sellerRows = useMemo(() => {
    return (vendedores ?? [])
      .map((seller) => {
        const stats = vendedorStats[seller.id] ?? {
          ventas: 0,
          totalVentas: 0,
          cobros: 0,
          totalCobros: 0,
          gastos: 0,
          totalGastos: 0,
          cargaActiva: false,
          entregas: 0,
          entregasHecho: 0,
          visitas: 0,
        };

        return {
          ...seller,
          ...stats,
        };
      })
      .sort((a, b) => b.totalVentas - a.totalVentas || b.visitas - a.visitas || a.nombre.localeCompare(b.nombre));
  }, [vendedores, vendedorStats]);

  const clienteActivity = useMemo(() => {
    const visitedIds = new Set([
      ...filteredVisitas.map((visita) => visita.cliente_id).filter(Boolean),
      ...filteredVentas.map((venta) => venta.cliente_id).filter(Boolean),
    ]);
    const lastSaleByClient: Record<string, { ultima: string; total: number }> = {};

    (ventasRecientes ?? []).forEach((venta) => {
      if (!venta.cliente_id) return;
      if (!lastSaleByClient[venta.cliente_id] || venta.fecha > lastSaleByClient[venta.cliente_id].ultima) {
        lastSaleByClient[venta.cliente_id] = {
          ultima: venta.fecha,
          total: venta.total ?? 0,
        };
      }
    });

    const todayDate = new Date(`${today}T12:00:00`);

    return (clientesAsignados ?? [])
      .map((client) => {
        const canonicalSellerId = sellerIdMap.get(client.vendedor_id) ?? client.vendedor_id;
        const lastSale = lastSaleByClient[client.id];
        const diasSinComprar = lastSale
          ? Math.floor((todayDate.getTime() - new Date(`${lastSale.ultima}T12:00:00`).getTime()) / 86400000)
          : null;
        const diaVisita: string[] = (client.dia_visita ?? []).map((d: string) => d.toLowerCase());
        const visitaHoy = diaVisita.some((d) => d === diaHoyLabel);

        return {
          id: client.id,
          nombre: client.nombre,
          vendedor_id: canonicalSellerId,
          vendedorNombre: sellerNameMap.get(canonicalSellerId) ?? 'Sin asignar',
          visitado: visitedIds.has(client.id),
          visitaHoy,
          gps_lat: client.gps_lat,
          gps_lng: client.gps_lng,
          ultimaVisitaFecha: lastSale?.ultima ?? null,
          ultimaVisitaValor: lastSale?.total ?? 0,
          diasSinComprar,
        };
      })
      .filter((client) => {
        if (selectedVendedor && client.vendedor_id !== selectedVendedor) return false;
        if (soloHoy && !client.visitaHoy) return false;
        if (visitFilter === 'visitados' && !client.visitado) return false;
        if (visitFilter === 'pendientes' && client.visitado) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.visitado !== b.visitado) return a.visitado ? 1 : -1;
        return (b.diasSinComprar ?? 999) - (a.diasSinComprar ?? 999);
      });
  }, [filteredVisitas, filteredVentas, ventasRecientes, clientesAsignados, sellerIdMap, sellerNameMap, today, selectedVendedor, soloHoy, visitFilter, diaHoyLabel]);

  const mapMarkers = useMemo<MarkerPoint[]>(() => {
    return clienteActivity
      .filter((client) => client.gps_lat && client.gps_lng)
      .map((client) => ({
        id: client.id,
        nombre: client.nombre,
        lat: client.gps_lat,
        lng: client.gps_lng,
        visitado: client.visitado,
        diasSinComprar: client.diasSinComprar,
        vendedorNombre: client.vendedorNombre,
      }));
  }, [clienteActivity]);

  const dashboardStats = useMemo(() => {
    const totalVentas = filteredVentas.reduce((sum, venta) => sum + (venta.total ?? 0), 0);
    const totalCobros = filteredCobros.reduce((sum, cobro) => sum + (cobro.monto ?? 0), 0);
    const totalGastos = filteredGastos.reduce((sum, gasto) => sum + (gasto.monto ?? 0), 0);
    const clientesVisitados = clienteActivity.filter((client) => client.visitado).length;
    const clientesPorVisitar = Math.max(clienteActivity.length - clientesVisitados, 0);
    const productosVendidos = productosSummary.reduce((sum, product) => sum + product.cantidad, 0);
    const entregasHechas = filteredEntregas.filter((entrega) => entrega.status === 'hecho').length;
    const ticketPromedio = filteredVentas.length > 0 ? totalVentas / filteredVentas.length : 0;
    const sellersWithActivity = sellerRows.filter((seller) => {
      if (selectedVendedor) return seller.id === selectedVendedor;
      return seller.ventas > 0 || seller.cobros > 0 || seller.visitas > 0 || seller.cargaActiva;
    }).length;

    return {
      totalVentas,
      totalCobros,
      totalGastos,
      numVentas: filteredVentas.length,
      numCobros: filteredCobros.length,
      numVisitas: filteredVisitas.length,
      visitasConCompra: filteredVisitas.filter((visita) => visita.tipo === 'venta').length,
      clientesVisitados,
      clientesPorVisitar,
      productosVendidos,
      totalProductos: productosSummary.length,
      entregasHechas,
      entregasTotal: filteredEntregas.length,
      ticketPromedio,
      sellersWithActivity,
      sinGeo: Math.max(clienteActivity.length - mapMarkers.length, 0),
    };
  }, [filteredVentas, filteredCobros, filteredGastos, filteredVisitas, filteredEntregas, clienteActivity, mapMarkers.length, productosSummary, sellerRows, selectedVendedor]);

  const alertClients = useMemo(
    () =>
      clienteActivity
        .filter((client) => !client.visitado || (client.diasSinComprar ?? 0) >= 7)
        .slice(0, 8),
    [clienteActivity],
  );

  return (
    <div className="space-y-6 pb-6">
      <section className="rounded-3xl border border-border bg-gradient-to-br from-background via-background to-muted/40 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="gap-1.5">
                <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
                En vivo
              </Badge>
              <Badge variant="secondary">{today}</Badge>
              {selectedSeller && <Badge variant="secondary">Filtro: {selectedSeller.nombre}</Badge>}
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-foreground">Centro de control supervisor</h1>
              <p className="text-sm text-muted-foreground">
                Vista única tipo dashboard para ventas, cobros, rutas, clientes y operación del día.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSelectedVendedor(null)}
              className={cn(
                'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                !selectedVendedor
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              Todos
            </button>
            {sellerRows.map((seller) => {
              const active = selectedVendedor === seller.id;
              return (
                <button
                  key={seller.id}
                  type="button"
                  onClick={() => setSelectedVendedor(active ? null : seller.id)}
                  className={cn(
                    'rounded-full border px-4 py-2 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-background text-muted-foreground hover:text-foreground',
                  )}
                >
                  {seller.nombre}
                </button>
              );
            })}
          </div>

          {/* Visit & day filters */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <span className="text-xs font-medium text-muted-foreground mr-1">Estado:</span>
            {([['todos', 'Todos'], ['visitados', 'Visitados'], ['pendientes', 'Pendientes']] as const).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setVisitFilter(key)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  visitFilter === key
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground',
                )}
              >
                {label}
              </button>
            ))}

            <div className="ml-3 h-5 w-px bg-border" />

            <button
              type="button"
              onClick={() => setSoloHoy(!soloHoy)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors capitalize',
                soloHoy
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground',
              )}
            >
              📅 Solo {diaHoyLabel}
            </button>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard icon={ShoppingCart} label="Ventas" value={fmtMoney(dashboardStats.totalVentas)} sub={`${dashboardStats.numVentas} operaciones`} />
        <KpiCard icon={Banknote} label="Cobros" value={fmtMoney(dashboardStats.totalCobros)} sub={`${dashboardStats.numCobros} cobros`} />
        <KpiCard icon={TrendingUp} label="Ticket promedio" value={fmtMoney(dashboardStats.ticketPromedio)} sub="Promedio de venta" />
        <KpiCard icon={Package} label="Productos" value={String(dashboardStats.productosVendidos)} sub={`${dashboardStats.totalProductos} SKUs`} />
        <KpiCard icon={Eye} label="Visitas" value={String(dashboardStats.numVisitas)} sub={`${dashboardStats.visitasConCompra} con compra`} />
        <KpiCard icon={MapPin} label="Por visitar" value={String(dashboardStats.clientesPorVisitar)} sub={`${dashboardStats.clientesVisitados} visitados`} tone="warning" />
        <KpiCard icon={Truck} label="Entregas" value={`${dashboardStats.entregasHechas}/${dashboardStats.entregasTotal}`} sub="Hechas / total" />
        <KpiCard icon={RotateCcw} label="Devoluciones" value={`${devolucionesStats.totalUnidades} uds`} sub={`${devolucionesStats.count} registros`} tone="warning" />
        <KpiCard icon={Users} label="Activos" value={String(dashboardStats.sellersWithActivity)} sub={`de ${sellerRows.length} vendedores`} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1.45fr_0.95fr]">
        <Card className="overflow-hidden border-border/80">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl">Mapa operativo de clientes</CardTitle>
                <CardDescription>Visitados vs por visitar en la jornada actual.</CardDescription>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <LegendDot className="bg-primary" label="Visitado" />
                <LegendDot className="bg-destructive" label="Pendiente" />
                <span>{dashboardStats.clientesVisitados} / {clienteActivity.length} visitados</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <GoogleMapsProvider>
              <SupervisorMap markers={mapMarkers} />
            </GoogleMapsProvider>
            <div className="grid grid-cols-3 border-t border-border bg-muted/20">
              <MiniSummary label="Visitados" value={String(dashboardStats.clientesVisitados)} />
              <MiniSummary label="Pendientes" value={String(dashboardStats.clientesPorVisitar)} />
              <MiniSummary label="Sin geolocalizar" value={String(dashboardStats.sinGeo)} />
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Pulso del equipo</CardTitle>
              <CardDescription>Rendimiento individual para lectura rápida.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {sellerRows.length === 0 ? (
                <EmptyBlock text="No hay vendedores activos." />
              ) : (
                sellerRows.map((seller) => {
                  const active = selectedVendedor === seller.id;
                  return (
                    <button
                      key={seller.id}
                      type="button"
                      onClick={() => setSelectedVendedor(active ? null : seller.id)}
                      className={cn(
                        'w-full rounded-2xl border p-4 text-left transition-all',
                        active ? 'border-primary bg-primary/5 shadow-sm' : 'border-border hover:border-primary/30',
                      )}
                    >
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-foreground">{seller.nombre}</p>
                          <p className="text-xs text-muted-foreground">
                            {seller.cargaActiva ? 'Con carga activa' : 'Sin carga activa'}
                          </p>
                        </div>
                        {seller.cargaActiva && <Badge>En ruta</Badge>}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <MiniStat label="Ventas" value={String(seller.ventas)} />
                        <MiniStat label="Cobros" value={fmtMoney(seller.totalCobros)} />
                        <MiniStat label="Visitas" value={String(seller.visitas)} />
                        <MiniStat label="Entregas" value={`${seller.entregasHecho}/${seller.entregas}`} />
                      </div>
                    </button>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">Alertas y foco</CardTitle>
              <CardDescription>Clientes pendientes o con riesgo de enfriamiento.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alertClients.length === 0 ? (
                <EmptyBlock text="Sin alertas relevantes por ahora." />
              ) : (
                alertClients.map((client) => (
                  <div key={client.id} className="flex items-start gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                    {client.visitado ? (
                      <Clock className="mt-0.5 h-4 w-4 text-primary" />
                    ) : (
                      <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground">{client.nombre}</p>
                        <Badge variant={client.visitado ? 'secondary' : 'outline'}>
                          {client.visitado ? 'Sin compra reciente' : 'Pendiente'}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{client.vendedorNombre}</p>
                    </div>
                    <div className="text-right text-xs">
                      <p className="font-semibold text-foreground">{client.diasSinComprar !== null ? `${client.diasSinComprar}d` : '—'}</p>
                      <p className="text-muted-foreground">sin comprar</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr_1fr_1fr]">
        <ActivityList
          title="Ventas del día"
          description="Últimas ventas registradas"
          icon={ShoppingCart}
          items={filteredVentas.slice(0, 12).map((venta) => ({
            id: venta.id,
            primary: venta.clientes?.nombre || 'Público en general',
            secondary: `${sellerNameMap.get(venta.vendedor_id) ?? 'Sin vendedor'} · ${formatHour(venta.created_at)}`,
            badge: venta.status,
            value: fmtMoney(venta.total ?? 0),
          }))}
          emptyText="No hay ventas registradas hoy."
        />

        <ActivityList
          title="Cobros del día"
          description="Movimientos de cobranza"
          icon={Banknote}
          items={filteredCobros.slice(0, 12).map((cobro) => ({
            id: cobro.id,
            primary: cobro.clientes?.nombre || '—',
            secondary: `${cobro.metodo_pago || 'Sin método'} · ${formatHour(cobro.created_at)}`,
            value: fmtMoney(cobro.monto ?? 0),
          }))}
          emptyText="No hay cobros registrados hoy."
        />

        <ActivityList
          title="Devoluciones del día"
          description="Productos devueltos hoy"
          icon={RotateCcw}
          items={filteredDevoluciones.slice(0, 12).map((dev: any) => {
            const lineas = dev.devolucion_lineas ?? [];
            const uds = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
            const motivos = [...new Set(lineas.map((l: any) => MOTIVO_LABELS[l.motivo] ?? l.motivo))].join(', ');
            const productos = lineas.map((l: any) => {
              const nombre = l.productos?.nombre ?? '—';
              return `${nombre} x${Number(l.cantidad) || 0}`;
            }).join(', ');
            return {
              id: dev.id,
              primary: dev.clientes?.nombre || '—',
              secondary: `${sellerNameMap.get(dev.vendedor_id) ?? '—'} · ${motivos}`,
              badge: productos,
              value: `${uds} uds`,
            };
          })}
          emptyText="No hay devoluciones registradas hoy."
        />

        <ProductPanel products={productosSummary.slice(0, 10)} fmtMoney={fmtMoney} />
      </section>

      <Card className="overflow-hidden">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <CardTitle className="text-xl">Clientes en ruta</CardTitle>
              <CardDescription>
                Última compra, valor, días sin comprar y estado de visita del día.
              </CardDescription>
            </div>
            <Badge variant="secondary">{clienteActivity.length} clientes</Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {clienteActivity.length === 0 ? (
            <div className="px-6 pb-6">
              <EmptyBlock text="No hay clientes asignados para mostrar." />
            </div>
          ) : (
            <div className="max-h-[520px] overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 bg-card">
                  <tr className="border-y border-border bg-muted/30 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3 text-right">Última compra</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3 text-right">Días sin comprar</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {clienteActivity.map((client) => (
                    <tr key={client.id} className={cn('transition-colors hover:bg-muted/20', !client.visitado && 'bg-destructive/5')}>
                      <td className="px-4 py-3">
                        <StatusPill visitado={client.visitado} />
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground">{client.nombre}</td>
                      <td className="px-4 py-3 text-muted-foreground">{client.vendedorNombre}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {client.ultimaVisitaFecha ?? '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-foreground">
                        {client.ultimaVisitaValor ? fmtMoney(client.ultimaVisitaValor) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {client.diasSinComprar !== null ? (
                          <span
                            className={cn(
                              'font-semibold',
                              client.diasSinComprar > 14
                                ? 'text-destructive'
                                : client.diasSinComprar > 7
                                  ? 'text-primary'
                                  : 'text-muted-foreground',
                            )}
                          >
                            {client.diasSinComprar}d
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  tone = 'default',
}: {
  icon: any;
  label: string;
  value: string;
  sub: string;
  tone?: 'default' | 'warning';
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold leading-none text-foreground">{value}</p>
          </div>
          <div
            className={cn(
              'rounded-2xl border p-2',
              tone === 'warning'
                ? 'border-destructive/20 bg-destructive/10 text-destructive'
                : 'border-primary/20 bg-primary/10 text-primary',
            )}
          >
            <Icon className="h-4 w-4" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted/40 px-2 py-2 text-center">
      <p className="text-sm font-bold tabular-nums text-foreground">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
    </div>
  );
}

function MiniSummary({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-3 text-center">
      <p className="text-xl font-bold tabular-nums text-foreground">{value}</p>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
    </div>
  );
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn('h-2.5 w-2.5 rounded-full', className)} />
      {label}
    </span>
  );
}

function StatusPill({ visitado }: { visitado: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium',
        visitado ? 'border-primary/20 bg-primary/10 text-primary' : 'border-destructive/20 bg-destructive/10 text-destructive',
      )}
    >
      {visitado ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
      {visitado ? 'Visitado' : 'Pendiente'}
    </span>
  );
}

function EmptyBlock({ text }: { text: string }) {
  return <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-6 text-sm text-muted-foreground">{text}</div>;
}

function ActivityList({
  title,
  description,
  icon: Icon,
  items,
  emptyText,
}: {
  title: string;
  description: string;
  icon: any;
  items: { id: string; primary: string; secondary: string; badge?: string; value: string }[];
  emptyText: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-xl">{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {items.length === 0 ? (
          <EmptyBlock text={emptyText} />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-border bg-muted/20 p-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{item.primary}</p>
                  <p className="truncate text-xs text-muted-foreground">{item.secondary}</p>
                  {item.badge && <p className="truncate text-xs text-muted-foreground/70 mt-0.5 italic">{item.badge}</p>}
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ProductPanel({ products, fmtMoney }: { products: { nombre: string; codigo: string; cantidad: number; total: number }[]; fmtMoney: (value: number) => string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="rounded-2xl border border-primary/20 bg-primary/10 p-2 text-primary">
            <Package className="h-4 w-4" />
          </div>
          <div>
            <CardTitle className="text-xl">Top productos</CardTitle>
            <CardDescription>Mix vendido del día.</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {products.length === 0 ? (
          <EmptyBlock text="Sin productos vendidos hoy." />
        ) : (
          <div className="space-y-2">
            {products.map((product) => (
              <div key={`${product.codigo}-${product.nombre}`} className="rounded-2xl border border-border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-foreground">{product.nombre}</p>
                    <p className="text-xs text-muted-foreground">{product.codigo || 'Sin código'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-foreground">{product.cantidad}</p>
                    <p className="text-xs text-muted-foreground">{fmtMoney(product.total)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SupervisorMap({ markers }: { markers: MarkerPoint[] }) {
  const { isLoaded } = useGoogleMaps();
  const [selected, setSelected] = useState<MarkerPoint | null>(null);

  const center = useMemo(() => {
    if (markers.length === 0) return MAP_CENTER;
    const lats = markers.map((marker) => marker.lat);
    const lngs = markers.map((marker) => marker.lng);
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    };
  }, [markers]);

  const visitedColor = useMemo(() => getThemeColor('--primary', 'hsl(142 76% 36%)'), []);
  const pendingColor = useMemo(() => getThemeColor('--destructive', 'hsl(0 84% 60%)'), []);
  const strokeColor = useMemo(() => getThemeColor('--background', 'hsl(0 0% 100%)'), []);

  if (!isLoaded) {
    return (
      <div className="flex h-[920px] items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        Cargando mapa...
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="flex h-[920px] items-center justify-center bg-muted/20 text-sm text-muted-foreground">
        No hay clientes geolocalizados para mostrar.
      </div>
    );
  }

  return (
    <GoogleMap
      mapContainerStyle={MAP_CONTAINER}
      center={center}
      zoom={12}
      options={{
        disableDefaultUI: true,
        zoomControl: true,
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      }}
    >
      {markers.map((marker) => (
        <Marker
          key={marker.id}
          position={{ lat: marker.lat, lng: marker.lng }}
          onClick={() => setSelected(marker)}
          icon={{
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: marker.visitado ? visitedColor : pendingColor,
            fillOpacity: 1,
            strokeColor,
            strokeWeight: 3,
            scale: 9,
          }}
        />
      ))}

      {selected && (
        <InfoWindow position={{ lat: selected.lat, lng: selected.lng }} onCloseClick={() => setSelected(null)}>
          <div className="space-y-1 p-1 text-xs">
            <p className="font-semibold text-foreground">{selected.nombre}</p>
            <p className="text-muted-foreground">{selected.vendedorNombre}</p>
            <p>{selected.visitado ? 'Visitado hoy' : 'Pendiente de visita'}</p>
            {selected.diasSinComprar !== null && <p>{selected.diasSinComprar} días sin comprar</p>}
          </div>
        </InfoWindow>
      )}
    </GoogleMap>
  );
}
