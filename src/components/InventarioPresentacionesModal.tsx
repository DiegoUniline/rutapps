import { useEffect, useMemo, useState } from 'react';
import { X, Search, Package, Warehouse, Truck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn, fmtNum } from '@/lib/utils';
import type { ProductoPresentacion } from '@/hooks/usePresentaciones';

interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  es_granel?: boolean | null;
  unidad_granel?: string | null;
  unidades?: { abreviatura?: string | null } | null;
}

interface Almacen {
  id: string;
  nombre: string;
  tipo?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  productos: Producto[];
  almacenes: Almacen[];
  /** almacen_id -> producto_id -> cantidad */
  stockMap: Record<string, Record<string, number>>;
  /** producto_id -> presentaciones */
  presByProd: Record<string, ProductoPresentacion[]>;
}

const fmtN = (n: number, max = 3) =>
  n.toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: max });

export default function InventarioPresentacionesModal({ open, onClose, productos, almacenes, stockMap, presByProd }: Props) {
  const [search, setSearch] = useState('');
  const [almacenId, setAlmacenId] = useState<string>('');

  useEffect(() => {
    if (open && !almacenId && almacenes[0]?.id) {
      setAlmacenId(almacenes[0].id);
    }
  }, [open, almacenes, almacenId]);

  const almacen = almacenes.find(a => a.id === almacenId);

  const rows = useMemo(() => {
    if (!almacen) return [];
    const stockA = stockMap[almacen.id] ?? {};
    return productos
      .filter(p => {
        const pres = (presByProd[p.id] ?? []).filter(pp => pp.activo);
        if (pres.length === 0) return false;
        const qty = stockA[p.id] ?? 0;
        if (qty === 0) return false;
        if (search && !p.nombre.toLowerCase().includes(search.toLowerCase()) && !p.codigo.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      })
      .map(p => {
        const qty = stockA[p.id] ?? 0;
        const unidadBase = p.es_granel ? (p.unidad_granel || 'kg') : (p.unidades?.abreviatura ?? 'pz');
        const pres = (presByProd[p.id] ?? [])
          .filter(pp => pp.activo)
          .slice()
          .sort((a, b) => Number(b.factor_base) - Number(a.factor_base));
        const equivalencias = pres.map(pp => {
          const f = Number(pp.factor_base) || 1;
          const enteros = Math.floor(qty / f);
          const restoRaw = qty - enteros * f;
          const resto = Math.round(restoRaw * 1000) / 1000;
          return { presentacion: pp, enteros, resto, factor: f };
        });
        return { producto: p, qty, unidadBase, equivalencias };
      })
      .sort((a, b) => a.producto.nombre.localeCompare(b.producto.nombre));
  }, [almacen, productos, stockMap, presByProd, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-card rounded-lg shadow-2xl w-full max-w-5xl max-h-[90dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" />
            <div>
              <h2 className="text-base font-semibold text-foreground">Stock por unidades de presentación</h2>
              <p className="text-[11px] text-muted-foreground">Equivalencia del stock de cada producto en sus diferentes empaques.</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-accent">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="px-4 py-3 border-b border-border flex flex-col sm:flex-row gap-2 sm:items-center">
          <select
            value={almacenId}
            onChange={(e) => setAlmacenId(e.target.value)}
            className="text-sm border border-border rounded px-2 py-1.5 bg-card text-foreground min-w-[12rem]"
          >
            {almacenes.map(a => (
              <option key={a.id} value={a.id}>
                {a.nombre} ({a.tipo === 'ruta' ? 'Ruta' : 'Almacén'})
              </option>
            ))}
          </select>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar producto..." className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-3">
          {!almacen && <p className="text-center text-muted-foreground py-8">Selecciona un almacén</p>}
          {almacen && rows.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              Sin productos con presentaciones configuradas y stock en este almacén.
            </p>
          )}
          {almacen && (
            <div className="flex items-center gap-2 mb-3 text-xs text-muted-foreground">
              {almacen.tipo === 'ruta' ? <Truck className="h-3.5 w-3.5 text-warning" /> : <Warehouse className="h-3.5 w-3.5 text-primary" />}
              <span className="font-medium">{almacen.nombre}</span>
              <span>· {rows.length} productos con presentaciones</span>
            </div>
          )}
          <div className="space-y-2">
            {rows.map(r => (
              <div key={r.producto.id} className="border border-border rounded">
                <div className="flex items-center justify-between px-3 py-2 bg-accent/30 border-b border-border">
                  <div>
                    <div className="text-[13px] font-semibold text-foreground">{r.producto.nombre}</div>
                    <div className="text-[10px] text-foreground/70 font-mono">{r.producto.codigo}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-foreground/70">Stock total</div>
                    <div className="text-sm font-bold text-foreground">{fmtNum(r.qty)} {r.unidadBase}</div>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 p-2">
                  {r.equivalencias.map(eq => (
                    <div key={eq.presentacion.id} className={cn(
                      "rounded border p-2",
                      eq.presentacion.es_principal_stock ? "border-primary/40 bg-primary/5" : "border-border"
                    )}>
                      <div className="text-[10px] text-foreground/80 uppercase tracking-wide font-semibold">{eq.presentacion.nombre}</div>
                      <div className="text-sm font-bold text-foreground">
                        {fmtN(eq.enteros)}
                        <span className="text-[11px] font-normal text-foreground/70"> enteras</span>
                      </div>
                      {eq.resto > 0 && (
                        <div className="text-[10px] text-foreground/80">
                          + {fmtN(eq.resto)} {r.unidadBase} sueltas
                        </div>
                      )}
                      <div className="text-[9px] text-foreground/60 mt-0.5">
                        1 {eq.presentacion.nombre} = {fmtN(eq.factor)} {r.unidadBase}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
