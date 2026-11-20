import { describe, it, expect } from 'vitest';
import { resolveProductPricing, type TarifaLineaRule, type ProductForPricing } from '@/lib/priceResolver';
import { buildSalePricingSnapshot } from '@/lib/salePricing';
import { resolverPrecio, resolvePrice, resolveNetPrice, montosLinea, type Rule, type Prod } from '../../supabase/functions/_shared/tiendaPricing';
import { correoCoincide, normalizarCorreo, signToken, verifyToken } from '../../supabase/functions/_shared/tiendaAuth';

// Generador determinista (sin Math.random para que la prueba sea reproducible).
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

const LISTA_A = 'lista-a';
const LISTA_B = 'lista-b';

function casos(n: number) {
  const r = rng(42);
  const pick = <T,>(xs: T[]) => xs[Math.floor(r() * xs.length)];
  const out: { rules: Rule[]; prod: Prod; lista: string | null }[] = [];
  for (let i = 0; i < n; i++) {
    const prod: Prod = {
      id: pick(['p1', 'p2', 'p3']),
      precio_principal: Math.round(r() * 50000) / 100,
      costo: Math.round(r() * 30000) / 100,
      clasificacion_id: pick([null, 'c1', 'c2']),
      lista_id: pick([null, 'g1', 'g2']),
      grupo_precio: pick([null, 'A', 'B']),
      tiene_iva: r() > 0.3, iva_pct: pick([16, 8, 0]),
      tiene_ieps: r() > 0.6, ieps_pct: pick([8, 26.5, 53]),
      usa_listas_precio: pick([true, true, true, false, undefined as any]),
      costo_incluye_impuestos: r() > 0.5,
    };
    const rules: Rule[] = Array.from({ length: Math.floor(r() * 5) }, () => ({
      aplica_a: pick(['todos', 'producto', 'categoria', 'grupo']),
      producto_ids: [pick(['p1', 'p2', 'p3'])],
      clasificacion_ids: [pick(['c1', 'c2'])],
      grupos: [pick(['g1', 'g2', 'A', 'B'])],
      tipo_calculo: pick(['precio_fijo', 'margen_costo', 'descuento_precio']),
      precio: pick([0, Math.round(r() * 40000) / 100]),
      precio_minimo: pick([null, 0, Math.round(r() * 1000) / 100]),
      margen_pct: pick([null, 10, 25, 33.3]),
      descuento_pct: pick([null, 5, 12.5]),
      redondeo: pick(['ninguno', 'arriba', 'abajo', 'cercano']),
      base_precio: pick(['sin_impuestos', 'con_impuestos']),
      lista_precio_id: pick([null, LISTA_A, LISTA_B]),
    }));
    out.push({ rules, prod, lista: pick([null, LISTA_A, LISTA_B]) });
  }
  return out;
}

describe('tienda en línea = mismo precio que la app (priceResolver)', () => {
  it('3000 combinaciones de reglas/productos/listas dan el mismo precio final y neto', () => {
    for (const { rules, prod, lista } of casos(3000)) {
      const app = resolveProductPricing(rules as TarifaLineaRule[], prod as ProductForPricing, lista);
      const tienda = resolverPrecio(rules, prod, lista);
      expect(tienda.displayPrice).toBe(app.displayPrice);
      expect(tienda.unitPrice).toBe(app.unitPrice);
      expect(resolvePrice(rules, prod, lista)).toBe(app.displayPrice);
      // El neto que se guarda en venta_lineas es el mismo que guarda la app.
      expect(resolveNetPrice(rules, prod, lista)).toBeCloseTo(buildSalePricingSnapshot(prod as ProductForPricing, app).unitPrice, 10);
    }
  });

  it('sin regla: precio_principal es el precio FINAL (no se le vuelve a sumar IVA)', () => {
    const prod: Prod = { id: 'p1', precio_principal: 116, tiene_iva: true, iva_pct: 16, usa_listas_precio: true };
    expect(resolvePrice([], prod, null)).toBe(116);
    expect(resolveNetPrice([], prod, null)).toBeCloseTo(100, 10);
  });

  it('regla por grupo/lista del producto aplica igual que en la app', () => {
    const regla: Rule = {
      aplica_a: 'grupo', producto_ids: [], clasificacion_ids: [], grupos: ['g1'], tipo_calculo: 'precio_fijo',
      precio: 50, precio_minimo: null, margen_pct: null, descuento_pct: null, redondeo: 'ninguno',
      base_precio: 'sin_impuestos', lista_precio_id: null,
    };
    const prod: Prod = { id: 'p1', precio_principal: 100, lista_id: 'g1', tiene_iva: true, iva_pct: 16 };
    expect(resolvePrice([regla], prod, null)).toBe(58);
  });
});

describe('montosLinea: el pedido suma exactamente lo que el cliente vio', () => {
  it('total = precio final × cantidad, con IVA/IEPS desglosados', () => {
    const r = rng(7);
    for (let i = 0; i < 2000; i++) {
      const prod: Prod = {
        id: 'p', precio_principal: 0,
        tiene_iva: r() > 0.3, iva_pct: 16, tiene_ieps: r() > 0.5, ieps_pct: [8, 26.5, 53][i % 3],
      };
      const final = Math.round(r() * 100000) / 100;
      const qty = [1, 2, 3, 7, 12, 24, 0.5, 1.25][i % 8];
      const m = montosLinea(final, qty, prod);
      expect(m.total).toBe(Math.round(final * qty * 100) / 100);
      expect(Math.round((m.subtotal + m.ieps_monto + m.iva_monto) * 100) / 100).toBe(m.total);
      if (!prod.tiene_iva) expect(m.iva_monto).toBe(0);
      if (!prod.tiene_ieps) expect(m.ieps_monto).toBe(0);
    }
  });

  it('caja con precio especial $100 de 12 piezas cobra $100 por caja', () => {
    const prod: Prod = { id: 'p', precio_principal: 10, tiene_iva: true, iva_pct: 16 };
    expect(montosLinea(100 / 12, 12 * 3, prod).total).toBe(300);
  });
});

describe('acceso a la tienda: correos y tokens', () => {
  it('normaliza el correo como lo escriben en el celular', () => {
    expect(normalizarCorreo('  Juan.Perez@Gmail.COM ')).toBe('juan.perez@gmail.com');
    expect(normalizarCorreo('juan”gmail.com')).toBe('juan@gmail.com');
  });

  it('encuentra el correo en la ficha aunque tenga mayúsculas, espacios o varios correos', () => {
    expect(correoCoincide(' Juan@Gmail.com ', 'juan@gmail.com')).toBe(true);
    expect(correoCoincide('compras@x.mx; Juan@Gmail.com', 'juan@gmail.com')).toBe(true);
    expect(correoCoincide('otrojuan@gmail.com', 'juan@gmail.com')).toBe(false);
    expect(correoCoincide(null, 'juan@gmail.com')).toBe(false);
  });

  it('un token vencido solo lo acepta tienda-refresh (aceptarVencido); uno alterado nunca', async () => {
    const payload = { empresa_id: 'e', cliente_id: 'c', tienda_cliente_id: 't', email: 'a@b.mx' };
    const vencido = await signToken(payload, 'secreto', -60);
    expect(await verifyToken(vencido, 'secreto')).toBeNull();
    expect((await verifyToken(vencido, 'secreto', { aceptarVencido: true }))?.cliente_id).toBe('c');
    expect(await verifyToken(vencido, 'otro-secreto', { aceptarVencido: true })).toBeNull();
    const vigente = await signToken(payload, 'secreto');
    expect((await verifyToken(vigente, 'secreto'))?.tienda_cliente_id).toBe('t');
  });
});
