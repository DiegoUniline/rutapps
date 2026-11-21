import { useMemo, useState, useCallback } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: string | null;
  dir: SortDir;
}

const SORT_PREFIX = 'sort_v1_';
const SIN_ORDEN: SortState = { key: null, dir: 'asc' };

function leerOrden(persistKey: string | undefined, initial: SortState): SortState {
  if (!persistKey) return initial;
  try {
    const raw = localStorage.getItem(SORT_PREFIX + persistKey);
    if (raw) {
      const v = JSON.parse(raw);
      if (v && (v.key === null || typeof v.key === 'string') && (v.dir === 'asc' || v.dir === 'desc')) return v;
    }
  } catch (e) {
    console.warn('[sort] no se pudo leer el orden guardado', e);
  }
  return initial;
}

function guardarOrden(persistKey: string | undefined, s: SortState) {
  if (!persistKey) return;
  try {
    localStorage.setItem(SORT_PREFIX + persistKey, JSON.stringify(s));
  } catch (e) {
    console.warn('[sort] no se pudo guardar el orden', e);
  }
}

/** Ciclo de un encabezado: A→Z, Z→A, sin orden (vuelve al orden de la lista). */
export function siguienteOrden(prev: SortState, key: string): SortState {
  if (prev.key !== key) return { key, dir: 'asc' };
  if (prev.dir === 'asc') return { key, dir: 'desc' };
  return SIN_ORDEN;
}

/**
 * Estado de orden por columna, recordado por lista (`persistKey`) en este navegador.
 * Úsalo directo en listas paginadas en la BD (el orden va en la consulta con `aplicarOrdenConsulta`).
 */
export function useSortState(persistKey?: string, initial: SortState = SIN_ORDEN) {
  const [sort, setSortState] = useState<SortState>(() => leerOrden(persistKey, initial));
  const setSort = useCallback((s: SortState) => {
    setSortState(s);
    guardarOrden(persistKey, s);
  }, [persistKey]);
  const toggle = useCallback((key: string) => {
    setSortState(prev => {
      const next = siguienteOrden(prev, key);
      guardarOrden(persistKey, next);
      return next;
    });
  }, [persistKey]);
  return { sort, toggle, setSort };
}

/** Compara dos valores de celda: números, fechas y texto (español, «A2» antes que «A10»). */
export function compararValores(av: unknown, bv: unknown): number {
  if (av == null || av === '') return bv == null || bv === '' ? 0 : 1;
  if (bv == null || bv === '') return -1;
  if (typeof av === 'number' && typeof bv === 'number') return av - bv;
  if (typeof av === 'boolean' && typeof bv === 'boolean') return Number(av) - Number(bv);
  if (av instanceof Date && bv instanceof Date) return av.getTime() - bv.getTime();
  return String(av).localeCompare(String(bv), 'es', { numeric: true, sensitivity: 'base' });
}

/** Ordena una copia de `items` (vacíos siempre al final). */
export function ordenarFilas<T>(items: T[], sort: SortState, getValue?: (row: T, key: string) => unknown): T[] {
  if (!sort.key) return items;
  const key = sort.key;
  const mul = sort.dir === 'asc' ? 1 : -1;
  const get = getValue ?? ((r: any, k: string) => r?.[k]);
  return [...items].sort((a, b) => {
    const av = get(a, key);
    const bv = get(b, key);
    const vacioA = av == null || av === '';
    const vacioB = bv == null || bv === '';
    if (vacioA || vacioB) return vacioA === vacioB ? 0 : vacioA ? 1 : -1;
    return compararValores(av, bv) * mul;
  });
}

/**
 * Orden por columna en tablas que ya tienen todas sus filas en memoria.
 * - getValue: valor comparable de la fila para la columna (por omisión row[key]).
 * - persistKey: si se da, el orden elegido se recuerda para esa lista.
 */
export function useSortableTable<T = any>(
  items: T[],
  getValue?: (row: T, key: string) => any,
  initial: SortState = SIN_ORDEN,
  persistKey?: string,
) {
  const { sort, toggle, setSort } = useSortState(persistKey, initial);
  const sorted = useMemo(() => ordenarFilas(items, sort, getValue), [items, sort, getValue]);
  return { sorted, sort, toggle, setSort };
}

/**
 * Orden en la consulta de Supabase para listas paginadas en la BD (ordena TODO el resultado,
 * no solo la página visible). `columnas` traduce la clave de la columna a la columna real
 * (p. ej. { cliente: 'nombre' } o { vendedor: 'vendedores(nombre)' } para una relación a-uno).
 * Sin orden elegido (o clave no mapeada) se usa `porOmision`. Siempre agrega `id` como desempate
 * para que la paginación sea estable.
 */
export function aplicarOrdenConsulta<Q extends { order: (col: string, opts?: any) => Q }>(
  q: Q,
  sort: SortState | null | undefined,
  columnas: Record<string, string>,
  porOmision: { columna: string; asc?: boolean } = { columna: 'created_at', asc: false },
): Q {
  const col = sort?.key ? columnas[sort.key] : undefined;
  if (col) {
    q = q.order(col, { ascending: sort!.dir === 'asc', nullsFirst: false });
  } else {
    q = q.order(porOmision.columna, { ascending: porOmision.asc ?? false });
  }
  return q.order('id', { ascending: true });
}

interface SortableThProps {
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  children: React.ReactNode;
}

function etiquetaOrden(active: boolean, dir: SortDir) {
  if (!active) return 'Ordenar de la A a la Z';
  return dir === 'asc' ? 'Ordenado de la A a la Z (clic: Z a la A)' : 'Ordenado de la Z a la A (clic: quitar orden)';
}

/** Encabezado `<th>` ordenable. Funciona con `th-odoo` y con las clases de `TableHead`. */
export function SortableTh({ sortKey, sort, onToggle, align = 'left', className, children }: SortableThProps) {
  const active = sort.key === sortKey;
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ChevronUp : ChevronDown;
  const justify = align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start';
  return (
    <th
      className={cn('cursor-pointer select-none hover:text-foreground transition-colors', className)}
      onClick={() => onToggle(sortKey)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={etiquetaOrden(active, sort.dir)}
    >
      <span className={cn('inline-flex items-center gap-1', justify, align !== 'left' && 'w-full')}>
        {children}
        <Icon className={cn('h-3 w-3 shrink-0', active ? 'text-primary' : 'text-muted-foreground/50')} />
      </span>
    </th>
  );
}

/** Igual que `SortableTh` con el estilo de `TableHead` (tablas shadcn `<Table>`). */
export function SortableTableHead(props: SortableThProps) {
  return (
    <SortableTh
      {...props}
      className={cn(
        'h-12 px-4 text-left align-middle font-bold text-muted-foreground [&:has([role=checkbox])]:pr-0',
        props.align === 'right' && 'text-right',
        props.align === 'center' && 'text-center',
        props.className,
      )}
    />
  );
}
