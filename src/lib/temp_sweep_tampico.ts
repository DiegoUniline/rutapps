import { supabase } from './supabase';
import { simulateBackfill } from './simulationBackfill';

async function sweepTampico() {
  const empresaId = '41cdb6df-40c0-4a95-89de-a54bf8eba0de';
  console.log(`Starting sweep for Tampico (Lic. 43129204)...`);

  // 1. Fetch lines with NULL breakdown
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
    .is('importe_bruto', null)
    .neq('total', 0) // Skip zero lines for now to be safe
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching lines:', error);
    return;
  }

  if (!lines || lines.length === 0) {
    console.log('No lines to sweep.');
    return;
  }

  console.log(`Found ${lines.length} lines to backfill.`);

  for (const line of lines) {
    try {
      // simulateBackfill reconstructs the 17 new columns from legacy data
      const backfill = simulateBackfill(line as any);
      
      // We only update if the diff is negligible (safety check)
      if (backfill.diff > 0.05) {
        console.warn(`Skipping line ${line.id} due to high diff: ${backfill.diff}`);
        continue;
      }

      const { error: updateErr } = await supabase
        .from('venta_lineas')
        .update({
          precio_lista_unitario: backfill.precio_lista_unitario,
          importe_bruto: backfill.importe_bruto,
          descuento_promocion_monto: backfill.descuento_promocion_monto,
          base_descuento_manual: backfill.base_descuento_manual,
          descuento_manual_monto: backfill.descuento_manual_monto,
          descuento_total_monto: backfill.descuento_total_monto,
          base_ieps: backfill.base_ieps,
          base_iva: backfill.base_iva,
          impuestos_totales: backfill.impuestos_totales,
          objeto_impuesto: backfill.objeto_impuesto
        })
        .eq('id', line.id);

      if (updateErr) {
        console.error(`Error updating line ${line.id}:`, updateErr);
      } else {
        console.log(`Updated line ${line.id} (Venta ${line.venta_id})`);
      }
    } catch (e) {
      console.error(`Critical error processing line ${line.id}:`, e);
    }
  }

  console.log('Sweep finished.');
}

sweepTampico();
