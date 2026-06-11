import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { fetchAllPages } from '@/lib/supabasePaginate';
import { useAuth } from '@/contexts/AuthContext';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtNum, cn } from '@/lib/utils';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, TrendingDown, Skull, BarChart3, Package, ShoppingCart, Brain } from 'lucide-react';
import { ProductoLink } from '@/components/links/EntityLinks';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

type EnrichedProducto = {
  id: string;
  codigo: string;
  nombre: string;
  costo: number | null;
  precio_principal: number | null;
  stockTotal: number;
  dias_cobertura?: number | null;
  unidades?: { abreviatura?: string } | null;
};

type Section = 'quiebre' | 'reorden' | 'muertos' | 'abc';

const WINDOW_DAYS = 60;
const DEAD_DAYS = 90;
const DEFAULT_COBERTURA = 14; // días deseados de cobertura cuando el producto no tiene valor configurado

function useSalesVelocity() {
  const { empresa } = useAuth();
  return useQuery({
    queryKey: ['inventario-inteligencia-ventas', empresa?.id],
    enabled: !!empresa?.id,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const eid = empresa!.id;
      const sinceWindow = new Date();
      sinceWindow.setDate(sinceWindow.getDate() - Math.max(WINDOW_DAYS, DEAD_DAYS) - 1);
      const sinceIso = sinceWindow.toISOString().slice(0, 10);

      // Ventas (no canceladas) en la ventana mayor (90d para detectar muertos)
      const ventas = await fetchAllPages<{ id: string; fecha: string; status: string }>((from, to) =>
        supabase
          .from('ventas')
          .select('id, fecha, status')
          .eq('empresa_id', eid)
          .neq('status', 'cancelado')
          .gte('fecha', sinceIso)
          .range(from, to)
      );
      const ventaInfo: Record<string, string> = {};
      for (const v of ventas) ventaInfo[v.id] = v.fecha;

      if (ventas.length === 0) {
        return { unitsLast60: {} as Record<string, number>, lastSale: {} as Record<string, string> };
      }

      const ventaIds = Object.keys(ventaInfo);
      // Lineas en chunks
      const lineas: { venta_id: string; producto_id: string; cantidad: number }[] = [];
      const CHUNK = 200;
      for (let i = 0; i < ventaIds.length; i += CHUNK) {
        const slice = ventaIds.slice(i, i + CHUNK);
        const part = await fetchAllPages<any>((from, to) =>
          supabase
            .from('venta_lineas')
            .select('venta_id, producto_id, cantidad')
            .in('venta_id', slice)
            .range(from, to)
        );
        lineas.push(...part);
      }

      const sixtyAgo = new Date();
      sixtyAgo.setDate(sixtyAgo.getDate() - WINDOW_DAYS);
      const sixtyIso = sixtyAgo.toISOString().slice(0, 10);

      const unitsLast60: Record<string, number> = {};
      const lastSale: Record<string, string> = {};
      for (const l of lineas) {
        if (!l.producto_id) continue;
        const fecha = ventaInfo[l.venta_id];
        if (!fecha) continue;
        if (fecha >= sixtyIso) {
          unitsLast60[l.producto_id] = (unitsLast60[l.producto_id] ?? 0) + Number(l.cantidad ?? 0);
        }
        if (!lastSale[l.producto_id] || fecha > lastSale[l.producto_id]) {
          lastSale[l.producto_id] = fecha;
        }
      }

      return { unitsLast60, lastSale };
    },
  });
}

export default function InventarioInteligenciaTab({
  productos,
  search,
}: {
  productos: EnrichedProducto[];
  search: string;
}) {
  const { fmt } = useCurrency();
  const { data, isLoading } = useSalesVelocity();
  const [section, setSection] = useState<Section>('quiebre');

  const enriched = useMemo(() => {
    const unitsLast60 = data?.unitsLast60 ?? {};
    const lastSale = data?.lastSale ?? {};
    const todayIso = new Date().toISOString().slice(0, 10);

    const rows = productos.map(p => {
      const sold60 = unitsLast60[p.id] ?? 0;
      const avgDay = sold60 / WINDOW_DAYS;
      const stock = p.stockTotal ?? 0;
      const diasRestantes = avgDay > 0 ? stock / avgDay : null;
      const cobertura = p.dias_cobertura ?? DEFAULT_COBERTURA;
      const puntoReorden = avgDay * cobertura;
      const sugerencia = avgDay > 0 ? Math.max(0, Math.ceil(avgDay * cobertura * 2 - stock)) : 0;
      const last = lastSale[p.id] ?? null;
      const diasSinVenta = last
        ? Math.floor((Date.parse(todayIso) - Date.parse(last)) / 86400000)
        : null;
      const valorStock = stock * (p.costo ?? 0);
      const ventas60Valor = sold60 * (p.precio_principal ?? 0);
      return {
        ...p,
        sold60,
        avgDay,
        diasRestantes,
        cobertura,
        puntoReorden,
        sugerencia,
        last,
        diasSinVenta,
        valorStock,
        ventas60Valor,
      };
    });

    return rows;
  }, [productos, data]);

  const searched = useMemo(() => {
    if (!search) return enriched;
    const s = search.toLowerCase();
    return enriched.filter(p =>
      p.nombre.toLowerCase().includes(s) || p.codigo.toLowerCase().includes(s)
    );
  }, [enriched, search]);

  const quiebre = useMemo(
    () =>
      searched
        .filter(p => p.diasRestantes !== null && p.diasRestantes < 7 && p.avgDay > 0)
        .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0)),
    [searched]
  );

  const reorden = useMemo(
    () =>
      searched
        .filter(p => p.avgDay > 0 && p.stockTotal <= p.puntoReorden && (p.diasRestantes ?? 0) >= 7)
        .sort((a, b) => (a.diasRestantes ?? 0) - (b.diasRestantes ?? 0)),
    [searched]
  );

  const muertos = useMemo(
    () =>
      searched
        .filter(p => p.stockTotal > 0 && (p.diasSinVenta === null || p.diasSinVenta >= DEAD_DAYS))
        .sort((a, b) => b.valorStock - a.valorStock),
    [searched]
  );

  const abc = useMemo(() => {
    const withRevenue = searched
      .map(p => ({ ...p, revenue60: p.sold60 * (p.precio_principal ?? 0) }))
      .sort((a, b) => b.revenue60 - a.revenue60);
    const total = withRevenue.reduce((s, p) => s + p.revenue60, 0);
    let cum = 0;
    return withRevenue.map(p => {
      cum += p.revenue60;
      const pct = total > 0 ? cum / total : 0;
      let clase: 'A' | 'B' | 'C' = 'C';
      if (pct <= 0.8) clase = 'A';
      else if (pct <= 0.95) clase = 'B';
      return { ...p, clase, acumuladoPct: pct };
    });
  }, [searched]);

  const sections: { key: Section; label: string; icon: React.ElementType; count: number; color: string }[] = [
    { key: 'quiebre', label: 'Quiebre inminente', icon: AlertTriangle, count: quiebre.length, color: 'text-destructive' },
    { key: 'reorden', label: 'Punto de reorden', icon: TrendingDown, count: reorden.length, color: 'text-warning' },
    { key: 'muertos', label: 'Productos muertos', icon: Skull, count: muertos.length, color: 'text-muted-foreground' },
    { key: 'abc', label: 'Análisis ABC', icon: BarChart3, count: abc.filter(x => x.clase === 'A').length, color: 'text-primary' },
  ];

  return (
    <div className="space-y-4">
      {/* Header explicativo */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-4 flex gap-3 items-start">
        <Brain className="h-5 w-5 text-primary shrink-0 mt-0.5" />
        <div className="text-[12px] text-foreground">
          <p className="font-semibold mb-1">Inteligencia de inventario</p>
          <p className="text-muted-foreground">
            Calcula automáticamente la velocidad de venta de los últimos <b>{WINDOW_DAYS} días</b> para detectar
            quiebres, puntos de reorden y productos muertos. Cobertura por defecto:{' '}
            <b>{DEFAULT_COBERTURA} días</b> (ajustable por producto en su ficha).
          </p>
        </div>
      </div>

      {/* Cards resumen / navegación */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {sections.map(s => (
          <button
            key={s.key}
            onClick={() => setSection(s.key)}
            className={cn(
              'bg-card border rounded-lg p-4 text-left transition-colors',
              section === s.key ? 'border-primary ring-1 ring-primary/30' : 'border-border hover:border-primary/40'
            )}
          >
            <div className="flex items-center gap-2 mb-1">
              <s.icon className={cn('h-4 w-4', s.color)} />
              <span className="text-[11px] text-muted-foreground uppercase tracking-wide">{s.label}</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{s.count}</p>
            <p className="text-[11px] text-muted-foreground">
              {s.key === 'quiebre' && 'menos de 7 días de stock'}
              {s.key === 'reorden' && 'bajo punto de reorden'}
              {s.key === 'muertos' && `sin venta en ${DEAD_DAYS}+ días`}
              {s.key === 'abc' && `productos clase A (80% ventas)`}
            </p>
          </button>
        ))}
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Calculando inteligencia...</p>}

      {/* QUIEBRE */}
      {section === 'quiebre' && !isLoading && (
        <SectionTable
          empty="¡Excelente! Ningún producto en riesgo de quiebre en los próximos 7 días."
          rows={quiebre}
          headers={['Código', 'Producto', 'Stock', 'Venta/día', 'Días restantes', 'Sugerido comprar', '']}
          render={(p) => (
            <>
              <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
              <TableCell className="text-[12px] font-medium"><ProductoLink id={p.id}>{p.nombre}</ProductoLink></TableCell>
              <TableCell className="text-center text-[12px]">{fmtNum(p.stockTotal)}</TableCell>
              <TableCell className="text-center text-[12px]">{fmtNum(Math.round(p.avgDay * 10) / 10)}</TableCell>
              <TableCell className="text-center">
                <Badge variant="destructive" className="text-[11px]">
                  {p.diasRestantes !== null ? `${Math.floor(p.diasRestantes)} días` : '—'}
                </Badge>
              </TableCell>
              <TableCell className="text-center font-bold text-primary">{fmtNum(p.sugerencia)}</TableCell>
              <TableCell className="text-right">
                <ComprarButton productoId={p.id} cantidad={p.sugerencia} />
              </TableCell>
            </>
          )}
        />
      )}

      {/* REORDEN */}
      {section === 'reorden' && !isLoading && (
        <SectionTable
          empty="Ningún producto bajo su punto de reorden."
          rows={reorden}
          headers={['Código', 'Producto', 'Stock', 'Punto reorden', 'Días restantes', 'Sugerido comprar', '']}
          render={(p) => (
            <>
              <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
              <TableCell className="text-[12px] font-medium"><ProductoLink id={p.id}>{p.nombre}</ProductoLink></TableCell>
              <TableCell className="text-center text-[12px]">{fmtNum(p.stockTotal)}</TableCell>
              <TableCell className="text-center text-[12px] text-muted-foreground">{fmtNum(Math.round(p.puntoReorden))}</TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary" className="text-[11px] bg-warning/10 text-warning border-warning/20">
                  {p.diasRestantes !== null ? `${Math.floor(p.diasRestantes)} días` : '—'}
                </Badge>
              </TableCell>
              <TableCell className="text-center font-bold text-primary">{fmtNum(p.sugerencia)}</TableCell>
              <TableCell className="text-right">
                <ComprarButton productoId={p.id} cantidad={p.sugerencia} />
              </TableCell>
            </>
          )}
        />
      )}

      {/* MUERTOS */}
      {section === 'muertos' && !isLoading && (
        <SectionTable
          empty="Sin productos muertos. ¡Todo tu catálogo está rotando!"
          rows={muertos}
          headers={['Código', 'Producto', 'Stock', 'Última venta', 'Días sin venta', 'Capital atorado']}
          render={(p) => (
            <>
              <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
              <TableCell className="text-[12px] font-medium"><ProductoLink id={p.id}>{p.nombre}</ProductoLink></TableCell>
              <TableCell className="text-center text-[12px]">{fmtNum(p.stockTotal)}</TableCell>
              <TableCell className="text-center text-[12px] text-muted-foreground">
                {p.last ? p.last.split('-').reverse().join('/') : 'Nunca'}
              </TableCell>
              <TableCell className="text-center">
                <Badge variant="secondary" className="text-[11px]">
                  {p.diasSinVenta !== null ? `${p.diasSinVenta} d` : '+90 d'}
                </Badge>
              </TableCell>
              <TableCell className="text-right text-[12px] font-semibold text-destructive">{fmt(p.valorStock)}</TableCell>
            </>
          )}
        />
      )}

      {/* ABC */}
      {section === 'abc' && !isLoading && (
        <SectionTable
          empty="Sin ventas en la ventana para calcular ABC."
          rows={abc}
          headers={['Clase', 'Código', 'Producto', 'Vendido 60d', 'Ingresos 60d', '% acumulado']}
          render={(p) => (
            <>
              <TableCell>
                <Badge
                  className={cn(
                    'text-[11px] font-bold',
                    p.clase === 'A' && 'bg-success/15 text-success border-success/30',
                    p.clase === 'B' && 'bg-warning/15 text-warning border-warning/30',
                    p.clase === 'C' && 'bg-muted text-muted-foreground border-border'
                  )}
                  variant="outline"
                >
                  {p.clase}
                </Badge>
              </TableCell>
              <TableCell className="font-mono text-[11px] text-muted-foreground">{p.codigo}</TableCell>
              <TableCell className="text-[12px] font-medium"><ProductoLink id={p.id}>{p.nombre}</ProductoLink></TableCell>
              <TableCell className="text-center text-[12px]">{fmtNum(p.sold60)}</TableCell>
              <TableCell className="text-right text-[12px]">{fmt(p.revenue60)}</TableCell>
              <TableCell className="text-right text-[12px] text-muted-foreground">
                {Math.round(p.acumuladoPct * 100)}%
              </TableCell>
            </>
          )}
        />
      )}
    </div>
  );
}

function SectionTable<T extends { id: string }>({
  rows,
  headers,
  render,
  empty,
}: {
  rows: T[];
  headers: string[];
  render: (row: T) => React.ReactNode;
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="bg-card border border-border rounded-lg py-12 text-center text-muted-foreground">
        <Package className="h-10 w-10 mx-auto mb-2 opacity-30" />
        <p className="text-sm">{empty}</p>
      </div>
    );
  }
  return (
    <div className="bg-card border border-border rounded overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {headers.map((h, i) => (
              <TableHead
                key={i}
                className={cn(
                  'text-[11px]',
                  i === 0 || i === 1 ? '' : i === headers.length - 1 ? 'text-right' : 'text-center'
                )}
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map(r => (
            <TableRow key={r.id}>{render(r)}</TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ComprarButton({ productoId, cantidad }: { productoId: string; cantidad: number }) {
  if (cantidad <= 0) return null;
  return (
    <Link to={`/compras/nuevo?producto=${productoId}&cantidad=${cantidad}`}>
      <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1">
        <ShoppingCart className="h-3 w-3" /> Comprar
      </Button>
    </Link>
  );
}
