import { createClient } from '@supabase/supabase-js';
import { reconstructVentaLineasDesglose } from './src/lib/simulationBackfill';

const supabase = createClient(process.env.VITE_SUPABASE_URL!, process.env.VITE_SUPABASE_ANON_KEY!);

const EMPRESA_ID = '41cdb6df-40c0-4a95-89de-a54bf8eba0de';
const DATE_START = '2026-07-31T00:00:00Z';

async function run() {
  console.log('--- SIMULACIÓN DE DESGLOSE: DISTRIBUIDORA TAMPICO (HOY) ---');
  
  const { data: ventas, error: vError } = await supabase
    .from('ventas')
    .select('id, folio, total, created_at')
    .eq('empresa_id', EMPRESA_ID)
    .gte('created_at', DATE_START)
    .order('created_at', { ascending: true });

  if (vError) throw vError;

  console.log(`Folio | Original | Simulado | Dif | Estado`);
  console.log(`------|----------|----------|-----|--------`);

  for (const venta of ventas) {
    try {
      // Fetch lines
      const { data: lineas } = await supabase
        .from('venta_lineas')
        .select('*')
        .eq('venta_id', venta.id);

      // Fetch promos
      const { data: promos } = await supabase
        .from('promocion_aplicada')
        .select('*')
        .eq('venta_id', venta.id);

      // Reconstruct
      const result = reconstructVentaLineasDesglose(venta, lineas || [], promos || []);
      
      const simTotal = result.reduce((sum, l) => sum + (l.importe_neto || 0), 0);
      const diff = Math.abs(simTotal - venta.total);
      const doubt = diff > 0.02 ? '⚠️ DUDA' : '✅ OK';

      console.log(`${venta.folio.padEnd(8)} | ${venta.total.toFixed(2).padStart(8)} | ${simTotal.toFixed(2).padStart(8)} | ${diff.toFixed(2)} | ${doubt}`);
      
      if (doubt === '⚠️ DUDA') {
          // Log details of lines to understand the doubt
          // console.log('   Detalle de líneas para investigar...');
      }
    } catch (e) {
      console.log(`${venta.folio.padEnd(8)} | ERROR: ${e.message}`);
    }
  }
}

run();
