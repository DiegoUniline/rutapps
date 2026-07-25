import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useCurrency } from '@/hooks/useCurrency';
import { fmtDate } from '@/lib/utils';
import { Wallet } from 'lucide-react';

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', cheque: 'Cheque', deposito: 'Depósito',
};

/** Gastos/egresos ligados a esta venta (p.ej. reembolsos de devolución). */
export function VentaGastosTab({ ventaId }: { ventaId: string }) {
  const { fmt } = useCurrency();
  const { data: gastos = [], isLoading } = useQuery({
    queryKey: ['venta-gastos', ventaId],
    enabled: !!ventaId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('gastos')
        .select('id, fecha, concepto, monto, metodo_pago, notas')
        .eq('venta_id', ventaId)
        .order('fecha', { ascending: false });
      return data ?? [];
    },
  });

  const total = (gastos as any[]).reduce((s, g) => s + (Number(g.monto) || 0), 0);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Cargando…</div>;

  if ((gastos as any[]).length === 0) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <Wallet className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
        No hay gastos/egresos ligados a esta venta.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="text-xs">
        <span className="bg-destructive/10 text-destructive px-2 py-1 rounded font-medium">Total egresos: {fmt(total)}</span>
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
            <th className="text-left py-2 font-medium">Fecha</th>
            <th className="text-left py-2 font-medium">Concepto</th>
            <th className="text-left py-2 font-medium">Método</th>
            <th className="text-right py-2 font-medium">Monto</th>
          </tr>
        </thead>
        <tbody>
          {(gastos as any[]).map(g => (
            <tr key={g.id} className="border-b border-border/50">
              <td className="py-2 whitespace-nowrap">{fmtDate(g.fecha)}</td>
              <td className="py-2">{g.concepto}</td>
              <td className="py-2 text-muted-foreground">{METODO_LABELS[g.metodo_pago] ?? g.metodo_pago ?? '—'}</td>
              <td className="py-2 text-right font-semibold text-destructive">{fmt(Number(g.monto) || 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
