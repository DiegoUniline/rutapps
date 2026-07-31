
import { simulateBackfill } from './src/lib/simulationBackfill';
import { supabase } from './src/integrations/supabase/client';

async function runSimulation() {
  console.log("--- SIMULACIÓN DE BACKFILL: DISTRIBUIDORA TAMPICO ---");
  
  // 1. Obtener una muestra de ventas de hoy
  const { data: lineas, error } = await supabase
    .from('venta_lineas')
    .select(`
      id, cantidad, precio_unitario, descuento_pct, subtotal, iva_monto, ieps_monto, total, iva_pct, ieps_pct, precio_unitario_sin_redondeo,
      promocion_aplicada(descuento_aplicado, nombre)
    `)
    .eq('empresa_id', '41cdb6df-40c0-4a95-89de-a54bf8eba0de')
    .gte('created_at', new Date().toISOString().split('T')[0])
    .limit(5);

  if (error) {
    console.error("Error cargando líneas:", error);
    return;
  }

  const resultados = lineas.map(l => simulateBackfill(l as any));
  
  console.table(resultados.map(r => ({
    ID: r.id.slice(0,8),
    'Lista Unit': r.precio_lista_unitario,
    'Bruto Total': r.importe_bruto,
    'Promo $': r.descuento_promocion_monto,
    'Desc Manual': r.descuento_manual_monto,
    'Base IEPS': r.base_ieps,
    'Base IVA': r.base_iva,
    'Total Sim': r.check_total_simulado,
    'Total Orig': r.check_total_original,
    'Diff': r.diff.toFixed(4)
  })));

  const diffTotal = resultados.reduce((s, r) => s + r.diff, 0);
  console.log(`\nResultado final: Diferencia acumulada en 5 líneas = ${diffTotal.toFixed(4)}`);
  if (diffTotal < 0.01) {
    console.log("✅ SIMULACIÓN EXITOSA: Los datos simulados coinciden con los guardados.");
  } else {
    console.log("⚠️ ATENCIÓN: Hay discrepancias. La reconstrucción histórica podría variar centavos.");
  }
}

runSimulation();
