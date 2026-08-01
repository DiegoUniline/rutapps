
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function r2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function simulateBackfill(line: any) {
  const cant = Number(line.cantidad) || 0;
  const precioLista = Number(line.precio_unitario_sin_redondeo) || Number(line.precio_unitario) || 0;
  
  // En Tampico, no estamos usando promociones complejas hoy en este barrido, 
  // reconstruimos el bruto a partir del precio de lista unitario.
  const importe_bruto = r2(precioLista * cant);
  
  const neto = {
    subtotal: r2(Number(line.subtotal) || 0),
    iva: r2(Number(line.iva_monto) || 0),
    ieps: r2(Number(line.ieps_monto) || 0),
    total: r2(Number(line.total) || 0),
  };

  // Asumimos que la diferencia entre bruto y neto (si la hay) es descuento manual
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
    objeto_impuesto: (neto.iva > 0 || neto.ieps > 0) ? '02' : '01',
    diff: Math.abs(neto.total - (importe_bruto - descManualTotal))
  };
}

async function sweepTampico() {
  const empresaId = '41cdb6df-40c0-4a95-89de-a54bf8eba0de';
  console.log(`Starting sweep for Tampico...`);

  const { data: lines, error } = await supabase
    .from('venta_lineas')
    .select(`
      id,
      venta_id,
      cantidad,
      precio_unitario,
      descuento_pct,
      iva_pct,
      ieps_pct,
      total,
      subtotal,
      iva_monto,
      ieps_monto,
      precio_unitario_sin_redondeo
    `)
    .eq('importe_bruto', null) // Filtrar solo las que faltan
    .not('venta_id', 'is', null)
    .range(0, 500); // 500 a la vez

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log(`Processing ${lines?.length || 0} lines...`);

  for (const line of (lines || [])) {
    const data = simulateBackfill(line);
    
    const { error: updErr } = await supabase
      .from('venta_lineas')
      .update({
        precio_lista_unitario: data.precio_lista_unitario,
        importe_bruto: data.importe_bruto,
        descuento_promocion_monto: data.descuento_promocion_monto,
        base_descuento_manual: data.base_descuento_manual,
        descuento_manual_monto: data.descuento_manual_monto,
        descuento_total_monto: data.descuento_total_monto,
        base_ieps: data.base_ieps,
        base_iva: data.base_iva,
        impuestos_totales: data.impuestos_totales,
        objeto_impuesto: data.objeto_impuesto
      })
      .eq('id', line.id);
      
    if (updErr) console.error(`Error line ${line.id}:`, updErr.message);
  }
  
  console.log('Done.');
}

sweepTampico();
