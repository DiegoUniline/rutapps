import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { todayInTimezone } from '@/lib/utils';
import { offlineDb } from '@/lib/offlineDb';
import { isPromotionCacheUsable } from '@/lib/offlinePromotionSafety';


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
  /** 'todas' (default, histórico) o 'especifica' = solo renglones cotizados con `lista_precio_id`. */
  alcance_lista?: 'todas' | 'especifica';
  lista_precio_id?: string | null;
  /** 'por_sku' (default, histórico) o 'acumulado' = suma de los SKU de `participantes_ids`. */
  modo_minimo?: 'por_sku' | 'acumulado';
  participantes_ids?: string[];
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
    // Si no se pudieron cargar, reintentar: NUNCA vender sin promociones por
    // un fallo de red silencioso.
    retry: (failureCount) => (typeof navigator === 'undefined' || navigator.onLine) && failureCount < 3,
    refetchOnReconnect: true,
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

      // Try server first sólo cuando el navegador reporta conexión. En un
      // arranque offline no esperamos timeouts ni gastamos reintentos.
      let serverFailed = false;
      const shouldTryServer = typeof navigator === 'undefined' || navigator.onLine;
      try {
        if (!shouldTryServer) throw new Error('Sin conexión');
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
            if (all.error) throw all.error;
            if (all.data) {
              const allRows = all.data as Promocion[];
              const now = Date.now();
              const previous = await offlineDb.cacheTimestamps.get('promociones');
              await offlineDb.transaction('rw', offlineDb.promociones, offlineDb.cacheTimestamps, async () => {
                await offlineDb.promociones.where('empresa_id').equals(empresaId!).delete();
                if (allRows.length > 0) await offlineDb.promociones.bulkPut(allRows);
                await offlineDb.cacheTimestamps.put({
                  ...previous,
                  table: 'promociones',
                  lastSync: now,
                  lastSuccessAt: now,
                  lastFullAt: now,
                  rowCount: allRows.length,
                  lastError: undefined,
                  lastErrorAt: undefined,
                });
              });
            }
          } catch { /* ignore */ }
          return data as Promocion[];
        }
        serverFailed = true;
      } catch { serverFailed = true; }

      // Offline fallback: read from IndexedDB
      let cached: Promocion[] = [];
      let cacheFailed = false;
      let lastSuccessfulSyncAt: number | null = null;
      try {
        const [rows, timestamp] = await Promise.all([
          offlineDb.promociones.where('empresa_id').equals(empresaId!).toArray(),
          offlineDb.cacheTimestamps.get('promociones'),
        ]);
        cached = rows;
        lastSuccessfulSyncAt = timestamp?.lastSuccessAt ?? timestamp?.lastSync ?? null;
      } catch { cacheFailed = true; }

      // CRÍTICO: si el servidor falló y la caché local está vacía o rota, NO
      // devolver [] (eso hacía que la venta se guardara SIN promociones y sin
      // ningún aviso). Se lanza el error para que la query quede en estado
      // "error" y la pantalla de venta pueda bloquear/avisar.
      if (serverFailed && !isPromotionCacheUsable({
        cacheReadFailed: cacheFailed,
        cachedRowCount: cached.length,
        lastSuccessfulSyncAt,
      })) {
        throw new Error('No se pudieron cargar las promociones');
      }
      return filterVigentes(cached);
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
  /**
   * Lista de precios con la que se calculó el precio de ESTE renglón
   * (`lista_precios.id`). `null` = sin lista o precio manual. Las promociones
   * exclusivas de una lista solo consideran renglones con ese identificador.
   */
  lista_precio_id?: string | null;
  /**
   * Identidad del renglón cuando el mismo SKU puede repetirse en el carrito
   * (p. ej. con distinta lista). Si se omite, el renglón se identifica por
   * `producto_id` (comportamiento histórico).
   */
  linea_key?: string;
}

export interface PromoResult {
  promocion_id: string;
  nombre: string;
  tipo: Promocion['tipo'];
  producto_id?: string;
  /** Renglón al que corresponde el beneficio (solo si el carrito lo envió). */
  linea_key?: string;
  descuento: number;
  descripcion: string;
  producto_gratis_id?: string;
  cantidad_gratis?: number;
}

const DIAS_MAP = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const r2 = (n: number) => Math.round(n * 100) / 100;

function diaHoyEn(zonaHoraria?: string): string {
  const tz = zonaHoraria || 'America/Mexico_City';
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
}

function promosVigentesHoy(promociones: Promocion[], zonaHoraria?: string): Promocion[] {
  const today = todayInTimezone(zonaHoraria);
  const diaHoy = diaHoyEn(zonaHoraria);
  return promociones
    .filter(p => p.activa)
    .filter(p => !p.vigencia_inicio || p.vigencia_inicio <= today)
    .filter(p => !p.vigencia_fin || p.vigencia_fin >= today)
    .filter(p => {
      const dias = p.dias_semana ?? [];
      return dias.length === 0 || dias.includes(diaHoy);
    })
    .sort((a, b) => b.prioridad - a.prioridad);
}

/** Identidad del renglón para bloqueos y regalos consumidos. */
export function lineaKeyPromo(item: CartItemForPromo): string {
  return item.linea_key ?? item.producto_id;
}

/** ¿La promoción aplica a la lista con la que se cotizó el renglón? (por id, nunca por importe) */
export function promoCubreLista(promo: Pick<Promocion, 'alcance_lista' | 'lista_precio_id'>, item: Pick<CartItemForPromo, 'lista_precio_id'>): boolean {
  if ((promo.alcance_lista ?? 'todas') !== 'especifica') return true;
  return !!promo.lista_precio_id && !!item.lista_precio_id && item.lista_precio_id === promo.lista_precio_id;
}

export function esPromoAcumulada(promo: Pick<Promocion, 'modo_minimo'>): boolean {
  return promo.modo_minimo === 'acumulado';
}

function itemCubierto(promo: Promocion, item: CartItemForPromo, clienteId?: string, zonaId?: string): boolean {
  if (item.es_cambio) return false;
  if (!promoCubreLista(promo, item)) return false;
  switch (promo.aplica_a) {
    case 'todos': return true;
    case 'producto': return (promo.producto_ids ?? []).includes(item.producto_id);
    case 'clasificacion': return item.clasificacion_id ? (promo.clasificacion_ids ?? []).includes(item.clasificacion_id) : false;
    case 'cliente': return clienteId ? (promo.cliente_ids ?? []).includes(clienteId) : false;
    case 'zona': return zonaId ? (promo.zona_ids ?? []).includes(zonaId) : false;
    default: return false;
  }
}

/** SKU participantes de una promoción acumulada (selección explícita). */
function esParticipante(promo: Promocion, item: CartItemForPromo): boolean {
  return (promo.participantes_ids ?? []).includes(item.producto_id);
}

/** Descuento de un renglón para los tipos que no son regalo (fórmulas históricas). */
function descuentoRenglon(promo: Promocion, item: CartItemForPromo): { descuento: number; descripcion: string } | null {
  switch (promo.tipo) {
    case 'descuento_porcentaje':
      return { descuento: item.precio_unitario * item.cantidad * (promo.valor / 100), descripcion: `${promo.valor}% desc. — ${promo.nombre}` };
    case 'descuento_monto':
      return { descuento: Math.min(promo.valor * item.cantidad, item.precio_unitario * item.cantidad), descripcion: `$${promo.valor} desc/u — ${promo.nombre}` };
    case 'precio_especial':
      return { descuento: Math.max(0, (item.precio_unitario - promo.valor) * item.cantidad), descripcion: `Precio especial $${promo.valor} — ${promo.nombre}` };
    case 'volumen':
      // Requiere cantidad mínima > 0 y valor > 0 para tener sentido
      if ((promo.cantidad_minima || 0) <= 0 || (promo.valor || 0) <= 0) return null;
      return { descuento: item.precio_unitario * item.cantidad * (promo.valor / 100), descripcion: `${promo.valor}% vol. (${promo.cantidad_minima}+) — ${promo.nombre}` };
    default:
      return null;
  }
}

/**
 * Sets de regalo en modo acumulado. Las unidades regaladas que salen de
 * renglones del propio grupo NO cuentan para el mínimo de compra: se busca el
 * mayor número de sets tal que (unidades del grupo − regalo tomado del grupo)
 * ≥ sets × mínimo. El regalo se toma primero de renglones fuera del grupo.
 * Se repite por cada múltiplo del mínimo (misma regla que el regalo por SKU).
 */
export function calcularRegaloAcumulado(args: {
  cantidadGrupo: number;
  disponibleEnGrupo: number;
  disponibleFuera: number;
  compraMin: number;
  cantGratis: number;
}): { sets: number; gratis: number; deFuera: number; delGrupo: number; pagadas: number } {
  const { cantidadGrupo, disponibleEnGrupo, disponibleFuera, compraMin, cantGratis } = args;
  for (let s = Math.floor(cantidadGrupo / compraMin); s > 0; s--) {
    const pedido = s * cantGratis;
    const deFuera = Math.min(pedido, Math.max(0, disponibleFuera));
    const delGrupo = Math.min(pedido - deFuera, Math.max(0, disponibleEnGrupo));
    const pagadas = cantidadGrupo - delGrupo;
    if (pagadas >= s * compraMin) return { sets: s, gratis: deFuera + delGrupo, deFuera, delGrupo, pagadas };
  }
  return { sets: 0, gratis: 0, deFuera: 0, delGrupo: 0, pagadas: cantidadGrupo };
}

type RegaloAcumuladoPlan = {
  grupo: CartItemForPromo[];
  cantidadGrupo: number;
  compraMin: number;
  cantGratis: number;
  calc: ReturnType<typeof calcularRegaloAcumulado>;
  asignacion: { item: CartItemForPromo; unidades: number }[];
};

/** Arma el plan de regalo acumulado (sin efectos): qué renglones regalan cuántas unidades. */
function planRegaloAcumulado(
  promo: Promocion,
  grupo: CartItemForPromo[],
  cartItems: CartItemForPromo[],
  consumidos: Map<string, number>,
): RegaloAcumuladoPlan | null {
  const freeId = promo.producto_gratis_id;
  // En modo acumulado el regalo debe ser explícito: nunca se asume que
  // cualquier SKU del grupo puede regalarse.
  if (!freeId) return null;
  const compraMin = Math.max(1, Number(promo.cantidad_minima) || 1);
  const cantGratis = Math.max(1, Number(promo.cantidad_gratis) || 1);
  const enGrupo = new Set(grupo.map(lineaKeyPromo));
  const disponible = (it: CartItemForPromo) => Math.max(0, it.cantidad - (consumidos.get(lineaKeyPromo(it)) ?? 0));

  // Unidades que ya regaló otra promoción tampoco cuentan para el mínimo.
  const cantidadGrupo = grupo.reduce((s, it) => s + (it.producto_id === freeId ? disponible(it) : it.cantidad), 0);
  const lineasRegalo = cartItems.filter(it => it.producto_id === freeId && !it.es_cambio);
  const fuera = lineasRegalo.filter(it => !enGrupo.has(lineaKeyPromo(it)));
  const dentro = lineasRegalo.filter(it => enGrupo.has(lineaKeyPromo(it)));
  const calc = calcularRegaloAcumulado({
    cantidadGrupo,
    disponibleEnGrupo: dentro.reduce((s, it) => s + disponible(it), 0),
    disponibleFuera: fuera.reduce((s, it) => s + disponible(it), 0),
    compraMin,
    cantGratis,
  });

  const asignacion: { item: CartItemForPromo; unidades: number }[] = [];
  const repartir = (lineas: CartItemForPromo[], total: number) => {
    let resto = total;
    for (const it of lineas) {
      if (resto <= 0) break;
      const u = Math.min(resto, disponible(it));
      if (u > 0) { asignacion.push({ item: it, unidades: u }); resto -= u; }
    }
  };
  repartir(fuera, calc.deFuera);
  repartir(dentro, calc.delGrupo);
  return { grupo, cantidadGrupo, compraMin, cantGratis, calc, asignacion };
}

/**
 * Evaluate which promotions apply to a given cart for a specific client/zone.
 *
 * Condición y beneficio están separados:
 *  - Condición: renglones elegibles (alcance `aplica_a`, lista de precios y,
 *    en modo acumulado, SKU participantes) y cantidad mínima — por renglón
 *    (`por_sku`, histórico) o sumando los participantes (`acumulado`).
 *  - Beneficio: descuento sobre la base real de cada renglón elegible, o
 *    unidades del SKU de regalo configurado.
 * Es una función pura: recalcular N veces con el mismo carrito da lo mismo.
 */
export function evaluatePromociones(
  promociones: Promocion[],
  cartItems: CartItemForPromo[],
  clienteId?: string,
  zonaId?: string,
  zonaHoraria?: string,
): PromoResult[] {
  const results: PromoResult[] = [];
  const activePromos = promosVigentesHoy(promociones, zonaHoraria);

  // Renglones tomados por una promoción NO acumulable: ninguna otra promoción
  // puede aplicarse sobre ellos (sea acumulable o no).
  const appliedNonAcumulable = new Set<string>();
  // Unidades de regalo ya otorgadas por renglón.
  const regalosConsumidos = new Map<string, number>();
  const conLinea = (item: CartItemForPromo) => (item.linea_key ? { linea_key: item.linea_key } : {});

  for (const promo of activePromos) {
    const matchingItems = cartItems.filter(item =>
      !appliedNonAcumulable.has(lineaKeyPromo(item)) && itemCubierto(promo, item, clienteId, zonaId),
    );

    // ── Modo acumulado: la suma de los SKU participantes alcanza el mínimo ──
    if (esPromoAcumulada(promo)) {
      const grupo = matchingItems.filter(item => esParticipante(promo, item) && item.cantidad > 0);
      if (grupo.length === 0) continue;

      if (promo.tipo === 'producto_gratis') {
        const plan = planRegaloAcumulado(promo, grupo, cartItems, regalosConsumidos);
        if (!plan || plan.calc.gratis <= 0) continue;
        for (const { item, unidades } of plan.asignacion) {
          results.push({
            promocion_id: promo.id,
            nombre: promo.nombre,
            tipo: promo.tipo,
            producto_id: item.producto_id,
            ...conLinea(item),
            descuento: r2(unidades * item.precio_unitario),
            descripcion: `${unidades}× gratis — ${promo.nombre}`,
            producto_gratis_id: item.producto_id,
            cantidad_gratis: unidades,
          });
          const k = lineaKeyPromo(item);
          regalosConsumidos.set(k, (regalosConsumidos.get(k) ?? 0) + unidades);
        }
        if (!promo.acumulable) grupo.forEach(item => appliedNonAcumulable.add(lineaKeyPromo(item)));
        continue;
      }

      const minimo = Math.max(0, Number(promo.cantidad_minima) || 0);
      const cantidadGrupo = grupo.reduce((s, item) => s + item.cantidad, 0);
      if (cantidadGrupo < minimo) continue;
      for (const item of grupo) {
        const d = descuentoRenglon(promo, item);
        if (!d || d.descuento <= 0) continue;
        results.push({
          promocion_id: promo.id,
          nombre: promo.nombre,
          tipo: promo.tipo,
          producto_id: item.producto_id,
          ...conLinea(item),
          descuento: r2(d.descuento),
          descripcion: d.descripcion,
        });
        if (!promo.acumulable) appliedNonAcumulable.add(lineaKeyPromo(item));
      }
      continue;
    }

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
        const freeKey = freeItemInCart ? lineaKeyPromo(freeItemInCart) : freeProductId;
        const yaConsumidos = regalosConsumidos.get(freeKey) ?? 0;
        const regalosDisponibles = Math.max(0, (freeItemInCart?.cantidad ?? 0) - yaConsumidos);
        const gratisReal = Math.min(totalGanado, regalosDisponibles);

        if (gratisReal > 0 && freeItemInCart) {
          results.push({
            promocion_id: promo.id,
            nombre: promo.nombre,
            tipo: promo.tipo,
            producto_id: freeProductId,
            ...conLinea(freeItemInCart),
            descuento: r2(gratisReal * freeItemInCart.precio_unitario),
            descripcion: `${gratisReal}× gratis — ${promo.nombre}`,
            producto_gratis_id: freeProductId,
            cantidad_gratis: gratisReal,
          });
          regalosConsumidos.set(freeKey, yaConsumidos + gratisReal);
          if (!promo.acumulable) {
            triggerItems.forEach(item => appliedNonAcumulable.add(lineaKeyPromo(item)));
          }
        }
        continue;
      }
    }

    for (const item of matchingItems) {
      const cantMinRaw = Number(promo.cantidad_minima) || 0;
      const cantMinEffective = Math.max(0, cantMinRaw);
      if (item.cantidad < cantMinEffective) continue;

      if (promo.tipo === 'producto_gratis') {
        const cantGratis = Math.max(1, Number(promo.cantidad_gratis) || 1);
        const compraMin = Math.max(1, cantMinEffective || 1);
        const sets = Math.floor(item.cantidad / compraMin);
        const totalGratis = sets * cantGratis;
        if (totalGratis <= 0) continue;

        // Determinar producto que se regala y su precio
        const freeProductId = promo.producto_gratis_id || item.producto_id;
        const freeItemInCart = freeProductId === item.producto_id
          ? item
          : cartItems.find(ci => ci.producto_id === freeProductId);
        const precioGratis = freeItemInCart?.precio_unitario ?? item.precio_unitario;

        // Si es un producto DIFERENTE, sólo aplica si está en el carrito con suficiente cantidad
        if (freeProductId !== item.producto_id) {
          if (!freeItemInCart) continue;
          const gratisReal = Math.min(totalGratis, freeItemInCart.cantidad);
          if (gratisReal <= 0) continue;
          results.push({
            promocion_id: promo.id,
            nombre: promo.nombre,
            tipo: promo.tipo,
            producto_id: freeProductId,
            ...conLinea(freeItemInCart),
            descuento: r2(gratisReal * precioGratis),
            descripcion: `${gratisReal}× gratis — ${promo.nombre}`,
            producto_gratis_id: freeProductId,
            cantidad_gratis: gratisReal,
          });
        } else {
          results.push({
            promocion_id: promo.id,
            nombre: promo.nombre,
            tipo: promo.tipo,
            producto_id: item.producto_id,
            ...conLinea(item),
            descuento: r2(totalGratis * precioGratis),
            descripcion: `${cantGratis}x gratis (${promo.cantidad_minima || 1}×${(promo.cantidad_minima || 1) - cantGratis}) — ${promo.nombre}`,
            producto_gratis_id: freeProductId,
            cantidad_gratis: totalGratis,
          });
        }
        if (!promo.acumulable) appliedNonAcumulable.add(lineaKeyPromo(item));
        continue;
      }

      const d = descuentoRenglon(promo, item);
      if (d && d.descuento > 0) {
        results.push({
          promocion_id: promo.id,
          nombre: promo.nombre,
          tipo: promo.tipo,
          producto_id: item.producto_id,
          ...conLinea(item),
          descuento: r2(d.descuento),
          descripcion: d.descripcion,
        });
        if (!promo.acumulable) appliedNonAcumulable.add(lineaKeyPromo(item));
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

  const active = promosVigentesHoy(promociones, zonaHoraria)
    .filter(p => p.tipo === 'producto_gratis' && !!p.producto_gratis_id);

  const out: PendingProductoGratis[] = [];
  for (const promo of active) {
    const freeId = promo.producto_gratis_id!;
    const cubiertos = cartItems.filter(item => itemCubierto(promo, item, clienteId, zonaId));

    if (esPromoAcumulada(promo)) {
      const grupo = cubiertos.filter(item => esParticipante(promo, item) && item.cantidad > 0);
      if (grupo.length === 0) continue;
      const plan = planRegaloAcumulado(promo, grupo, cartItems, new Map());
      if (!plan) continue;
      // Sets ganados con las unidades PAGADAS; el regalo que falta se agrega
      // aparte y nunca cuenta para el mínimo (converge al auto-agregarlo).
      const ganados = Math.floor(plan.calc.pagadas / plan.compraMin) * plan.cantGratis;
      const faltante = ganados - plan.calc.gratis;
      if (faltante <= 0) continue;
      out.push({
        promocion_id: promo.id,
        promocion_nombre: promo.nombre,
        trigger_producto_id: (grupo.find(it => it.producto_id !== freeId) ?? grupo[0]).producto_id,
        gratis_producto_id: freeId,
        cantidad_gratis_faltante: faltante,
      });
      continue;
    }

    // Regalo == disparador ⇒ el motor sí lo aplica solo, no hay pendiente.
    const triggers = cubiertos.filter(item => item.producto_id !== freeId);
    if (triggers.length === 0) continue;
    // Mismo cálculo global que `evaluatePromociones`: los disparadores suman.
    const compraMin = Math.max(1, Number(promo.cantidad_minima) || 1);
    const cantGratis = Math.max(1, Number(promo.cantidad_gratis) || 1);
    const sets = Math.floor(triggers.reduce((s, item) => s + item.cantidad, 0) / compraMin);
    if (sets <= 0) continue;
    const enCarrito = cartItems.find(ci => ci.producto_id === freeId && !ci.es_cambio)?.cantidad ?? 0;
    const faltante = sets * cantGratis - enCarrito;
    if (faltante <= 0) continue;
    out.push({
      promocion_id: promo.id,
      promocion_nombre: promo.nombre,
      trigger_producto_id: triggers[0].producto_id,
      gratis_producto_id: freeId,
      cantidad_gratis_faltante: faltante,
    });
  }
  return out;
}
