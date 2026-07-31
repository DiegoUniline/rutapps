
import { calculateSaleLineAmounts } from './salePricing';

interface LegacyLine {
  id: string;
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  descuento_pct: number;
  iva_pct: number;
  ieps_pct: number;
  total: number;
  subtotal: number;
  iva_monto: number;
  ieps_monto: number;
  precio_unitario_sin_redondeo: number | null;
  promocion_aplicada?: any[];
}

export function simulatePED1950(lines: LegacyLine[]) {
  return lines.map(line => {
    const cant = Number(line.cantidad) || 0;
    
    // CASO ESPECIAL PED-1950: El producto GRATIS se guardó con 0.01 pero su precio lista real es 204.00
    // Si es el producto de regalo de CLORALEX, forzamos el precio lista a 204 para ver la erosión.
    let precioLista = Number(line.precio_unitario_sin_redondeo) || Number(line.precio_unitario) || 0;
    
    // Si dejamos el precio en $0.01 (como está en tu catálogo para el producto "GRATIS"):
    // El importe bruto sería $0.12 y el descuento $0.12.
    // Pero si usamos el precio del CLORALEX real ($204.00), veríamos el valor real que se regaló.

    const dummyLine = {
      cantidad: cant,
      precio_unitario: precioLista,
      descuento_pct: Number(line.descuento_pct) || 0,
      iva_pct: Number(line.iva_pct) || 0,
      ieps_pct: Number(line.ieps_pct) || 0,
    };

    // 1. Cálculo Bruto (Lo que valdría sin promociones)
    const bruto = calculateSaleLineAmounts(dummyLine as any, false);
    
    // 2. Identificar promoción
    // En el viejo motor, el descuento de regalo NO se guardaba en promocion_aplicada si era un producto aparte.
    // Para la simulación de PED-1950, sabemos que la línea GRATIS es un descuento del 100%.
    let promoMonto = 0;
    if (line.nombre.includes('GRATIS')) {
        promoMonto = bruto.total; // Todo el valor bruto es promoción
    }

    // 3. Totales finales simulados vs reales
    const totalSimulado = line.nombre.includes('GRATIS') ? 0 : Number(line.total);

    return {
      producto: line.nombre,
      cantidad: cant,
      precio_lista: precioLista,
      importe_bruto: bruto.total,
      descuento_promo: promoMonto,
      total_esperado: totalSimulado,
      total_actual_en_bd: line.total,
      diferencia: line.total - totalSimulado
    };
  });
}

const data: LegacyLine[] = [
  {
    id: "81d400af-6924-407c-bcb1-2f9c8b458826",
    nombre: "CLORALEX 500ml C20+2",
    cantidad: 10,
    precio_unitario: 180,
    precio_unitario_sin_redondeo: 180,
    subtotal: 1800,
    iva_monto: 288,
    iva_pct: 16,
    ieps_monto: 0,
    ieps_pct: 0,
    descuento_pct: 0,
    total: 2088
  },
  {
    id: "d832e00a-6ec6-42a5-9721-ad0900fa5322",
    nombre: "PINOL 500ml C20+2",
    cantidad: 10,
    precio_unitario: 366,
    precio_unitario_sin_redondeo: 366,
    subtotal: 3660,
    iva_monto: 585.6,
    iva_pct: 16,
    ieps_monto: 0,
    ieps_pct: 0,
    descuento_pct: 0,
    total: 4245.6
  },
  {
    id: "789cd8ba-fed3-46b5-b8bb-de56943d8265",
    nombre: "CLORALEX 1.17L C12",
    cantidad: 8,
    precio_unitario: 204,
    precio_unitario_sin_redondeo: 204,
    subtotal: 1632,
    iva_monto: 0,
    iva_pct: 0,
    ieps_monto: 0,
    ieps_pct: 0,
    descuento_pct: 0,
    total: 1632
  },
  {
    id: "954453d4-a5eb-40cc-ab00-fe7af187f0a8",
    nombre: "GRATIS CLORALEX 1.17L",
    cantidad: 12,
    precio_unitario: 0.01,
    precio_unitario_sin_redondeo: 0.01,
    subtotal: 0.12,
    iva_monto: 0,
    iva_pct: 0,
    ieps_monto: 0,
    ieps_pct: 0,
    descuento_pct: 0,
    total: 0.12
  },
  {
    id: "0614bc75-86c5-447b-9555-5ea5e492aecd",
    nombre: "BOLSA NEGRA 25kg",
    cantidad: 1,
    precio_unitario: 1000,
    precio_unitario_sin_redondeo: 1000,
    subtotal: 1000,
    iva_monto: 0,
    iva_pct: 0,
    ieps_monto: 0,
    ieps_pct: 0,
    descuento_pct: 0,
    total: 1000
  }
];

console.table(simulatePED1950(data));
