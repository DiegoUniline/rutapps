import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { UserX } from 'lucide-react';

interface Props {
  desde: string;
  hasta: string;
  vendedorIds?: string[];
}

interface ClienteNoVisitado {
  id: string;
  codigo: string | null;
  nombre: string;
  vendedor: string;
  vendedor_id: string | null;
  dia_visita: string[];
  telefono: string | null;
  direccion: string | null;
  ultimo_contacto: string | null;
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

      // 2) Get distinct client_ids that had sales in the period
      const { data: ventasClientes, error: vErr } = await supabase
        .from('ventas')
        .select('cliente_id')
        .eq('empresa_id', eid)
        .gte('fecha', desde)
        .lte('fecha', hasta)
        .not('status', 'eq', 'cancelado');
      if (vErr) throw vErr;

      const visitedSet = new Set((ventasClientes ?? []).map(v => v.cliente_id));

      // 3) Filter out visited clients
      const noVisitados: ClienteNoVisitado[] = (clientes ?? [])
        .filter(c => !visitedSet.has(c.id))
        .map(c => ({
          id: c.id,
          codigo: c.codigo,
          nombre: c.nombre,
          vendedor: (c.vendedores as any)?.nombre ?? 'Sin asignar',
          vendedor_id: c.vendedor_id,
          dia_visita: (c.dia_visita ?? []) as string[],
          telefono: c.telefono,
          direccion: c.direccion,
          ultimo_contacto: null,
        }));

      // Group by vendedor
      const porVendedor: Record<string, ClienteNoVisitado[]> = {};
      for (const c of noVisitados) {
        const key = c.vendedor;
        if (!porVendedor[key]) porVendedor[key] = [];
        porVendedor[key].push(c);
      }

      const grupos = Object.entries(porVendedor)
        .map(([vendedor, items]) => ({ vendedor, items, count: items.length }))
        .sort((a, b) => b.count - a.count);

      return {
        totalClientes: (clientes ?? []).length,
        totalVisitados: visitedSet.size,
        totalNoVisitados: noVisitados.length,
        pctNoVisitados: (clientes ?? []).length > 0
          ? ((noVisitados.length / (clientes ?? []).length) * 100)
          : 0,
        grupos,
        noVisitados,
      };
    },
  });

  if (isLoading) return <div className="py-8 text-center text-muted-foreground text-[13px]">Cargando...</div>;
  if (!data) return null;

  const diasLabel: Record<string, string> = {
    lunes: 'Lun', martes: 'Mar', miercoles: 'Mié', jueves: 'Jue',
    viernes: 'Vie', sabado: 'Sáb', domingo: 'Dom',
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
            <span className="text-[11px] text-muted-foreground">{g.count} cliente{g.count !== 1 ? 's' : ''}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-[9px] text-muted-foreground uppercase border-b border-border">
                  <th className="text-left py-2 px-3 w-8">#</th>
                  <th className="text-left py-2 px-3">Código</th>
                  <th className="text-left py-2 px-3">Cliente</th>
                  <th className="text-left py-2 px-3">Días visita</th>
                  <th className="text-left py-2 px-3">Teléfono</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((c, i) => (
                  <tr key={c.id} className="border-b border-border/50">
                    <td className="py-1.5 px-3 font-semibold text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 px-3 text-muted-foreground">{c.codigo ?? '—'}</td>
                    <td className="py-1.5 px-3 font-medium text-foreground">{c.nombre}</td>
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
      ))}

      {data.totalNoVisitados === 0 && (
        <div className="py-8 text-center text-muted-foreground text-[13px]">
          🎉 Todos los clientes fueron visitados en este período
        </div>
      )}
    </div>
  );
}
