import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { useAlmacenes } from '@/hooks/useData';
import { useProductoAlmacenConfig, useGuardarProductoAlmacenConfig } from '@/hooks/useProductoAlmacenConfig';

/** Mínimos y máximos por almacén de un producto (base del resurtido sugerido). */
export function MinMaxAlmacenTab({ productoId, isNew }: { productoId?: string; isNew: boolean }) {
  const { data: almacenes = [] } = useAlmacenes();
  const { data: config = [] } = useProductoAlmacenConfig(undefined, productoId);
  const guardar = useGuardarProductoAlmacenConfig();
  const [valores, setValores] = useState<Record<string, { min: number; max: number }>>({});

  const inicial = useMemo(() => {
    const map: Record<string, { min: number; max: number }> = {};
    for (const a of almacenes) map[a.id] = { min: 0, max: 0 };
    for (const c of config) map[c.almacen_id] = { min: Number(c.stock_minimo) || 0, max: Number(c.stock_maximo) || 0 };
    return map;
  }, [almacenes, config]);

  useEffect(() => { setValores(inicial); }, [inicial]);

  if (isNew || !productoId) {
    return <p className="text-[12px] text-muted-foreground py-4">Guarda el producto para configurar mínimos y máximos por almacén.</p>;
  }

  const set = (almacenId: string, campo: 'min' | 'max', valor: number) =>
    setValores(prev => ({ ...prev, [almacenId]: { ...(prev[almacenId] ?? { min: 0, max: 0 }), [campo]: Math.max(0, valor || 0) } }));

  const onGuardar = async () => {
    const rows = Object.entries(valores).map(([almacen_id, v]) => ({
      producto_id: productoId, almacen_id, stock_minimo: v.min, stock_maximo: v.max,
    }));
    if (rows.some(r => r.stock_maximo > 0 && r.stock_maximo < r.stock_minimo)) {
      toast.error('El máximo no puede ser menor que el mínimo');
      return;
    }
    await guardar.mutateAsync(rows);
    toast.success('Mínimos y máximos guardados');
  };

  return (
    <div className="space-y-2">
      <p className="text-[12px] text-muted-foreground">
        Cuando el stock del almacén llegue al mínimo, el producto aparece como sugerido para resurtido
        (se pide hasta llegar al máximo).
      </p>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="text-left text-muted-foreground border-b border-border">
            <th className="py-1.5">Almacén</th>
            <th className="py-1.5 text-right">Mínimo</th>
            <th className="py-1.5 text-right">Máximo</th>
          </tr>
        </thead>
        <tbody>
          {almacenes.map(a => (
            <tr key={a.id} className="border-b border-border">
              <td className="py-1.5">{a.nombre}</td>
              <td className="py-1.5 text-right">
                <input type="number" min={0} step="0.001" className="input-odoo text-right !py-0.5 w-24"
                  value={valores[a.id]?.min ?? 0} onChange={e => set(a.id, 'min', Number(e.target.value))} />
              </td>
              <td className="py-1.5 text-right">
                <input type="number" min={0} step="0.001" className="input-odoo text-right !py-0.5 w-24"
                  value={valores[a.id]?.max ?? 0} onChange={e => set(a.id, 'max', Number(e.target.value))} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={onGuardar} disabled={guardar.isPending} className="btn-odoo-primary flex items-center gap-1.5">
        <Save className="h-3.5 w-3.5" /> Guardar mínimos y máximos
      </button>
    </div>
  );
}
