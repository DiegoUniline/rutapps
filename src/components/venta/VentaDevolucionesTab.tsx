import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { RotateCcw } from 'lucide-react';

const MOTIVO_LABELS: Record<string, string> = {
  no_vendido: 'No vendido', dañado: 'Dañado', caducado: 'Caducado', error_pedido: 'Error pedido', otro: 'Otro',
};
const ACCION_LABELS: Record<string, string> = {
  reposicion: 'Reposición', nota_credito: 'Nota crédito', descuento_venta: 'Desc. venta', devolucion_dinero: 'Dev. dinero',
};

const fmt = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

interface Props { ventaId: string; }

export function VentaDevolucionesTab({ ventaId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['venta-devoluciones', ventaId],
    enabled: !!ventaId,
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from('devoluciones')
        .select('id, fecha, tipo, notas, clientes(nombre), devolucion_lineas(producto_id, cantidad, motivo, accion, monto_credito, reemplazo_producto_id, productos!devolucion_lineas_producto_id_fkey(codigo, nombre))')
        .eq('venta_id', ventaId);
      return data ?? [];
    },
  });

  const lineas = (data ?? []).flatMap((d: any) =>
    (d.devolucion_lineas ?? []).map((l: any) => ({
      codigo: l.productos?.codigo ?? '',
      nombre: l.productos?.nombre ?? '',
      cantidad: Number(l.cantidad) ?? 0,
      motivo: l.motivo ?? '',
      accion: l.accion ?? 'reposicion',
      monto_credito: Number(l.monto_credito) ?? 0,
      cliente: d.clientes?.nombre ?? '—',
    }))
  );

  const totalUnidades = lineas.reduce((s, l) => s + l.cantidad, 0);
  const totalCredito = lineas.reduce((s, l) => s + l.monto_credito, 0);

  if (isLoading) return <div className="p-4 text-sm text-muted-foreground">Cargando...</div>;

  if (!lineas.length) {
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        <RotateCcw className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
        No hay devoluciones registradas para esta venta.
      </div>
    );
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-3 text-xs">
        <span className="bg-card border border-border px-2 py-1 rounded font-medium">{totalUnidades} unidades devueltas</span>
        {totalCredito > 0 && (
          <span className="bg-destructive/10 text-destructive px-2 py-1 rounded font-medium">Crédito: ${fmt(totalCredito)}</span>
        )}
      </div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-[10px] text-muted-foreground uppercase border-b border-border">
            <th className="text-left py-2 font-medium">#</th>
            <th className="text-left py-2 font-medium">Producto</th>
            <th className="text-right py-2 font-medium">Cant.</th>
            <th className="text-left py-2 font-medium">Motivo</th>
            <th className="text-left py-2 font-medium">Acción</th>
            <th className="text-right py-2 font-medium">Crédito</th>
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">{i + 1}</td>
              <td className="py-2">
                <span className="font-mono text-muted-foreground text-[10px]">{l.codigo}</span>
                {l.codigo && ' · '}{l.nombre}
              </td>
              <td className="py-2 text-right font-semibold">{l.cantidad}</td>
              <td className="py-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-card border border-border text-foreground font-medium capitalize">
                  {MOTIVO_LABELS[l.motivo] ?? l.motivo.replace(/_/g, ' ')}
                </span>
              </td>
              <td className="py-2">
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-accent text-foreground font-medium">
                  {ACCION_LABELS[l.accion] ?? l.accion}
                </span>
              </td>
              <td className="py-2 text-right font-semibold">
                {l.monto_credito > 0 ? <span className="text-destructive">${fmt(l.monto_credito)}</span> : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        {totalCredito > 0 && (
          <tfoot>
            <tr className="border-t border-border font-bold text-[11px]">
              <td colSpan={5} className="py-2 text-right text-muted-foreground">Total crédito:</td>
              <td className="py-2 text-right text-destructive">${fmt(totalCredito)}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
