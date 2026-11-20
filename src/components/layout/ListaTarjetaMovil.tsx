import { useEffect, useState, type ReactNode } from 'react';
import { MoreVertical, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { AccionMovil } from '@/components/shared/MasAccionesMovil';
import { useInListPage } from '@/components/layout/ListPage';

/**
 * Estándar de listas administrativas en teléfono (docs/sistema-diseno.md,
 * «Listas en teléfono»), tomado de la lista móvil de Productos:
 *  - Encabezado: título + botón redondo «+» y el buscador/Filtros a lo ancho.
 *  - Un solo contenedor rounded-xl con renglones separados por línea.
 *  - Renglón = botón: título en color primario, segunda línea gris y a la
 *    derecha una píldora con el dato clave (estado, saldo, existencias).
 *  - Al final «Cargar más (n de total)» de 50 en 50.
 * Solo presentación: usa los mismos datos ya cargados para la tabla.
 */

export const PASO_MOVIL = 50;

export type TonoPildora = 'exito' | 'peligro' | 'aviso' | 'neutro' | 'primario';

export const TONOS: Record<TonoPildora, string> = {
  exito: 'bg-success/10 text-success',
  peligro: 'bg-destructive/10 text-destructive',
  aviso: 'bg-warning/10 text-warning',
  neutro: 'bg-accent text-muted-foreground border border-border',
  primario: 'bg-primary/10 text-primary',
};

const ESTADOS: Record<string, [string, TonoPildora]> = {
  borrador: ['Borrador', 'neutro'], pendiente: ['Pendiente', 'aviso'], abierto: ['Abierto', 'primario'],
  en_progreso: ['En progreso', 'aviso'], en_proceso: ['En proceso', 'aviso'], solicitada: ['Solicitada', 'aviso'],
  enviada: ['Enviada', 'primario'], confirmado: ['Confirmado', 'primario'], confirmada: ['Confirmada', 'primario'],
  aprobada: ['Aprobada', 'exito'], aprobado: ['Aprobado', 'exito'], recibida: ['Recibida', 'exito'],
  entregado: ['Entregado', 'exito'], facturado: ['Facturado', 'exito'], pagada: ['Pagada', 'exito'],
  surtida: ['Surtida', 'exito'], timbrado: ['Timbrado', 'exito'], activo: ['Activo', 'exito'], activa: ['Activa', 'exito'],
  convertida: ['Convertida', 'exito'], parcialmente_surtida: ['Parcial', 'aviso'], parcial: ['Parcial', 'aviso'],
  cerrado: ['Cerrado', 'neutro'], cerrada: ['Cerrada', 'neutro'], inactivo: ['Inactivo', 'neutro'], inactiva: ['Inactiva', 'neutro'],
  vencida: ['Vencida', 'peligro'], rechazada: ['Rechazada', 'peligro'], error: ['Error', 'peligro'],
  cancelado: ['Cancelado', 'peligro'], cancelada: ['Cancelada', 'peligro'],
};

/** Texto y tono de la píldora para un estado de documento. */
export function estadoPildora(status: string | null | undefined, label?: string): { pildora: string; tono: TonoPildora } {
  const s = (status ?? '').toString();
  const def = ESTADOS[s];
  const texto = label ?? def?.[0] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, ' ') : '—');
  return { pildora: texto, tono: def?.[1] ?? 'neutro' };
}

/** Píldora redondeada del dato clave de un renglón. */
export function PildoraMovil({ children, tono = 'neutro', className }: { children: ReactNode; tono?: TonoPildora; className?: string }) {
  return (
    <span className={cn('shrink-0 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums whitespace-nowrap max-w-[45%] truncate', TONOS[tono], className)}>
      {children}
    </span>
  );
}

interface EncabezadoListaMovilProps {
  titulo: ReactNode;
  /** Filtro de estado activo distinto al de por omisión: se muestra «· Estado». */
  estado?: ReactNode;
  onNuevo?: () => void;
  nuevoLabel?: string;
  /** Buscador (OdooFilterBar) a todo lo ancho. */
  children?: ReactNode;
  className?: string;
  /** Botón secundario opcional junto al «+» (ícono redondo con aria-label). */
  extra?: ReactNode;
}

/** Encabezado móvil: título + «+» redondo y debajo el buscador con Filtros. */
export function EncabezadoListaMovil({ titulo, estado, onNuevo, nuevoLabel = 'Nuevo', children, className, extra }: EncabezadoListaMovilProps) {
  return (
    <div className={cn('shrink-0 space-y-2', className)}>
      <div className="flex items-center justify-between gap-2 min-h-10">
        <h1 className="text-lg font-semibold text-foreground min-w-0 truncate">
          {titulo}
          {estado ? <span className="ml-1.5 text-xs font-normal text-muted-foreground">· {estado}</span> : null}
        </h1>
        {extra && <div className="ml-auto flex items-center gap-2 shrink-0">{extra}</div>}
        {onNuevo && (
          <button
            type="button"
            onClick={onNuevo}
            aria-label={nuevoLabel}
            title={nuevoLabel}
            className="h-10 w-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center active:scale-95 shrink-0"
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

interface ListaTarjetaMovilProps {
  /** Texto principal (color primario): cliente, proveedor, producto, nombre. */
  titulo: string;
  /** Segunda línea gris: monto · fecha · folio. */
  linea2?: ReactNode;
  /** Dato clave a la derecha. Texto → píldora con `tono`; nodo → se pinta tal cual. */
  pildora?: ReactNode;
  tono?: TonoPildora;
  /** Ícono o imagen de 48 px opcional. */
  leading?: ReactNode;
  onClick?: () => void;
  /** Solo para listas sin pantalla de detalle: acciones en «⋯». */
  acciones?: AccionMovil[];
  className?: string;
  /** Compatibilidad: se combinan en la segunda línea si no se da `linea2`. */
  subtitulo?: string;
  campos?: { label: string; value: ReactNode; className?: string }[];
  /** Compatibilidad: equivale a `pildora` como nodo. */
  estado?: ReactNode;
}

/** Renglón estándar de lista en teléfono. */
export function ListaTarjetaMovil({ titulo, linea2, pildora, tono = 'neutro', leading, onClick, acciones, className, subtitulo, campos, estado }: ListaTarjetaMovilProps) {
  const visibles = (acciones ?? []).filter(Boolean);
  if (linea2 == null && (subtitulo || campos?.length)) {
    const partes: ReactNode[] = [...(campos ?? []).slice(0, 2).map(c => c.value), ...(subtitulo ? [<span key="s" className="text-xs">{subtitulo}</span>] : [])];
    linea2 = partes.map((p, i) => <span key={i}>{i > 0 && ' · '}{p}</span>);
  }
  if (pildora == null && estado != null) pildora = estado;
  const pild = pildora == null || pildora === '' ? null
    : (typeof pildora === 'string' || typeof pildora === 'number') ? <PildoraMovil tono={tono}>{pildora}</PildoraMovil>
    : <span className="shrink-0">{pildora}</span>;
  return (
    <div className={cn('flex items-stretch', className)}>
      {leading && <div className="pl-3 flex items-center shrink-0" onClick={e => e.stopPropagation()}>{leading}</div>}
      <button
        type="button"
        onClick={onClick}
        className={cn('flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 text-left', onClick ? 'active:bg-accent' : 'cursor-default')}
      >
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-medium text-primary truncate">{titulo || '—'}</p>
          {linea2 != null && linea2 !== '' && <p className="text-sm text-muted-foreground tabular-nums truncate">{linea2}</p>}
        </div>
        {pild}
      </button>
      {visibles.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Acciones" className="w-9 shrink-0 inline-flex items-center justify-center text-muted-foreground active:bg-accent">
              <MoreVertical className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[176px] max-w-[calc(100vw-1rem)]">
            {visibles.map(a => (
              <div key={a.key}>
                {a.separar && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  disabled={a.disabled}
                  onSelect={() => a.onClick()}
                  className={cn('gap-2 py-2.5 text-[13px]', a.destructiva && 'text-destructive focus:text-destructive')}
                >
                  {a.icon && <a.icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{a.label}</span>
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

interface ListaTarjetasMovilProps {
  children: ReactNode;
  vacia?: boolean;
  mensajeVacio?: ReactNode;
  className?: string;
  /** «Cargar más (mostrados de total)». */
  mostrados?: number;
  total?: number;
  onCargarMas?: () => void;
  /** Fuerza el estilo «a todo lo ancho» (hoja propia con padding px-3 md:px-4). */
  aLoAncho?: boolean;
  /** Se ignoran (vienen de useCargarMasMovil al hacer spread). */
  visibles?: unknown;
}

/** Contenedor único de renglones + estado vacío + «Cargar más». */
export function ListaTarjetasMovil({ children, vacia, mensajeVacio = 'Sin registros', className, mostrados, total, onCargarMas, aLoAncho }: ListaTarjetasMovilProps) {
  // D-037: dentro de la hoja de <ListPage> (en un Body card={false}) la lista va a todo lo ancho,
  // separada por líneas; fuera de ListPage es su propia hoja redondeada.
  const enHoja = useInListPage() || !!aLoAncho;
  if (vacia) {
    return <div className="text-center py-12 text-muted-foreground text-sm">{mensajeVacio}</div>;
  }
  return (
    <div className={className}>
      <div
        data-lista-tarjetas=""
        className={enHoja
          ? '-mx-3 md:-mx-4 border-y border-border divide-y divide-border'
          : 'rounded-xl border border-border bg-card shadow-sm divide-y divide-border overflow-hidden'}
      >
        {children}
      </div>
      {onCargarMas && mostrados != null && total != null && mostrados < total && (
        <button
          type="button"
          onClick={onCargarMas}
          className="w-full mt-2 mb-1 py-2.5 rounded-xl border border-border bg-card text-sm font-medium text-foreground active:bg-accent"
        >
          Cargar más ({mostrados} de {total})
        </button>
      )}
    </div>
  );
}

/**
 * «Cargar más» para listas que ya están completas en memoria: muestra de 50
 * en 50 y vuelve a 50 cuando cambia `reinicio` (búsqueda o filtros).
 */
export function useCargarMasMovil<T>(items: T[] | undefined | null, reinicio?: unknown) {
  const [limite, setLimite] = useState(PASO_MOVIL);
  useEffect(() => { setLimite(PASO_MOVIL); }, [reinicio]);
  const lista = items ?? [];
  return {
    visibles: lista.slice(0, limite),
    mostrados: Math.min(limite, lista.length),
    total: lista.length,
    onCargarMas: () => setLimite(l => l + PASO_MOVIL),
  };
}

export default ListaTarjetaMovil;
