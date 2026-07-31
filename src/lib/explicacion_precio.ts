
import { calculateSaleLineAmounts } from './salePricing';

interface LegacyLine {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  total: number;
  iva_pct: number;
}

function simulate(line: LegacyLine, precioReal: number) {
  const cant = line.cantidad;
  
  // 1. ESCENARIO ACTUAL (Lo que tienes en la imagen)
  const brutoActual = calculateSaleLineAmounts({
    cantidad: cant,
    precio_unitario: line.precio_unitario, // $0.01
    descuento_pct: 0,
    iva_pct: line.iva_pct,
    ieps_pct: 0
  } as any, false);

  // 2. ESCENARIO CON DESGLOSE (Lo que propongo)
  // Usamos el precio del producto real ($204) para que el reporte sea útil
  const brutoPropuesto = calculateSaleLineAmounts({
    cantidad: cant,
    precio_unitario: precioReal, // $204.00
    descuento_pct: 0,
    iva_pct: line.iva_pct,
    ieps_pct: 0
  } as any, false);

  return {
    "Producto": line.nombre,
    "Precio en Catálogo": `$${line.precio_unitario.toFixed(2)}`,
    "Importe Bruto (Actual)": `$${brutoActual.total.toFixed(2)}`,
    "Importe Bruto (Propuesto)": `$${brutoPropuesto.total.toFixed(2)}`,
    "Descuento Promo": `$${brutoPropuesto.total.toFixed(2)}`,
    "Total Final": "$0.00",
    "Valor invisible recuperado": `$${(brutoPropuesto.total - brutoActual.total).toFixed(2)}`
  };
}

const regaloCloralex: LegacyLine = {
  nombre: "GRATIS CLORALEX 1.17L",
  cantidad: 12,
  precio_unitario: 0.01,
  total: 0.12,
  iva_pct: 0
};

console.table([simulate(regaloCloralex, 204.00)]);
