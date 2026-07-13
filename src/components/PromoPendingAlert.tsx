import { Gift } from 'lucide-react';
import type { PendingProductoGratis } from '@/hooks/usePromociones';

interface Props {
  pending: PendingProductoGratis[];
  productoNombre: (id: string) => string;
}

/**
 * Aviso compacto para el vendedor: hay promociones "producto gratis" cuyo
 * disparador ya está en el carrito, pero falta agregar el producto de regalo
 * para que el descuento se aplique.
 */
export function PromoPendingAlert({ pending, productoNombre }: Props) {
  if (!pending?.length) return null;
  return (
    <div className="px-3 sm:px-4 pb-2">
      <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-700 p-3 space-y-1.5">
        {pending.map(p => (
          <div key={`${p.promocion_id}-${p.trigger_producto_id}`} className="flex items-start gap-2">
            <Gift className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11.5px] sm:text-[12px] leading-tight text-amber-900 dark:text-amber-100">
              Agrega <span className="font-bold">{p.cantidad_gratis_faltante}× {productoNombre(p.gratis_producto_id)}</span> al ticket para aplicar la promoción{' '}
              <span className="font-semibold">«{p.promocion_nombre}»</span> por{' '}
              <span className="font-semibold">{productoNombre(p.trigger_producto_id)}</span>.
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
