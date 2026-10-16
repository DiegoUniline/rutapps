import { describe, expect, it } from 'vitest';
import {
  evaluatePromociones,
  getPendingProductoGratis,
  calcularRegaloAcumulado,
  type CartItemForPromo,
  type Promocion,
} from '@/hooks/usePromociones';
import { aplicarPromoALinea, separarDescuentoPromo } from '@/lib/promoLinea';
import { buildPromoAplicadaRows } from '@/lib/promoPersist';
import { promosPersistidasDeVenta } from '@/lib/promoHistorico';
import { getTicketTotalsSummary } from '@/lib/ticketHtml';

const MAYOREO = 'lista-mayoreo';
const MENUDEO = 'lista-menudeo';
const SABORES = ['fresa', 'mango', 'limon'];

const promo = (overrides: Partial<Promocion> = {}): Promocion => ({
  id: 'promo-mix',
  empresa_id: 'empresa',
  nombre: 'Mix 6 sabores',
  descripcion: null,
  tipo: 'descuento_porcentaje',
  aplica_a: 'todos',
  activa: true,
  valor: 10,
  cantidad_minima: 6,
  cantidad_gratis: 0,
  producto_gratis_id: null,
  producto_ids: [],
  clasificacion_ids: [],
  cliente_ids: [],
  zona_ids: [],
  vigencia_inicio: null,
  vigencia_fin: null,
  dias_semana: [],
  prioridad: 1,
  acumulable: false,
  created_at: '2026-10-01T00:00:00Z',
  alcance_lista: 'todas',
  lista_precio_id: null,
  modo_minimo: 'acumulado',
  participantes_ids: SABORES,
  ...overrides,
});

const item = (producto_id: string, cantidad: number, precio_unitario: number, lista_precio_id: string | null = MAYOREO): CartItemForPromo => ({
  producto_id, cantidad, precio_unitario, lista_precio_id,
});

const sum = (xs: { descuento: number }[]) => Math.round(xs.reduce((s, x) => s + x.descuento, 0) * 100) / 100;

describe('promoción exclusiva por lista de precios', () => {
  const soloMayoreo = promo({ modo_minimo: 'por_sku', cantidad_minima: 0, alcance_lista: 'especifica', lista_precio_id: MAYOREO, aplica_a: 'producto', producto_ids: ['fresa'] });

  it('aplica con la lista autorizada', () => {
    const r = evaluatePromociones([soloMayoreo], [item('fresa', 2, 20, MAYOREO)]);
    expect(r).toHaveLength(1);
    expect(r[0].descuento).toBe(4);
  });

  it('no aplica con otra lista ni sin lista (precio manual)', () => {
    expect(evaluatePromociones([soloMayoreo], [item('fresa', 2, 20, MENUDEO)])).toHaveLength(0);
    expect(evaluatePromociones([soloMayoreo], [item('fresa', 2, 20, null)])).toHaveLength(0);
  });

  it('el cambio de lista recalcula: aplica, se retira y vuelve', () => {
    const cart = [item('fresa', 2, 20, MAYOREO)];
    expect(evaluatePromociones([soloMayoreo], cart)).toHaveLength(1);
    expect(evaluatePromociones([soloMayoreo], [{ ...cart[0], lista_precio_id: MENUDEO }])).toHaveLength(0);
    expect(evaluatePromociones([soloMayoreo], cart)).toHaveLength(1);
  });

  it('se identifica por id, no por importe (mismo precio en otra lista no aplica)', () => {
    expect(evaluatePromociones([soloMayoreo], [item('fresa', 2, 20, MENUDEO)])).toHaveLength(0);
  });

  it('alcance específico sin lista (lista eliminada) no aplica a nada', () => {
    expect(evaluatePromociones([{ ...soloMayoreo, lista_precio_id: null }], [item('fresa', 2, 20, MAYOREO)])).toHaveLength(0);
  });

  it('con renglones de distintas listas solo cuentan los de la lista elegible', () => {
    const p = promo({ alcance_lista: 'especifica', lista_precio_id: MAYOREO });
    const cart: CartItemForPromo[] = [
      { ...item('fresa', 4, 20, MAYOREO), linea_key: 'l1' },
      { ...item('fresa', 2, 22, MENUDEO), linea_key: 'l2' },
      { ...item('mango', 1, 25, MAYOREO), linea_key: 'l3' },
    ];
    expect(evaluatePromociones([p], cart)).toHaveLength(0); // 4 + 1 = 5 < 6
    cart[2] = { ...cart[2], cantidad: 2 }; // 4 + 2 = 6
    const r = evaluatePromociones([p], cart);
    expect(r.map(x => x.linea_key).sort()).toEqual(['l1', 'l3']);
    expect(sum(r)).toBe(Math.round((80 * 0.1 + 50 * 0.1) * 100) / 100);
  });
});

describe('mínimo acumulado entre SKU participantes', () => {
  it('un solo SKU alcanza el mínimo', () => {
    const r = evaluatePromociones([promo()], [item('fresa', 6, 20)]);
    expect(r).toHaveLength(1);
    expect(r[0].descuento).toBe(12);
  });

  it('varios SKU alcanzan juntos el mínimo y el % se aplica sobre cada base real', () => {
    const r = evaluatePromociones([promo()], [
      item('fresa', 2, 20),
      item('mango', 3, 25),
      item('limon', 1, 30),
    ]);
    expect(r.map(x => [x.producto_id, x.descuento])).toEqual([
      ['fresa', 4], ['mango', 7.5], ['limon', 3],
    ]);
  });

  it('la suma por debajo del mínimo no aplica', () => {
    expect(evaluatePromociones([promo()], [item('fresa', 2, 20), item('mango', 3, 25)])).toHaveLength(0);
  });

  it('un SKU ajeno no suma ni recibe descuento', () => {
    expect(evaluatePromociones([promo()], [item('fresa', 2, 20), item('mango', 3, 25), item('agua', 10, 10)])).toHaveLength(0);
    const r = evaluatePromociones([promo()], [item('fresa', 3, 20), item('mango', 3, 25), item('agua', 10, 10)]);
    expect(r.some(x => x.producto_id === 'agua')).toBe(false);
  });

  it('descuento por unidad y precio especial respetan cada renglón y su tope', () => {
    const monto = evaluatePromociones([promo({ tipo: 'descuento_monto', valor: 3 })], [item('fresa', 4, 2), item('mango', 2, 25)]);
    expect(monto.map(x => x.descuento)).toEqual([8, 6]); // fresa topado a su importe (4 × 2)
    const especial = evaluatePromociones([promo({ tipo: 'precio_especial', valor: 18 })], [item('fresa', 4, 20), item('mango', 2, 25)]);
    expect(especial.map(x => x.descuento)).toEqual([8, 14]);
  });

  it('no fusiona productos: un resultado por SKU con su propio importe', () => {
    const r = evaluatePromociones([promo()], [item('fresa', 3, 19.99), item('mango', 3, 24.5)]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ producto_id: 'fresa', descuento: 6 });
    expect(r[1]).toMatchObject({ producto_id: 'mango', descuento: 7.35 });
  });

  it('las promociones por SKU existentes siguen evaluando por renglón', () => {
    const porSku = promo({ modo_minimo: 'por_sku', aplica_a: 'producto', producto_ids: SABORES });
    expect(evaluatePromociones([porSku], [item('fresa', 3, 20), item('mango', 3, 25)])).toHaveLength(0);
    expect(evaluatePromociones([porSku], [item('fresa', 6, 20)])).toHaveLength(1);
    // promociones sin los campos nuevos (filas previas a la migración)
    const legacy = { ...porSku } as Partial<Promocion>;
    delete legacy.alcance_lista; delete legacy.lista_precio_id; delete legacy.modo_minimo; delete legacy.participantes_ids;
    expect(evaluatePromociones([legacy as Promocion], [{ producto_id: 'fresa', cantidad: 6, precio_unitario: 20 }])).toHaveLength(1);
  });

  it('las mismas unidades no reciben beneficios incompatibles (no acumulable)', () => {
    const acumulada = promo({ prioridad: 10 });
    const porSku = promo({ id: 'promo-sku', modo_minimo: 'por_sku', cantidad_minima: 0, valor: 50, prioridad: 1, acumulable: true });
    const r = evaluatePromociones([acumulada, porSku], [item('fresa', 3, 20), item('mango', 3, 25), item('agua', 1, 10)]);
    expect(r.filter(x => x.promocion_id === 'promo-sku').map(x => x.producto_id)).toEqual(['agua']);
  });
});

describe('regalo en modo acumulado', () => {
  const regalo = promo({ tipo: 'producto_gratis', valor: 0, cantidad_minima: 6, cantidad_gratis: 1, producto_gratis_id: 'vaso' });

  it('regala el SKU configurado una sola vez por múltiplo y no lo agrega de más', () => {
    const cart = [item('fresa', 2, 20), item('mango', 3, 25), item('limon', 1, 30), item('vaso', 3, 12)];
    const r = evaluatePromociones([regalo], cart);
    expect(r).toEqual([expect.objectContaining({ producto_id: 'vaso', cantidad_gratis: 1, descuento: 12 })]);
    // Recalcular varias veces no acumula
    expect(evaluatePromociones([regalo], cart)).toEqual(r);
    expect(getPendingProductoGratis([regalo], cart)).toEqual([]);
  });

  it('se repite por cada múltiplo del mínimo y avisa el regalo faltante', () => {
    const cart = [item('fresa', 6, 20), item('mango', 6, 25), item('vaso', 1, 12)];
    expect(evaluatePromociones([regalo], cart)[0].cantidad_gratis).toBe(1);
    expect(getPendingProductoGratis([regalo], cart)).toEqual([
      expect.objectContaining({ gratis_producto_id: 'vaso', cantidad_gratis_faltante: 1 }),
    ]);
  });

  it('no regala productos del grupo si el regalo no está configurado', () => {
    expect(evaluatePromociones([{ ...regalo, producto_gratis_id: null }], [item('fresa', 7, 20)])).toHaveLength(0);
  });

  it('el regalo dentro del grupo no cuenta para el mínimo', () => {
    const regaloFresa = { ...regalo, producto_gratis_id: 'fresa' };
    // 6 unidades: si una fuera gratis solo se pagarían 5 → no alcanza.
    expect(evaluatePromociones([regaloFresa], [item('fresa', 2, 20), item('mango', 3, 25), item('limon', 1, 30)])).toHaveLength(0);
    const pend = getPendingProductoGratis([regaloFresa], [item('fresa', 2, 20), item('mango', 3, 25), item('limon', 1, 30)]);
    expect(pend[0]).toMatchObject({ gratis_producto_id: 'fresa', cantidad_gratis_faltante: 1 });
    // Agregar el regalo (7 unidades) → 6 pagadas + 1 gratis; ya no hay pendiente.
    const cart7 = [item('fresa', 3, 20), item('mango', 3, 25), item('limon', 1, 30)];
    expect(evaluatePromociones([regaloFresa], cart7)).toEqual([expect.objectContaining({ producto_id: 'fresa', cantidad_gratis: 1, descuento: 20 })]);
    expect(getPendingProductoGratis([regaloFresa], cart7)).toEqual([]);
  });

  it('el auto-agregado del regalo converge (nunca agrega de más)', () => {
    const regaloFresa = { ...regalo, cantidad_minima: 1, producto_gratis_id: 'fresa' };
    let fresa = 1;
    for (let i = 0; i < 5; i++) {
      const pend = getPendingProductoGratis([regaloFresa], [item('fresa', fresa, 20)]);
      if (pend.length === 0) break;
      fresa += pend[0].cantidad_gratis_faltante;
    }
    expect(fresa).toBe(2); // 1 pagada + 1 gratis
  });

  it('reducir la compra retira el regalo', () => {
    const cart = [item('fresa', 2, 20), item('mango', 3, 25), item('limon', 1, 30), item('vaso', 1, 12)];
    expect(evaluatePromociones([regalo], cart)).toHaveLength(1);
    cart[1] = { ...cart[1], cantidad: 2 };
    expect(evaluatePromociones([regalo], cart)).toHaveLength(0);
  });

  it('calcularRegaloAcumulado busca el mayor número de sets válido', () => {
    expect(calcularRegaloAcumulado({ cantidadGrupo: 13, disponibleEnGrupo: 8, disponibleFuera: 0, compraMin: 6, cantGratis: 1 }))
      .toMatchObject({ sets: 1, gratis: 1, pagadas: 12 });
    expect(calcularRegaloAcumulado({ cantidadGrupo: 14, disponibleEnGrupo: 8, disponibleFuera: 0, compraMin: 6, cantGratis: 1 }))
      .toMatchObject({ sets: 2, gratis: 2, pagadas: 12 });
  });
});

describe('coherencia carrito → venta guardada → ticket', () => {
  // Réplica del flujo de Ruta/POS: motor → descuento efectivo por renglón →
  // renglón neto → encabezado → promocion_aplicada → reimpresión.
  const flujo = (promos: Promocion[], cart: (CartItemForPromo & { iva_pct: number })[]) => {
    const results = evaluatePromociones(promos, cart);
    const lineas = cart.map((c, idx) => {
      const key = c.linea_key ?? `n${idx}`;
      const total = Math.round(c.precio_unitario * c.cantidad * 100) / 100;
      const iva = Math.round((total - total / (1 + c.iva_pct / 100)) * 100) / 100;
      const bruto = { subtotal: Math.round((total - iva) * 100) / 100, iva, ieps: 0, total };
      const parts = separarDescuentoPromo(results, c.producto_id, c.precio_unitario, key);
      const efectivo = Math.min(total, Math.round((parts.descuentoRegular + parts.descuentoGratisBruto) * 100) / 100);
      return { key, id: `vl-${idx}`, producto_id: c.producto_id, cantidad: c.cantidad, bruto, efectivo, neto: aplicarPromoALinea(bruto, efectivo) };
    });
    const totalCobrado = Math.round(lineas.reduce((s, l) => s + l.neto.total, 0) * 100) / 100;
    const rows = buildPromoAplicadaRows({
      ventaId: 'v1',
      promoResults: results,
      effectiveByProduct: new Map(lineas.map(l => [l.key, l.efectivo])),
      lineIdByProduct: new Map(lineas.map(l => [l.key, l.id])),
      lineTotalByProduct: new Map(lineas.map(l => [l.key, l.bruto.total])),
    });
    const reimpresion = promosPersistidasDeVenta(
      lineas.map(l => ({ id: l.id, producto_id: l.producto_id, cantidad: l.cantidad })),
      rows,
    );
    return { results, lineas, totalCobrado, rows, reimpresion };
  };

  it('importe cobrado = líneas persistidas = ticket, con descuento y regalo', () => {
    const promos = [
      promo({ prioridad: 5, acumulable: true }),
      promo({ id: 'promo-vaso', tipo: 'producto_gratis', valor: 0, cantidad_minima: 6, cantidad_gratis: 1, producto_gratis_id: 'vaso', prioridad: 1 }),
    ];
    const cart = [
      { ...item('fresa', 2, 19.99), linea_key: 'a', iva_pct: 16 },
      { ...item('mango', 3, 24.5), linea_key: 'b', iva_pct: 16 },
      { ...item('limon', 1, 30), linea_key: 'c', iva_pct: 16 },
      { ...item('vaso', 1, 12), linea_key: 'd', iva_pct: 16 },
    ];
    const { lineas, totalCobrado, rows, reimpresion } = flujo(promos, cart);
    const bruto = lineas.reduce((s, l) => s + l.bruto.total, 0);
    const promoTotal = Math.round(rows.reduce((s, r) => s + r.descuento_aplicado, 0) * 100) / 100;
    expect(Math.round((bruto - promoTotal) * 100) / 100).toBe(totalCobrado);
    lineas.forEach(l => expect(Math.round((l.neto.subtotal + l.neto.iva + l.neto.ieps) * 100) / 100).toBe(l.neto.total));
    // El regalo deja su renglón en $0 y queda registrado con su cantidad.
    expect(lineas.find(l => l.producto_id === 'vaso')!.neto.total).toBe(0);
    expect(rows.find(r => r.promocion_id === 'promo-vaso')).toMatchObject({ tipo: 'producto_gratis', cantidad_gratis: 1, venta_linea_id: 'vl-3' });
    // Reimpresión desde lo persistido = mismo descuento; ticket cuadra.
    expect(sum(reimpresion)).toBe(promoTotal);
    const summary = getTicketTotalsSummary({ lineas: [], subtotal: 0, iva: 0, total: totalCobrado, promociones: reimpresion, descuento: promoTotal } as any);
    expect(summary.descuentoTotal).toBe(promoTotal);
  });

  it('recalcular el mismo carrito produce exactamente las mismas filas (sin acumular)', () => {
    const cart = [{ ...item('fresa', 3, 20), linea_key: 'a', iva_pct: 0 }, { ...item('mango', 3, 25), linea_key: 'b', iva_pct: 0 }];
    const a = flujo([promo()], cart);
    const b = flujo([promo()], cart);
    expect(b.totalCobrado).toBe(a.totalCobrado);
    expect(b.rows.map(r => [r.venta_linea_id, r.descuento_aplicado])).toEqual(a.rows.map(r => [r.venta_linea_id, r.descuento_aplicado]));
  });

  it('un cambio posterior en la promoción no altera la reimpresión', () => {
    const cart = [{ ...item('fresa', 3, 20), linea_key: 'a', iva_pct: 0 }, { ...item('mango', 3, 25), linea_key: 'b', iva_pct: 0 }];
    const { rows } = flujo([promo()], cart);
    // La reimpresión solo depende de las filas guardadas, no de la promoción.
    expect(sum(promosPersistidasDeVenta([{ id: 'vl-0', producto_id: 'fresa' }, { id: 'vl-1', producto_id: 'mango' }], rows))).toBe(13.5);
  });
});
