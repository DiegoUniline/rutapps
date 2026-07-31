import { createClient } from '@supabase/supabase-js';
import { simulateBackfill } from './src/lib/simulationBackfill';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

  if (vError) {
    console.error('Error fetching sales:', vError);
    return;
  }

  console.log(`Encontradas ${ventas?.length || 0} ventas.`);
  console.log(`Folio | Original | Simulado | Dif | Estado`);
  console.log(`------|----------|----------|-----|--------`);

  for (const venta of (ventas || [])) {
    try {
      const { data: lineas, error: lError } = await supabase
        .from('venta_lineas')
        .select('*')
        .eq('venta_id', venta.id);

      if (lError) throw lError;

      const { data: promos, error: pError } = await supabase
        .from('promocion_aplicada')
        .select('*')
        .eq('venta_id', venta.id);

      if (pError) throw pError;

      let simTotal = 0;
      for (const line of (lineas || [])) {
          const linePromos = (promos || []).filter(p => p.linea_id === line.id);
          const breakdown = simulateBackfill({ ...line, promocion_aplicada: linePromos });
          simTotal += breakdown.check_total_simulado;
      }
      
      const diff = Math.abs(simTotal - venta.total);
      const doubt = diff > 0.05 ? '⚠️ DUDA' : '✅ OK';

      console.log(`${venta.folio.padEnd(8)} | ${venta.total.toFixed(2).padStart(8)} | ${simTotal.toFixed(2).padStart(8)} | ${diff.toFixed(2)} | ${doubt}`);
      
    } catch (e) {
      console.log(`${venta.folio.padEnd(8)} | ERROR: ${e.message}`);
    }
  }
}

run();
