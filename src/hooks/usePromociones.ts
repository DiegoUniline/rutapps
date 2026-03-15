import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

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
  prioridad: number;
  acumulable: boolean;
  created_at: string;
}

export function usePromociones() {
  return useQuery({
    queryKey: ['promociones'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('promociones')
        .select('*')
        .order('prioridad', { ascending: false });
      if (error) throw error;
      return data as Promocion[];
    },
  });
}

export function usePromocionesActivas() {
  return useQuery({
    queryKey: ['promociones-activas'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('promociones')
        .select('*')
        .eq('activa', true)
        .or(`vigencia_inicio.is.null,vigencia_inicio.lte.${today}`)
        .or(`vigencia_fin.is.null,vigencia_fin.gte.${today}`)
        .order('prioridad', { ascending: false });
      if (error) throw error;
      return data as Promocion[];
    },
  });
}

export function useSavePromocion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (promo: Partial<Promocion> & { id?: string }) => {
      const { id, ...rest } = promo;
      if (id) {
        const { data, error } = await supabase.from('promociones').update(rest).eq('id', id).select().single();
        if (error) throw error;
        return data;
      } else {
        const { data: profile } = await supabase.from('profiles').select('empresa_id').single();
        const { data, error } = await supabase.from('promociones').insert({ ...rest, empresa_id: profile!.empresa_id }).select().single();
        if (error) throw error;
        return data;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promociones'] });
      qc.invalidateQueries({ queryKey: ['promociones-activas'] });
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
  descuento: number; // total discount amount for this promo application
  descripcion: string;
  producto_gratis_id?: string;
  cantidad_gratis?: number;
}

/**
 * Evaluate which promotions apply to a given cart for a specific client/zone.
 */
export function evaluatePromociones(
  promociones: Promocion[],
  cartItems: CartItemForPromo[],
  clienteId?: string,
  zonaId?: string,
): PromoResult[] {
  const results: PromoResult[] = [];
  const today = new Date().toISOString().split('T')[0];

  const activePromos = promociones
    .filter(p => p.activa)
    .filter(p => !p.vigencia_inicio || p.vigencia_inicio <= today)
    .filter(p => !p.vigencia_fin || p.vigencia_fin >= today)
    .sort((a, b) => b.prioridad - a.prioridad);

  const appliedNonAcumulable = new Set<string>(); // producto_ids that already got a non-stackable promo

  for (const promo of activePromos) {
    // Check scope
    const matchingItems = cartItems.filter(item => {
      if (item.es_cambio) return false;
      if (!promo.acumulable && appliedNonAcumulable.has(item.producto_id)) return false;

      // Check aplica_a scope
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

    for (const item of matchingItems) {
      if (item.cantidad < (promo.cantidad_minima || 0)) continue;

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
          descuento = item.precio_unitario * item.cantidad * (promo.valor / 100);
          descripcion = `${promo.valor}% vol. (${promo.cantidad_minima}+) — ${promo.nombre}`;
          break;
        case 'producto_gratis':
          descuento = 0;
          descripcion = `${promo.cantidad_gratis}x gratis — ${promo.nombre}`;
          results.push({
            promocion_id: promo.id,
            nombre: promo.nombre,
            tipo: promo.tipo,
            producto_id: item.producto_id,
            descuento: 0,
            descripcion,
            producto_gratis_id: promo.producto_gratis_id || item.producto_id,
            cantidad_gratis: promo.cantidad_gratis || 1,
          });
          if (!promo.acumulable) appliedNonAcumulable.add(item.producto_id);
          continue;
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
