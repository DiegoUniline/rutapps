import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

/**
 * D-040: 3 anchos estándar en escritorio para todos los modales.
 * chico 560 px (confirmar, asignar, motivos) · mediano 760 px (formularios) · grande 1100 px (tablas).
 * Los anchos que pasan las pantallas (max-w-sm, max-w-2xl…) se traducen a la talla más cercana;
 * los anchos especiales (max-w-[1500px], max-w-[96vw], max-w-none) se respetan.
 */
const ANCHO_CHICO = /^(sm:|md:)?max-w-(xs|sm|md|lg)$/;
const ANCHO_MEDIANO = /^(sm:|md:)?max-w-(xl|2xl|3xl)$/;
const ANCHO_GRANDE = /^(sm:|md:)?max-w-(4xl|5xl|6xl|7xl)$/;
function anchoEstandar(className?: string): string {
  const tokens = (className ?? '').split(/\s+/).filter(Boolean);
  let talla: 'chico' | 'mediano' | 'grande' | null = null;
  const resto = tokens.filter(t => {
    if (ANCHO_GRANDE.test(t)) { talla = 'grande'; return false; }
    if (ANCHO_MEDIANO.test(t)) { if (talla !== 'grande') talla = 'mediano'; return false; }
    if (ANCHO_CHICO.test(t)) { if (!talla) talla = 'chico'; return false; }
    return true;
  });
  const especial = resto.some(t => /^(sm:|md:)?max-w-(\[|none|full|screen)/.test(t));
  if (especial) return resto.join(' ');
  const clase = talla === 'grande' ? 'sm:max-w-[1100px]' : talla === 'mediano' ? 'sm:max-w-[760px]' : 'sm:max-w-[560px]';
  return [clase, ...resto].join(' ');
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      data-dialog-content=""
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-[calc(100vw-1rem)] max-h-[90dvh] overflow-y-auto translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 rounded-xl shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-xl",
        anchoEstandar(className),
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close data-dialog-close-default="" className="absolute right-4 top-4 z-20 h-8 w-8 inline-flex items-center justify-center rounded-md bg-muted text-foreground border border-border shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Cerrar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

// D-040: el encabezado y el pie quedan fijos al hacer scroll (estilos en index.css, sección D-040);
// el encabezado trae su propio botón de cerrar para que no se vaya con el scroll.
const DialogHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-dialog-header="" className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props}>
    {children}
    <DialogPrimitive.Close data-dialog-header-close="" className="absolute right-4 top-1/2 -translate-y-1/2 h-8 w-8 items-center justify-center rounded-md bg-muted text-foreground border border-border shadow-sm transition-colors hover:bg-accent focus:outline-none focus:ring-2 focus:ring-ring">
      <X className="h-4 w-4" />
      <span className="sr-only">Cerrar</span>
    </DialogPrimitive.Close>
  </div>
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div data-dialog-footer="" className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-base sm:text-lg font-semibold leading-tight tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
