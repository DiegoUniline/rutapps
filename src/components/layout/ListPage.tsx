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

/** true cuando el componente está dentro de un <ListPage>. */
export function useInListPage() {
  return useContext(ListPageContext);
}

interface ListPageProps {
  children: ReactNode;
  className?: string;
  /** Quita el padding por defecto (útil para vistas a sangre completa). */
  flush?: boolean;
}

function ListPageRoot({ children, className, flush }: ListPageProps) {
  return (
    <ListPageContext.Provider value={true}>
      <div
        data-listpage=""
        className={cn(
          'flex flex-col h-full min-h-0 overflow-hidden gap-3',
          !flush && 'p-4 pb-2',
          className,
        )}
      >
        {children}
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
    <div className={cn('shrink-0 flex flex-wrap items-center justify-between gap-2', className)}>
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
  return <div className={cn('shrink-0 flex flex-col gap-3', className)}>{children}</div>;
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
        card && 'bg-card border border-border rounded',
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
  return <div className={cn('shrink-0', className)}>{children}</div>;
}

export const ListPage = Object.assign(ListPageRoot, { Header, Toolbar, Body, Footer });
export default ListPage;
