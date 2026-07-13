import { useMemo } from 'react';
import { Gift, Tag, Percent, DollarSign, CalendarDays } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { usePromocionesActivas, type Promocion } from '@/hooks/usePromociones';
import { useOfflineQuery } from '@/hooks/useOfflineData';
import { useCurrency } from '@/hooks/useCurrency';

const DIAS_ORDEN = ['lunes','martes','miércoles','jueves','viernes','sábado','domingo'];

function iconFor(tipo: Promocion['tipo']) {
  if (tipo === 'producto_gratis') return Gift;
  if (tipo === 'descuento_porcentaje' || tipo === 'volumen') return Percent;
  if (tipo === 'descuento_monto') return DollarSign;
  return Tag;
}

export default function RutaPromociones() {
  const { empresa } = useAuth();
  const { fmt } = useCurrency();
  const { data: promos, isLoading } = usePromocionesActivas();
  const { data: productos } = useOfflineQuery('productos', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });
  const { data: clasificaciones } = useOfflineQuery('clasificaciones', { empresa_id: empresa?.id }, { enabled: !!empresa?.id });

  const nameProducto = (id?: string | null) => {
    if (!id) return '';
    return ((productos ?? []) as any[]).find(p => p.id === id)?.nombre ?? 'Producto';
  };
  const nameClasif = (id?: string | null) => {
    if (!id) return '';
    return ((clasificaciones ?? []) as any[]).find(c => c.id === id)?.nombre ?? 'Categoría';
  };

  const lista = useMemo(() => (promos ?? []) as Promocion[], [promos]);

  return (
    <div className="p-4 space-y-3 pb-24">
      <div className="bg-primary/10 border border-primary/20 rounded-2xl p-4">
        <p className="text-[12px] text-primary font-semibold flex items-center gap-1.5">
          <Gift className="h-3.5 w-3.5" /> Promociones activas
        </p>
        <p className="text-[24px] font-bold text-foreground mt-1">{lista.length}</p>
        <p className="text-[11px] text-muted-foreground">Vigentes hoy — aplican automáticamente en el ticket</p>
      </div>

      {isLoading ? (
        <p className="text-center text-[13px] text-muted-foreground py-8">Cargando…</p>
      ) : lista.length === 0 ? (
        <div className="bg-card border border-dashed border-border rounded-2xl p-8 text-center">
          <p className="text-[13px] text-muted-foreground">Sin promociones activas hoy</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lista.map(p => {
            const Icon = iconFor(p.tipo);
            const dias = (p.dias_semana ?? []).length > 0
              ? [...p.dias_semana].sort((a,b) => DIAS_ORDEN.indexOf(a) - DIAS_ORDEN.indexOf(b)).join(', ')
              : 'Todos los días';
            let detalle = '';
            if (p.tipo === 'descuento_porcentaje') detalle = `${p.valor}% de descuento`;
            else if (p.tipo === 'descuento_monto') detalle = `${fmt(p.valor)} de descuento por unidad`;
            else if (p.tipo === 'precio_especial') detalle = `Precio especial ${fmt(p.valor)}`;
            else if (p.tipo === 'volumen') detalle = `${p.valor}% al comprar ${p.cantidad_minima}+`;
            else if (p.tipo === 'producto_gratis') {
              detalle = p.producto_gratis_id
                ? `Al comprar ${p.cantidad_minima}, lleva ${p.cantidad_gratis}× ${nameProducto(p.producto_gratis_id)} gratis`
                : `${p.cantidad_minima}×${(p.cantidad_minima || 1) - (p.cantidad_gratis || 1)} — Lleva ${p.cantidad_minima}, paga ${(p.cantidad_minima || 1) - (p.cantidad_gratis || 1)}`;
            }

            let aplica = '';
            if (p.aplica_a === 'todos') aplica = 'Aplica a todos los productos';
            else if (p.aplica_a === 'producto') aplica = `Productos: ${p.producto_ids.slice(0, 3).map(nameProducto).join(', ')}${p.producto_ids.length > 3 ? ` +${p.producto_ids.length - 3}` : ''}`;
            else if (p.aplica_a === 'clasificacion') aplica = `Categorías: ${p.clasificacion_ids.slice(0, 3).map(nameClasif).join(', ')}`;
            else if (p.aplica_a === 'cliente') aplica = `Solo clientes seleccionados (${p.cliente_ids.length})`;
            else if (p.aplica_a === 'zona') aplica = `Solo zonas seleccionadas (${p.zona_ids.length})`;

            return (
              <div key={p.id} className="bg-card border border-border rounded-xl p-3 space-y-2">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-semibold text-foreground leading-tight">{p.nombre}</p>
                    {p.descripcion && <p className="text-[11px] text-muted-foreground mt-0.5">{p.descripcion}</p>}
                  </div>
                  {p.acumulable && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-success/15 text-success shrink-0">ACUM</span>
                  )}
                </div>
                <div className="bg-primary/[0.04] rounded-lg px-2.5 py-2">
                  <p className="text-[12px] font-medium text-primary">{detalle}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10.5px] text-muted-foreground">{aplica}</p>
                  <p className="text-[10.5px] text-muted-foreground flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    <span className="capitalize">{dias}</span>
                    {p.vigencia_fin && <span>· hasta {p.vigencia_fin}</span>}
                  </p>
                </div>
                {p.tipo === 'producto_gratis' && p.producto_gratis_id && (
                  <p className="text-[10.5px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 rounded px-2 py-1.5">
                    ⚠ Debes agregar <b>{nameProducto(p.producto_gratis_id)}</b> al ticket para que el descuento se aplique.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
