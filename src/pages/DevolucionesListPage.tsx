import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';
import { RotateCcw } from 'lucide-react';
import { OdooFilterBar } from '@/components/OdooFilterBar';
import { OdooPagination } from '@/components/OdooPagination';
import { useNavigate } from 'react-router-dom';
import { useCurrency } from '@/hooks/useCurrency';
const MOTIVO_LABELS: Record<string, string> = { no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro' };
const ACCION_LABELS: Record<string, string> = { reposicion: 'Reposición', nota_credito: 'Nota crédito', descuento_venta: 'Desc. venta', devolucion_dinero: 'Dev. dinero' };

export default function DevolucionesListPage() {
  const { fmt } = useCurrency();
  const { empresa } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['devoluciones-list', empresa?.id, search, page],
    enabled: !!empresa?.id,
    queryFn: async () => {
      let q = (supabase as any)
        .from('devoluciones')
        .select('id, fecha, tipo, notas, venta_id, vendedor_id, cliente_id, clientes(nombre), vendedores(nombre), ventas(folio), devolucion_lineas(producto_id, cantidad, motivo, accion, monto_credito, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))', { count: 'exact' })
        .eq('empresa_id', empresa!.id)
        .order('fecha', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (search) {
        q = q.or(`clientes.nombre.ilike.%${search}%,ventas.folio.ilike.%${search}%`);
      }

      const { data, count } = await q;
      return { rows: data ?? [], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="p-4 space-y-4 max-w-[1200px]">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
          <RotateCcw className="h-5 w-5" /> Devoluciones
        </h1>
      </div>

      <OdooFilterBar search={search} onSearchChange={val => { setSearch(val); setPage(1); }} placeholder="Buscar por cliente o folio..." />

      <div className="bg-card border border-border rounded-md overflow-hidden">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] text-muted-foreground uppercase border-b border-border bg-muted/30">
              <th className="text-left py-2.5 px-3 font-medium">Fecha</th>
              <th className="text-left py-2.5 px-3 font-medium">Cliente</th>
              <th className="text-left py-2.5 px-3 font-medium">Vendedor</th>
              <th className="text-left py-2.5 px-3 font-medium">Venta</th>
              <th className="text-left py-2.5 px-3 font-medium">Productos</th>
              <th className="text-right py-2.5 px-3 font-medium">Uds.</th>
              <th className="text-left py-2.5 px-3 font-medium">Motivo</th>
              <th className="text-left py-2.5 px-3 font-medium">Acción</th>
              <th className="text-right py-2.5 px-3 font-medium">Crédito</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">Cargando...</td></tr>
            )}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-muted-foreground">No hay devoluciones registradas</td></tr>
            )}
            {rows.map((d: any) => {
              const lineas = d.devolucion_lineas ?? [];
              const totalUds = lineas.reduce((s: number, l: any) => s + (Number(l.cantidad) || 0), 0);
              const totalCredito = lineas.reduce((s: number, l: any) => s + (Number(l.monto_credito) || 0), 0);
              const motivos = [...new Set(lineas.map((l: any) => l.motivo))];
              const acciones = [...new Set(lineas.map((l: any) => l.accion))];
              const productosText = lineas.map((l: any) => `${l.productos?.nombre ?? '?'} (${l.cantidad})`).join(', ');

              return (
                <tr key={d.id} className="border-b border-border/50 hover:bg-muted/20 cursor-pointer" onClick={() => d.venta_id && navigate(`/ventas/${d.venta_id}`)}>
                  <td className="py-2 px-3 font-mono text-muted-foreground">{d.fecha}</td>
                  <td className="py-2 px-3 font-medium">{d.clientes?.nombre ?? '—'}</td>
                  <td className="py-2 px-3 text-muted-foreground">{d.vendedores?.nombre ?? '—'}</td>
                  <td className="py-2 px-3">
                    {d.ventas?.folio ? (
                      <span className="text-primary font-mono text-[11px] font-semibold">{d.ventas.folio}</span>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="py-2 px-3 max-w-[200px] truncate text-muted-foreground" title={productosText}>{productosText || '—'}</td>
                  <td className="py-2 px-3 text-right font-semibold">{totalUds}</td>
                  <td className="py-2 px-3">
                    {motivos.map((m: string) => (
                      <span key={m} className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-foreground font-medium capitalize mr-1">
                        {MOTIVO_LABELS[m] ?? m.replace(/_/g, ' ')}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 px-3">
                    {acciones.map((a: string) => (
                      <span key={a} className="text-[9px] px-1.5 py-0.5 rounded-full bg-accent text-foreground font-medium mr-1">
                        {ACCION_LABELS[a] ?? a}
                      </span>
                    ))}
                  </td>
                  <td className="py-2 px-3 text-right font-semibold">
                    {totalCredito > 0 ? <span className="text-destructive">${fmt(totalCredito)}</span> : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {total > pageSize && (
        <OdooPagination
          from={(page - 1) * pageSize + 1}
          to={Math.min(page * pageSize, total)}
          total={total}
          onPrev={() => setPage(p => Math.max(1, p - 1))}
          onNext={() => setPage(p => p + 1)}
        />
      )}
    </div>
  );
}
