import { useState } from 'react';
import { useCurrency } from '@/hooks/useCurrency';
import { ChevronDown, ChevronRight, Search } from 'lucide-react';
import { ColumnChooser, useColumnVisibility, type ColumnDef } from './ColumnChooser';

interface VentaLinea {
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  subtotal: number;
  productos: { codigo?: string; nombre?: string } | null;
  venta_id: string;
  ventas: {
    empresa_id: string;
    fecha: string;
    status: string;
    cliente_id: string;
    vendedor_id: string;
    clientes: { nombre?: string } | null;
    vendedores: { nombre?: string } | null;
  };
}

interface ClienteProducto {
  productoId: string;
  codigo: string;
  nombre: string;
  cantidad: number;
  total: number;
}

interface ClienteGroup {
  clienteId: string;
  clienteNombre: string;
  vendedor: string;
  productos: ClienteProducto[];
  totalGeneral: number;
  cantidadTotal: number;
}

const INNER_COLUMNS: ColumnDef[] = [
  { key: 'codigo', label: 'Código' },
  { key: 'producto', label: 'Producto' },
  { key: 'cantidad', label: 'Uds' },
  { key: 'total', label: 'Total' },
  { key: 'pct', label: '% Participación' },
];

export function ReporteProductoCliente({ data }: { data: any }) {
  const { fmt } = useCurrency();
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const { visible, setVisible, isVisible } = useColumnVisibility(INNER_COLUMNS);

  const ventaLineas: VentaLinea[] = data.ventaLineas ?? [];

  const clienteMap: Record<string, ClienteGroup> = {};
  for (const l of ventaLineas) {
    const cid = l.ventas?.cliente_id ?? 'sin-cliente';
    const cname = (l.ventas?.clientes as any)?.nombre ?? 'Sin cliente';
    const vname = (l.ventas?.vendedores as any)?.nombre ?? '—';
    if (!clienteMap[cid]) {
      clienteMap[cid] = { clienteId: cid, clienteNombre: cname, vendedor: vname, productos: [], totalGeneral: 0, cantidadTotal: 0 };
    }
    const pid = l.producto_id ?? '';
    let prod = clienteMap[cid].productos.find(p => p.productoId === pid);
    if (!prod) {
      prod = { productoId: pid, codigo: (l.productos as any)?.codigo ?? '', nombre: (l.productos as any)?.nombre ?? '', cantidad: 0, total: 0 };
      clienteMap[cid].productos.push(prod);
    }
    prod.cantidad += l.cantidad ?? 0;
    prod.total += l.total ?? 0;
    clienteMap[cid].totalGeneral += l.total ?? 0;
    clienteMap[cid].cantidadTotal += l.cantidad ?? 0;
  }

  let clientes = Object.values(clienteMap).sort((a, b) => b.totalGeneral - a.totalGeneral);
  for (const c of clientes) c.productos.sort((a, b) => b.total - a.total);

  if (search) {
    const q = search.toLowerCase();
    clientes = clientes.filter(c =>
      c.clienteNombre.toLowerCase().includes(q) ||
      c.vendedor.toLowerCase().includes(q) ||
      c.productos.some(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q))
    );
  }

  const toggleClient = (id: string) => {
    setCollapsed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const grandTotal = clientes.reduce((s, c) => s + c.totalGeneral, 0);
  const grandQty = clientes.reduce((s, c) => s + c.cantidadTotal, 0);

  const innerColCount = INNER_COLUMNS.filter(c => visible.has(c.key)).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="grid grid-cols-3 gap-3 flex-1">
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Clientes</div>
            <div className="text-lg font-bold text-foreground">{clientes.length}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Unidades</div>
            <div className="text-lg font-bold text-foreground">{grandQty.toLocaleString()}</div>
          </div>
          <div className="bg-card border border-border rounded-lg p-3 text-center">
            <div className="text-[9px] text-muted-foreground uppercase font-semibold">Venta total</div>
            <div className="text-lg font-bold text-foreground">{fmt(grandTotal)}</div>
          </div>
        </div>
        <ColumnChooser columns={INNER_COLUMNS} visible={visible} onChange={setVisible} />
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar cliente o producto..."
          className="input-odoo pl-8 text-[12px]"
        />
      </div>

      {clientes.length === 0 && (
        <div className="text-center py-8 text-muted-foreground text-[12px]">Sin datos</div>
      )}

      <div className="space-y-2">
        {clientes.map(c => (
          <div key={c.clienteId} className="bg-card border border-border rounded-lg overflow-hidden">
            <button
              onClick={() => toggleClient(c.clienteId)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/30 transition-colors"
            >
              {collapsed.has(c.clienteId)
                ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              }
              <span className="text-[12px] font-semibold text-foreground">{c.clienteNombre}</span>
              <span className="text-[10px] text-muted-foreground">({c.productos.length} productos)</span>
              <span className="text-[10px] text-muted-foreground ml-1">• {c.vendedor}</span>
              <span className="ml-auto text-[12px] font-bold text-foreground">{fmt(c.totalGeneral)}</span>
            </button>

            {!collapsed.has(c.clienteId) && (
              <div className="border-t border-border">
                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9px] text-muted-foreground uppercase border-b border-border/50">
                      {isVisible('codigo') && <th className="py-1.5 px-3 text-left">Código</th>}
                      {isVisible('producto') && <th className="py-1.5 px-3 text-left">Producto</th>}
                      {isVisible('cantidad') && <th className="py-1.5 px-3 text-right">Uds</th>}
                      {isVisible('total') && <th className="py-1.5 px-3 text-right">Total</th>}
                      {isVisible('pct') && <th className="py-1.5 px-3 text-right w-16">%</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {c.productos.map(p => (
                      <tr key={p.productoId} className="border-b border-border/30">
                        {isVisible('codigo') && <td className="py-1 px-3 font-mono text-muted-foreground">{p.codigo}</td>}
                        {isVisible('producto') && <td className="py-1 px-3 font-medium">{p.nombre}</td>}
                        {isVisible('cantidad') && <td className="py-1 px-3 text-right">{p.cantidad}</td>}
                        {isVisible('total') && <td className="py-1 px-3 text-right font-semibold">{fmt(p.total)}</td>}
                        {isVisible('pct') && <td className="py-1 px-3 text-right text-muted-foreground">{c.totalGeneral > 0 ? ((p.total / c.totalGeneral) * 100).toFixed(1) : 0}%</td>}
                      </tr>
                    ))}
                    <tr className="border-t border-border">
                      {isVisible('codigo') && <td className="py-1.5 px-3"></td>}
                      {isVisible('producto') && <td className="py-1.5 px-3 font-bold text-[11px] text-muted-foreground">Total</td>}
                      {isVisible('cantidad') && <td className="py-1.5 px-3 text-right font-bold">{c.cantidadTotal}</td>}
                      {isVisible('total') && <td className="py-1.5 px-3 text-right font-bold">{fmt(c.totalGeneral)}</td>}
                      {isVisible('pct') && <td></td>}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
