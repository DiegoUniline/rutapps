import { memo } from 'react';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical } from 'lucide-react';
import { cellKey } from '@/hooks/useMinMaxMatriz';

export interface MatrizProducto {
  id: string;
  codigo: string | null;
  nombre: string;
  unidad?: string | null;
}
export interface MatrizAlmacen { id: string; nombre: string }
export type CeldaValor = { min: number | null; max: number | null };

interface Props {
  productos: MatrizProducto[];
  almacenes: MatrizAlmacen[];
  valor: (productoId: string, almacenId: string) => CeldaValor;
  esModificada: (productoId: string, almacenId: string) => boolean;
  stock?: Record<string, number>;
  seleccion: Set<string>;
  onToggle: (productoId: string) => void;
  onToggleTodos: (checked: boolean) => void;
  onChange: (productoId: string, almacenId: string, campo: 'min' | 'max', valor: number | null) => void;
  onColumnAction: (almacenId: string, accion: 'copiar' | 'asignar' | 'limpiar') => void;
}

function focusCell(r: number, c: number, f: 'min' | 'max') {
  const el = document.querySelector<HTMLInputElement>(`[data-mm="${r}-${c}-${f}"]`);
  if (el) { el.focus(); el.select(); }
}

function MinMaxMatrixTableBase({
  productos, almacenes, valor, esModificada, stock, seleccion, onToggle, onToggleTodos, onChange, onColumnAction,
}: Props) {
  const todosSel = productos.length > 0 && productos.every(p => seleccion.has(p.id));

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>, r: number, c: number, f: 'min' | 'max') => {
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); focusCell(Math.min(r + 1, productos.length - 1), c, f); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusCell(Math.max(r - 1, 0), c, f); }
  };

  const estado = (v: CeldaValor, s?: number) => {
    if (s == null) return null;
    if (v.min != null && s < v.min) return { label: 'Bajo mínimo', cls: 'text-destructive' };
    if (v.max != null && v.max > 0 && s > v.max) return { label: 'Sobre máximo', cls: 'text-amber-600' };
    return { label: 'Correcto', cls: 'text-muted-foreground' };
  };

  return (
    <div className="relative overflow-auto border border-border rounded-md bg-background max-h-[calc(100dvh-260px)]">
      <table className="text-[12px] border-collapse">
        <thead className="sticky top-0 z-30 bg-background">
          <tr className="border-b border-border">
            <th className="sticky left-0 z-40 bg-background px-2 py-2 w-9"><Checkbox checked={todosSel} onCheckedChange={v => onToggleTodos(!!v)} /></th>
            <th className="sticky left-9 z-40 bg-background px-2 py-2 text-left w-28">Código</th>
            <th className="sticky left-[8.75rem] z-40 bg-background px-2 py-2 text-left w-64 border-r border-border">Producto</th>
            <th className="px-2 py-2 text-left w-20">Unidad</th>
            {almacenes.map(a => (
              <th key={a.id} className="px-2 py-2 text-left min-w-[170px] border-l border-border">
                <div className="flex items-center justify-between gap-1">
                  <span className="truncate">{a.nombre}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger className="p-0.5 hover:bg-muted rounded" aria-label={`Acciones ${a.nombre}`}>
                      <MoreVertical className="h-3.5 w-3.5" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="bg-popover z-50">
                      <DropdownMenuItem onClick={() => onColumnAction(a.id, 'copiar')}>Copiar configuración</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onColumnAction(a.id, 'asignar')}>Establecer valores masivamente</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => onColumnAction(a.id, 'limpiar')}>Limpiar máximos y mínimos</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {productos.map((p, r) => (
            <tr key={p.id} className="border-b border-border hover:bg-muted/30">
              <td className="sticky left-0 z-20 bg-background px-2 py-1"><Checkbox checked={seleccion.has(p.id)} onCheckedChange={() => onToggle(p.id)} /></td>
              <td className="sticky left-9 z-20 bg-background px-2 py-1 font-mono text-[11px]">{p.codigo || '—'}</td>
              <td className="sticky left-[8.75rem] z-20 bg-background px-2 py-1 border-r border-border">
                <span className="block max-w-[15rem] truncate" title={p.nombre}>{p.nombre}</span>
              </td>
              <td className="px-2 py-1 text-muted-foreground">{p.unidad || '—'}</td>
              {almacenes.map((a, c) => {
                const v = valor(p.id, a.id);
                const key = cellKey(p.id, a.id);
                const s = stock?.[key];
                const est = estado(v, s);
                const invalido = v.min != null && v.max != null && v.max > 0 && v.max < v.min;
                const mod = esModificada(p.id, a.id);
                return (
                  <td key={a.id} className={cn('px-2 py-1 border-l border-border align-top', mod && 'bg-primary/5')}>
                    <div className="flex items-center gap-1">
                      <input
                        data-mm={`${r}-${c}-min`} type="number" min={0} step="0.001" placeholder="—"
                        className={cn('input-odoo !py-0.5 w-16 text-right text-[11px]', invalido && 'border-destructive')}
                        value={v.min ?? ''}
                        onKeyDown={e => handleKey(e, r, c, 'min')}
                        onChange={e => onChange(p.id, a.id, 'min', e.target.value === '' ? null : Number(e.target.value))}
                      />
                      <input
                        data-mm={`${r}-${c}-max`} type="number" min={0} step="0.001" placeholder="—"
                        className={cn('input-odoo !py-0.5 w-16 text-right text-[11px]', invalido && 'border-destructive')}
                        value={v.max ?? ''}
                        onKeyDown={e => handleKey(e, r, c, 'max')}
                        onChange={e => onChange(p.id, a.id, 'max', e.target.value === '' ? null : Number(e.target.value))}
                      />
                    </div>
                    {invalido ? (
                      <p className="text-[10px] text-destructive mt-0.5">El máximo no puede ser menor al mínimo.</p>
                    ) : est ? (
                      <p className={cn('text-[10px] mt-0.5', est.cls)}>Stock {s} · {est.label}</p>
                    ) : null}
                  </td>
                );
              })}
            </tr>
          ))}
          {productos.length === 0 && (
            <tr><td colSpan={4 + almacenes.length} className="px-3 py-6 text-center text-muted-foreground">Sin productos</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export const MinMaxMatrixTable = memo(MinMaxMatrixTableBase);
export default MinMaxMatrixTable;
