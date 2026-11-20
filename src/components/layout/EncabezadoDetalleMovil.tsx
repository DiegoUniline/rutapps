import type { ElementType, ReactNode } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuAcciones, CLASE_ITEM_MENU } from '@/components/shared/MenuAcciones';
import type { AccionMovil } from '@/components/shared/MasAccionesMovil';
import { TONOS, type TonoPildora } from '@/components/layout/ListaTarjetaMovil';

export interface AccionPrincipalMovil {
  key: string;
  /** Texto corto, sin montos: «Cobrar», «Guardar», «Confirmar», «Surtir»… */
  label: string;
  icon?: ElementType;
  onClick: () => void;
  disabled?: boolean;
  cargando?: boolean;
}

interface Props {
  onBack?: () => void;
  titulo: ReactNode;
  /** Chip de estado pequeño junto al título. */
  estado?: { texto: string; tono?: TonoPildora } | null;
  subtitulo?: ReactNode;
  /** Solo 1–2 acciones principales del documento (azul, D-029), a lo ancho. */
  principales?: AccionPrincipalMovil[];
  /** Todo lo demás va en «⋯» (destructivas en rojo). */
  menu?: AccionMovil[];
  /** Elementos extra del menú «⋯» (usar CLASE_ITEM_MENU). */
  menuExtra?: ReactNode;
  className?: string;
}

const BOTON_PRINCIPAL = 'flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-lg text-sm font-semibold bg-primary text-primary-foreground active:scale-[0.98] disabled:opacity-50';

/**
 * Encabezado estándar de un detalle en teléfono (docs/sistema-diseno.md, ejemplo CompraHeaderMovil):
 * regresar + título truncado + chip de estado + «⋯»; abajo solo las 1–2 acciones principales.
 */
export function EncabezadoDetalleMovil({ onBack, titulo, estado, subtitulo, principales, menu, menuExtra, className }: Props) {
  const items = (menu ?? []).filter(Boolean);
  const visibles = (principales ?? []).slice(0, 2);
  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2">
        {onBack && (
          <button type="button" onClick={onBack} className="btn-odoo-secondary !h-9 !w-9 !p-0 shrink-0" aria-label="Regresar">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h1 className="text-base font-semibold text-foreground truncate">{titulo}</h1>
            {estado?.texto && (
              <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide', TONOS[estado.tono ?? 'neutro'])}>
                {estado.texto}
              </span>
            )}
          </div>
          {subtitulo != null && subtitulo !== '' && <p className="text-xs text-muted-foreground tabular-nums truncate">{subtitulo}</p>}
        </div>
        {(items.length > 0 || menuExtra) && (
          <MenuAcciones className="shrink-0">
            {items.map(a => (
              <button
                key={a.key}
                type="button"
                data-cierra-menu
                disabled={a.disabled}
                onClick={a.onClick}
                className={cn(CLASE_ITEM_MENU, a.destructiva && 'text-destructive hover:text-destructive', a.separar && 'mt-1 border-t border-border rounded-t-none pt-2', 'disabled:opacity-50')}
              >
                {a.icon && <a.icon className="h-3.5 w-3.5 shrink-0" />} {a.label}
              </button>
            ))}
            {menuExtra}
          </MenuAcciones>
        )}
      </div>
      {visibles.length > 0 && (
        <div className="flex gap-2">
          {visibles.map(b => (
            <button key={b.key} type="button" onClick={b.onClick} disabled={b.disabled || b.cargando} className={BOTON_PRINCIPAL}>
              {b.cargando ? <Loader2 className="h-4 w-4 animate-spin" /> : b.icon ? <b.icon className="h-4 w-4" /> : null}
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default EncabezadoDetalleMovil;
