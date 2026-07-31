import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { todayInTimezone } from '@/lib/utils';
import { offlineDb } from '@/lib/offlineDb';


export interface Promocion {
  id: string;
  empresa_id: string;
  nombre: string;
  descripcion: string | null;
  tipo: 'descuento_porcentaje' | 'descuento_monto' | 'producto_gratis' | 'precio_especial' | 'volumen';
  aplica_a: 'todos' | 'producto' | 'clasificacion' | 'cliente' | 'zona';
  activa: boolean;
  valor: number;
  cantidad_minima: number;
  cantidad_gratis: number;
  producto_gratis_id: string | null;
  producto_ids: string[];
  clasificacion_ids: string[];
  cliente_ids: string[];
  zona_ids: string[];
  vigencia_inicio: string | null;
  vigencia_fin: string | null;
  dias_semana: string[];
  prioridad: number;
  acumulable: boolean;
  created_at: string;
}

export function usePromociones() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['promociones', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promociones')
        .select('*')
        .eq('empresa_id', empresaId!)
        .order('prioridad', { ascending: false });
      if (error) throw error;
      return data as Promocion[];
    },
  });
}

export function usePromocionesActivas() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id;
  return useQuery({
    queryKey: ['promociones-activas', empresaId],
    enabled: !!empresaId,
    queryFn: async () => {
      const today = todayInTimezone(empresa?.zona_horaria);

      // Helper: filter list by today's vigencia + activa flag
      const filterVigentes = (list: any[]): Promocion[] => (list || []).filter((p: any) => {
        if (!p.activa) return false;
        const ini = p.vigencia_inicio;
        const fin = p.vigencia_fin;
        if (ini && ini > today) return false;
        if (fin && fin < today) return false;
        return true;
      }).sort((a: any, b: any) => (b.prioridad ?? 0) - (a.prioridad ?? 0)) as Promocion[];

      // Try server first
      try {
        const { data, error } = await supabase
          .from('promociones')
          .select('*')
          .eq('empresa_id', empresaId!)
          .eq('activa', true)
          .or(`vigencia_inicio.is.null,vigencia_inicio.lte.${today}`)
          .or(`vigencia_fin.is.null,vigencia_fin.gte.${today}`)
          .order('prioridad', { ascending: false });
        if (!error && data) {
          // Cache for offline use
          try {
            const all = await supabase.from('promociones').select('*').eq('empresa_id', empresaId!);
            if (all.data) await offlineDb.promociones.bulkPut(all.data);
          } catch { /* ignore */ }
          return data as Promocion[];
        }
      } catch { /* offline / network error → fall through */ }

      // Offline fallback: read from IndexedDB
      try {
        const cached = await offlineDb.promociones.where('empresa_id').equals(empresaId!).toArray();
        return filterVigentes(cached);
      } catch { return [] as Promocion[]; }
    },
  });
}


export function useSavePromocion() {
  const qc = useQueryClient();
  const { empresa } = useAuth();
  return useMutation({
    mutationFn: async (promo: Partial<Promocion> & { id?: string }) => {
      const { id, ...rest } = promo;
      if (id) {
        const { data, error } = await supabase.from('promociones').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        if (!empresa?.id) throw new Error('Sin empresa');
        const { data, error } = await supabase.from('promociones').insert({ ...rest, empresa_id: empresa.id } as any).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promociones'] });
      qc.invalidateQueries({ queryKey: ['promociones-activas'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

export function useDeletePromocion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('promociones').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promociones'] });
      qc.invalidateQueries({ queryKey: ['promociones-activas'] });
    },
    onError: (error: any) => {
      toast.error(error?.message || 'Error inesperado');
    },
  });
}

// ---- Promotion Engine ----

export interface CartItemForPromo {
  producto_id: string;
  clasificacion_id?: string;
  precio_unitario: number;
  cantidad: number;
  es_cambio?: boolean;
}

export interface PromoResult {
  promocion_id: string;
  nombre: string;
  tipo: Promocion['tipo'];
  producto_id?: string;
  descuento: number;
  descripcion: string;
  producto_gratis_id?: string;
  cantidad_gratis?: number;
}

const DIAS_MAP = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * Evaluate which promotions apply to a given cart for a specific client/zone.
 */
export function evaluatePromociones(
  promociones: Promocion[],
  cartItems: CartItemForPromo[],
  clienteId?: string,
  zonaId?: string,
  zonaHoraria?: string,
): PromoResult[] {
  const results: PromoResult[] = [];
  const today = todayInTimezone(zonaHoraria);
  // Día de la semana en la zona horaria de la empresa
  const tz = zonaHoraria || 'America/Mexico_City';
  const diaHoy = (() => {
    try {
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date()).toLowerCase();
      const map: Record<string, string> = {
        sunday: 'domingo', monday: 'lunes', tuesday: 'martes', wednesday: 'miércoles',
        thursday: 'jueves', friday: 'viernes', saturday: 'sábado',
      };
      return map[wd] || DIAS_MAP[new Date().getDay()];
    } catch {
      return DIAS_MAP[new Date().getDay()];
    }
  })();

  const activePromos = promociones
    .filter(p => p.activa)
    .filter(p => !p.vigencia_inicio || p.vigencia_inicio <= today)
    .filter(p => !p.vigencia_fin || p.vigencia_fin >= today)
    .filter(p => {
      const dias = p.dias_semana ?? [];
      return dias.length === 0 || dias.includes(diaHoy);
    })
    .sort((a, b) => b.prioridad - a.prioridad);


  const appliedNonAcumulable = new Set<string>();
  const regalosConsumidos = new Map<string, number>();

  for (const promo of activePromos) {
    const matchingItems = cartItems.filter(item => {
      if (item.es_cambio) return false;
      // Si una promoción NO acumulable ya tomó este producto, ninguna otra
      // promoción puede aplicarse sobre él (sea acumulable o no).
      if (appliedNonAcumulable.has(item.producto_id)) return false;

      switch (promo.aplica_a) {
        case 'todos':
          return true;
        case 'producto':
          return promo.producto_ids.includes(item.producto_id);
        case 'clasificacion':
          return item.clasificacion_id ? promo.clasificacion_ids.includes(item.clasificacion_id) : false;
        case 'cliente':
          return clienteId ? promo.cliente_ids.includes(clienteId) : false;
        case 'zona':
          return zonaId ? promo.zona_ids.includes(zonaId) : false;
        default:
          return false;
      }
    });

    // Las promociones con regalo distinto se calculan globalmente por promo.
    // Cada disparador aporta sus sets, pero el total se topa a las unidades del
    // regalo que realmente están en el carrito. Esto evita tanto perder regalos
    // cuando hay varios disparadores como descontar la misma unidad dos veces.
    if (promo.tipo === 'producto_gratis') {
      const compraMin = Math.max(1, Number(promo.cantidad_minima) || 1);
      const cantGratis = Math.max(1, Number(promo.cantidad_gratis) || 1);
      const freeProductId = promo.producto_gratis_id;

      const triggerItems = freeProductId
        ? matchingItems.filter(item => item.producto_id !== freeProductId)
        : [];

      if (freeProductId && triggerItems.length > 0) {
        const cantidadDisparadora = triggerItems.reduce((sum, item) => sum + item.cantidad, 0);
        const totalGanado = Math.floor(cantidadDisparadora / compraMin) * cantGratis;
        const freeItemInCart = cartItems.find(
          item => item.producto_id === freeProductId && !item.es_cambio,
        );
        const yaConsumidos = regalosConsumidos.get(freeProductId) ?? 0;
        const regalosDisponibles = Math.max(0, (freeItemInCart?.cantidad ?? 0) - yaConsumidos);
        const gratisReal = Math.min(totalGanado, regalosDisponibles);

        if (gratisReal > 0 && freeItemInCart) {
          results.push({
            promocion_id: promo.id,
            nombre: promo.nombre,
            tipo: promo.tipo,
            producto_id: freeProductId,
            descuento: Math.round(gratisReal * freeItemInCart.precio_unitario * 100) / 100,
            descripcion: `${gratisReal}× gratis — ${promo.nombre}`,
            producto_gratis_id: freeProductId,
            cantidad_gratis: gratisReal,
          });
          regalosConsumidos.set(freeProductId, yaConsumidos + gratisReal);
          if (!promo.acumulable) {
            triggerItems.forEach(item => appliedNonAcumulable.add(item.producto_id));
          }
        }
        continue;
      }
    }

    for (const item of matchingItems) {
      const cantMinRaw = Number(promo.cantidad_minima) || 0;
      const cantMinEffective = Math.max(0, cantMinRaw);
      if (item.cantidad < cantMinEffective) continue;

      let descuento = 0;
      let descripcion = '';

      switch (promo.tipo) {
        case 'descuento_porcentaje':
          descuento = item.precio_unitario * item.cantidad * (promo.valor / 100);
          descripcion = `${promo.valor}% desc. — ${promo.nombre}`;
          break;
        case 'descuento_monto':
          descuento = Math.min(promo.valor * item.cantidad, item.precio_unitario * item.cantidad);
          descripcion = `$${promo.valor} desc/u — ${promo.nombre}`;
          break;
        case 'precio_especial':
          descuento = Math.max(0, (item.precio_unitario - promo.valor) * item.cantidad);
          descripcion = `Precio especial $${promo.valor} — ${promo.nombre}`;
          break;
        case 'volumen':
          // Requiere cantidad mínima > 0 y valor > 0 para tener sentido
          if ((promo.cantidad_minima || 0) <= 0 || (promo.valor || 0) <= 0) continue;
          descuento = item.precio_unitario * item.cantidad * (promo.valor / 100);
          descripcion = `${promo.valor}% vol. (${promo.cantidad_minima}+) — ${promo.nombre}`;
          break;

        case 'producto_gratis': {
          const cantGratis = Math.max(1, Number(promo.cantidad_gratis) || 1);
          const compraMin = Math.max(1, cantMinEffective || 1);
          const sets = Math.floor(item.cantidad / compraMin);
          const totalGratis = sets * cantGratis;
          if (totalGratis <= 0) continue;

          // Determinar producto que se regala y su precio
          const freeProductId = promo.producto_gratis_id || item.producto_id;
          const freeItemInCart = cartItems.find(ci => ci.producto_id === freeProductId);
          const precioGratis = freeItemInCart?.precio_unitario ?? item.precio_unitario;

          // Si es un producto DIFERENTE, sólo aplica si está en el carrito con suficiente cantidad
          if (freeProductId !== item.producto_id) {
            if (!freeItemInCart) continue;
            const gratisReal = Math.min(totalGratis, freeItemInCart.cantidad);
            if (gratisReal <= 0) continue;
            descuento = gratisReal * precioGratis;
            descripcion = `${gratisReal}× ${freeProductId === item.producto_id ? '' : 'gratis'} — ${promo.nombre}`;
            results.push({
              promocion_id: promo.id,
              nombre: promo.nombre,
              tipo: promo.tipo,
              producto_id: freeProductId,
              descuento: Math.round(descuento * 100) / 100,
              descripcion,
              producto_gratis_id: freeProductId,
              cantidad_gratis: gratisReal,
            });
          } else {
            descuento = totalGratis * precioGratis;
            descripcion = `${cantGratis}x gratis (${promo.cantidad_minima || 1}×${(promo.cantidad_minima || 1) - cantGratis}) — ${promo.nombre}`;
            results.push({
              promocion_id: promo.id,
              nombre: promo.nombre,
              tipo: promo.tipo,
              producto_id: item.producto_id,
              descuento: Math.round(descuento * 100) / 100,
              descripcion,
              producto_gratis_id: freeProductId,
              cantidad_gratis: totalGratis,
            });
          }
          if (!promo.acumulable) appliedNonAcumulable.add(item.producto_id);
          continue;
        }
      }



      if (descuento > 0) {
        results.push({
          promocion_id: promo.id,
          nombre: promo.nombre,
          tipo: promo.tipo,
          producto_id: item.producto_id,
          descuento: Math.round(descuento * 100) / 100,
          descripcion,
        });
        if (!promo.acumulable) appliedNonAcumulable.add(item.producto_id);
      }
    }
  }

  return results;
}

/**
 * Detecta promociones "producto_gratis" cuyo producto disparador YA está en el
 * carrito con cantidad suficiente pero cuyo producto de regalo (distinto) NO está
 * en el carrito (o está con cantidad insuficiente). Sirve para mostrar un aviso al
 * vendedor de que debe agregar el producto gratis para que se aplique la promo.
 */
export interface PendingProductoGratis {
  promocion_id: string;
  promocion_nombre: string;
  trigger_producto_id: string;
  gratis_producto_id: string;
  cantidad_gratis_faltante: number;
}

export function getPendingProductoGratis(
  promociones: Promocion[],
  cartItems: CartItemForPromo[],
  clienteId?: string,
  zonaId?: string,
  zonaHoraria?: string,
): PendingProductoGratis[] {
  if (!promociones?.length || !cartItems?.length) return [];
  const today = todayInTimezone(zonaHoraria);
  const tz = zonaHoraria || 'America/Mexico_City';
  const diaHoy = (() => {
    try {
      const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date()).toLowerCase();
      const map: Record<string, string> = {
        sunday: 'domingo', monday: 'lunes', tuesday: 'martes', wednesday: 'miércoles',
        thursday: 'jueves', friday: 'viernes', saturday: 'sábado',
      };
      return map[wd] || DIAS_MAP[new Date().getDay()];
    } catch { return DIAS_MAP[new Date().getDay()]; }
  })();

  const active = promociones
    .filter(p => p.activa && p.tipo === 'producto_gratis' && !!p.producto_gratis_id)
    .filter(p => !p.vigencia_inicio || p.vigencia_inicio <= today)
    .filter(p => !p.vigencia_fin || p.vigencia_fin >= today)
    .filter(p => (p.dias_semana ?? []).length === 0 || p.dias_semana.includes(diaHoy));

  const out: PendingProductoGratis[] = [];
  for (const promo of active) {
    const freeId = promo.producto_gratis_id!;
    const triggers = cartItems.filter(item => {
      if (item.es_cambio) return false;
      // Regalo == disparador ⇒ el motor sí lo aplica solo, no hay pendiente
      if (item.producto_id === freeId) return false;
      switch (promo.aplica_a) {
        case 'todos': return true;
        case 'producto': return promo.producto_ids.includes(item.producto_id);
        case 'clasificacion': return item.clasificacion_id ? promo.clasificacion_ids.includes(item.clasificacion_id) : false;
        case 'cliente': return clienteId ? promo.cliente_ids.includes(clienteId) : false;
        case 'zona': return zonaId ? promo.zona_ids.includes(zonaId) : false;
        default: return false;
      }
    });

    for (const item of triggers) {
      const compraMin = Math.max(1, Number(promo.cantidad_minima) || 1);
      const cantGratis = Math.max(1, Number(promo.cantidad_gratis) || 1);
      const sets = Math.floor(item.cantidad / compraMin);
      if (sets <= 0) continue;
      const totalGratis = sets * cantGratis;
      const enCarrito = cartItems.find(ci => ci.producto_id === freeId && !ci.es_cambio)?.cantidad ?? 0;
      const faltante = totalGratis - enCarrito;
      if (faltante <= 0) continue;
      // Evitar duplicados por promo+trigger
      if (out.some(o => o.promocion_id === promo.id && o.trigger_producto_id === item.producto_id)) continue;
      out.push({
        promocion_id: promo.id,
        promocion_nombre: promo.nombre,
        trigger_producto_id: item.producto_id,
        gratis_producto_id: freeId,
        cantidad_gratis_faltante: faltante,
      });
    }
  }
  return out;
}

