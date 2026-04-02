import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { UserCheck, UserX } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface Props {
  desde: string;
  hasta: string;
  vendedorIds?: string[];
}

interface ClienteReporte {
  id: string;
  codigo: string | null;
  nombre: string;
  vendedor: string;
  vendedor_id: string | null;
  dia_visita: string[];
  telefono: string | null;
  direccion: string | null;
  visitado: boolean;
  ultima_visita: string | null;
}

export function ReporteClientesNoVisitados({ desde, hasta, vendedorIds }: Props) {
  const { empresa } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['reporte-no-visitados', empresa?.id, desde, hasta, vendedorIds],
    enabled: !!empresa?.id,
    staleTime: 2 * 60 * 1000,
    queryFn: async () => {
      const eid = empresa!.id;

      // 1) Get all active clients
      let clientesQ = supabase
        .from('clientes')
        .select('id, codigo, nombre, vendedor_id, dia_visita, telefono, direccion, vendedores(nombre)')
        .eq('empresa_id', eid)
        .eq('status', 'activo');
      if (vendedorIds && vendedorIds.length > 0) {
        clientesQ = clientesQ.in('vendedor_id', vendedorIds);
      }
      const { data: clientes, error: cErr } = await clientesQ;
      if (cErr) throw cErr;

      // 2) Get sales in the period with date for last visit
      const { data: ventasClientes, error: vErr } = await supabase
        .from('ventas')
        .select('cliente_id, fecha')
        .eq('empresa_id', eid)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .not('status', 'eq', 'cancelado');
      if (vErr) throw vErr;

      // Build map: cliente_id -> last visit date in period
      const visitMap = new Map<string, string>();
      for (const v of ventasClientes ?? []) {
        if (!v.cliente_id) continue;
        const existing = visitMap.get(v.cliente_id);
        if (!existing || v.fecha > existing) visitMap.set(v.cliente_id, v.fecha);
      }

      // 3) For non-visited clients, get their last visit ever
      const clienteIds = (clientes ?? []).map(c => c.id);
      const noVisitadoIds = clienteIds.filter(id => !visitMap.has(id));
      
      const lastVisitMap = new Map<string, string>();
      if (noVisitadoIds.length > 0) {
        // Batch query: get most recent sale per unvisited client
        const batchSize = 200;
        for (let i = 0; i < noVisitadoIds.length; i += batchSize) {
          const batch = noVisitadoIds.slice(i, i + batchSize);
          const { data: lastSales } = await supabase
            .from('ventas')
            .select('cliente_id, fecha')
            .eq('empresa_id', eid)
            .in('cliente_id', batch)
            .not('status', 'eq', 'cancelado')
            .order('fecha', { ascending: false });
          for (const s of lastSales ?? []) {
            if (!s.cliente_id) continue;
            if (!lastVisitMap.has(s.cliente_id)) lastVisitMap.set(s.cliente_id, s.fecha);
          }
        }
      }

      // 4) Build full list
      const todos: ClienteReporte[] = (clientes ?? []).map(c => {
        const visitado = visitMap.has(c.id);
        const ultimaVisita = visitado
          ? (visitMap.get(c.id) ?? null)
          : (lastVisitMap.get(c.id) ?? null);
        return {
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          vendedor: (c.vendedores as any)?.nombre ?? 'Sin asignar',
          vendedor_id: c.vendedor_id,
          dia_visita: (c.dia_visita ?? []) as string[],
          telefono: c.telefono,
          direccion: c.direccion,
          visitado,
          ultima_visita: ultimaVisita,
        };
      });

      // Group by vendedor
      const porVendedor: Record<string, ClienteReporte[]> = {};
      for (const c of todos) {
        const key = c.vendedor;
        if (!porVendedor[key]) porVendedor[key] = [];
        porVendedor[key].push(c);
      }

      const grupos = Object.entries(porVendedor)
        .map(([vendedor, items]) => {
          const noVisitados = items.filter(i => !i.visitado).length;
          // Sort: non-visited first, then by name
          items.sort((a, b) => {
            if (a.visitado !== b.visitado) return a.visitado ? 1 : -1;
            return a.nombre.localeCompare(b.nombre);
          });
          return { vendedor, items, total: items.length, noVisitados };
        })
        .sort((a, b) => b.noVisitados - a.noVisitados);

      const totalNoVisitados = todos.filter(c => !c.visitado).length;

      return {
        totalClientes: todos.length,
        totalVisitados: todos.length - totalNoVisitados,
        totalNoVisitados,
        pctNoVisitados: todos.length > 0 ? (totalNoVisitados / todos.length) * 100 : 0,
        grupos,
      };
    },
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-[13px]">Cargando...</div>;
  if (!data) return null;

  const diasLabel: Record<string, string> = {
    lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
    viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
  };

  const formatFecha = (f: string | null) => {
    if (!f) return '—';
    try { return format(new Date(f + 'T12:00:00'), 'dd MMM yyyy', { locale: es }); }
    catch { return f; }
  };

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Total clientes</div>
          <div className="text-lg font-bold text-foreground">{data.totalClientes}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">Visitados</div>
          <div className="text-lg font-bold text-green-600">{data.totalVisitados}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">No visitados</div>
          <div className="text-lg font-bold text-destructive">{data.totalNoVisitados}</div>
        </div>
        <div className="bg-card border border-border rounded-lg p-3 text-center">
          <div className="text-[9px] text-muted-foreground uppercase font-semibold">% Sin visita</div>
          <div className="text-lg font-bold text-foreground">{data.pctNoVisitados.toFixed(1)}%</div>
        </div>
      </div>

      {/* Grouped by vendedor */}
      {data.grupos.map(g => (
        <div key={g.vendedor} className="bg-card border border-border rounded-lg overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/30 border-b border-border">
            <div className="flex items-center gap-2">
              <UserX className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[12px] font-semibold text-foreground">{g.vendedor}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
              <span className="text-green-600 font-medium">{g.total - g.noVisitados} visitados</span>
              <span className="text-destructive font-medium">{g.noVisitados} sin visita</span>
              <span>{g.total} total</span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2 px-3 w-8">#</th>
                  <th className="text-center py-2 px-3 w-16">Estado</th>
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Última visita</th>
                  <th className="text-right py-2 px-3">Días sin visita</th>
                  <th className="text-left py-2 px-3">Días visita</th>
                  <th className="text-left py-2 px-3">Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((c, i) => {
                  const diasSinVisita = c.ultima_visita
                    ? Math.floor((Date.now() - new Date(c.ultima_visita + 'T12:00:00').getTime()) / 86400000)
                    : null;
                  return (
                  <tr key={c.id} className={`border-b border-border/50 ${c.visitado ? 'bg-green-50/40 dark:bg-green-950/10' : ''}`}>
                    <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 px-3 text-center">
                      {c.visitado ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-green-700 dark:text-green-400">
                          <UserCheck className="h-3 w-3" /> Sí
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-medium text-destructive">
                          <UserX className="h-3 w-3" /> No
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 px-3 text-muted-foreground">{c.codigo ?? '—'}</td>
                    <td className="py-1.5 px-3 font-medium text-foreground">{c.nombre}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{formatFecha(c.ultima_visita)}</td>
                    <td className="py-1.5 px-3 text-right">
                      {diasSinVisita !== null ? (
                        <span className={`font-medium ${diasSinVisita > 30 ? 'text-destructive' : diasSinVisita > 14 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                          {diasSinVisita} días
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-destructive italic">Nunca visitado</span>
                      )}
                    </td>
                    <td className="py-1.5 px-3">
                      {c.dia_visita.length > 0
                        ? c.dia_visita.map(d => diasLabel[d] ?? d).join(', ')
                        : <span className="text-muted-foreground">—</span>
                      }
                    </td>
                    <td className="py-1.5 px-3 text-muted-foreground">{c.telefono ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
                )}

      {data.totalClientes === 0 && (
        <div className="py-8 text-center text-muted-foreground text-[13px]">
          No hay clientes activos para mostrar
        </div>
      )}
    </div>
  );
}
