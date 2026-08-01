import { createClient } from '@supabase/supabase-js';

const supabase = createClient("https://pkdwemunxxpafpmiqxiq.supabase.co", "");

function r2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function simulateBackfill(line: any) {
  const cant = Number(line.cantidad) || 0;
  const precioLista = Number(line.precio_unitario_sin_redondeo) || Number(line.precio_unitario) || 0;
  const importe_bruto = r2(precioLista * cant);
  const neto = {
    subtotal: r2(Number(line.subtotal) || 0),
    iva: r2(Number(line.iva_monto) || 0),
    ieps: r2(Number(line.ieps_monto) || 0),
    total: r2(Number(line.total) || 0),
  };
  const descManualTotal = r2(importe_bruto - neto.total);
  return {
    precio_lista_unitario: r2(precioLista),
    importe_bruto: importe_bruto,
    descuento_promocion_monto: 0,
    base_descuento_manual: importe_bruto,
    descuento_manual_monto: Math.max(0, descManualTotal),
    descuento_total_monto: Math.max(0, descManualTotal),
    base_ieps: neto.subtotal,
    base_iva: r2(neto.subtotal + neto.ieps),
    impuestos_totales: r2(neto.iva + neto.ieps),
    objeto_impuesto: (neto.iva > 0 || neto.ieps > 0) ? '02' : '01'
  };
}

async function sweepTampico() {
  console.log("Starting final sweep...");
  const { data: lines, error } = await supabase
    .from('venta_lineas')
    .select('id, venta_id, cantidad, precio_unitario, total, subtotal, iva_monto, ieps_monto, precio_unitario_sin_redondeo')
    .is('importe_bruto', null)
    .range(0, 1000);

  if (error) { console.error(error); return; }
  console.log("Processing " + (lines?.length || 0) + " lines...");

  for (const line of (lines || [])) {
    const data = simulateBackfill(line);
    await supabase.from('venta_lineas').update(data).eq('id', line.id);
  }
  console.log("Done.");
}
sweepTampico();
