import { useLayoutEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface TicketHtmlVistaProps {
  /** HTML de `buildTicketHTML` (ya escapado). */
  html: string;
  className?: string;
}

/**
 * Muestra el ticket real (HTML de `buildTicketHTML`) escalado para que quepa en
 * el ancho disponible (teléfono 375 px incluido) sin scroll horizontal.
 */
export default function TicketHtmlVista({ html, className }: TicketHtmlVistaProps) {
  const contRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [escala, setEscala] = useState(1);
  const [alto, setAlto] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    const cont = contRef.current;
    const inner = innerRef.current;
    if (!cont || !inner) return;
    const medir = () => {
      const ticket = inner.firstElementChild as HTMLElement | null;
      if (!ticket) return;
      const w = ticket.offsetWidth;
      const disponible = cont.clientWidth;
      const e = w > 0 && disponible > 0 ? Math.min(1, disponible / w) : 1;
      setEscala(e);
      setAlto(ticket.offsetHeight > 0 ? ticket.offsetHeight * e : undefined);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(cont);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [html]);

  return (
    <div ref={contRef} className={cn('w-full overflow-hidden', escala >= 1 && 'flex justify-center', className)} style={{ height: alto }}>
      <div
        ref={innerRef}
        className="w-max shadow-sm"
        style={{ transform: escala < 1 ? `scale(${escala})` : undefined, transformOrigin: 'top left' }}
        // El HTML lo genera buildTicketHTML y escapa todos los textos.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
