import { createContext, useContext, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * ListPage — fuente única de verdad del layout de las vistas de listado.
 *
 * Reglas que viven SOLO aquí (no repetir en las páginas):
 *  - la página ocupa el 100% de la altura disponible del shell,
 *  - el documento (body) nunca hace scroll,
 *  - encabezado, filtros y acciones quedan fijos,
 *  - únicamente `ListPage.Body` hace scroll (vertical y horizontal),
 *  - la barra horizontal queda siempre dentro del área visible,
 *  - sin alturas fijas: todo por cadena flex.
 *
 * Uso:
 *   <ListPage>
 *     <ListPage.Header title="Clientes" actions={<Botones />} />
 *     <ListPage.Toolbar><OdooFilterBar … /></ListPage.Toolbar>
 *     <ListPage.Body><table>…</table></ListPage.Body>
 *     <ListPage.Footer>…</ListPage.Footer>
 *   </ListPage>
 */

const ListPageContext = createContext(false);

/**
 * Clases del área desplazable. Fuente única: cualquier contenedor que deba
 * hacer scroll dentro de un ListPage debe usar estas clases (no reescribirlas).
 */
export const SCROLL_AREA =
  'flex-1 min-h-0 overflow-auto [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card';

/** Tarjeta de tabla desplazable (card + área de scroll). */
// D-037: dentro de la hoja única la tabla no lleva cuadro propio, solo una línea arriba.
export const TABLE_CARD = `border-t border-border ${SCROLL_AREA}`;

/** true cuando el componente está dentro de un <ListPage>. */
export function useInListPage() {
  return useContext(ListPageContext);
}

interface ListPageProps {
  children: ReactNode;
  className?: string;
  /** Quita el padding por defecto (útil para vistas a sangre completa). */
  flush?: boolean;
  /**
   * Modo compatible: la página entera hace scroll (comportamiento previo).
   * Úsalo sólo en vistas que aún no tienen un único contenedor desplazable.
   */
  scroll?: boolean;
}

function ListPageRoot({ children, className, flush, scroll }: ListPageProps) {
  // D-037: fondo gris (lo pinta AppLayout) y TODO el contenido de la pantalla en una sola hoja
  // blanca: título, pestañas, buscador, tabla y totales, separados solo por líneas finas.
  if (flush) {
    return (
      <ListPageContext.Provider value={true}>
        <div
          data-listpage=""
          className={cn('flex flex-col h-full min-h-0 gap-3 [&>*]:shrink-0', scroll ? 'overflow-y-auto' : 'overflow-hidden', className)}
        >
          {children}
        </div>
      </ListPageContext.Provider>
    );
  }
  return (
    <ListPageContext.Provider value={true}>
      <div data-listpage="" className="flex flex-col h-full min-h-0 p-2 md:p-4 md:pb-3">
        <div
          data-listpage-sheet=""
          className={cn(
            'flex flex-col flex-1 min-h-0 gap-3 [&>*]:shrink-0 bg-card text-card-foreground border border-border rounded-xl shadow-sm py-3',
            scroll ? 'overflow-y-auto' : 'overflow-hidden',
            className,
          )}
        >
          {children}
        </div>
      </div>
    </ListPageContext.Provider>
  );
}

interface HeaderProps {
  title?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

function Header({ title, actions, children, className }: HeaderProps) {
  return (
    <div className={cn('shrink-0 flex flex-wrap items-center justify-between gap-2 px-3 md:px-4', className)}>
      {title != null && (
        <h1 className="text-xl font-semibold text-foreground flex items-center gap-2">{title}</h1>
      )}
      {children}
      {actions != null && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

interface SectionProps {
  children: ReactNode;
  className?: string;
}

/** Zona fija para filtros, buscador, paginación, avisos, KPIs. */
function Toolbar({ children, className }: SectionProps) {
  return <div className={cn('shrink-0 flex flex-col gap-3 px-3 md:px-4', className)}>{children}</div>;
}

interface BodyProps extends SectionProps {
  /** Envuelve el contenido en tarjeta (borde + fondo). Default: true. */
  card?: boolean;
  /** Fija el thead de las tablas que contenga. Default: true. */
  stickyHead?: boolean;
}

/** Único contenedor con scroll (vertical + horizontal). */
function Body({ children, className, card = true, stickyHead = true }: BodyProps) {
  return (
    <div
      className={cn(
        'flex-1 min-h-0 overflow-auto',
        // Dentro de la hoja: la tabla va a todo lo ancho, separada por una línea (sin otro cuadro).
        card ? 'border-t border-border -mb-3' : 'px-3 md:px-4',
        stickyHead && '[&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Zona fija inferior: totales, statusbar, acciones masivas. */
function Footer({ children, className }: SectionProps) {
  return <div className={cn('shrink-0 px-3 md:px-4', className)}>{children}</div>;
}

export const ListPage = Object.assign(ListPageRoot, { Header, Toolbar, Body, Footer });
export default ListPage;
