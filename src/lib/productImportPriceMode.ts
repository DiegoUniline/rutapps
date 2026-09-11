import { supabase } from '@/integrations/supabase/client';
import { importProducts, type ImportColumn, type ImportResult } from '@/lib/importUtils';

export const PRODUCT_PRICE_MODE_COLUMN: ImportColumn = {
  key: 'modo_precio',
  header: 'Modo de precio',
  example: 'Precio general',
};

type ParsedPriceMode = true | false | undefined | 'invalid';

function normalizePriceMode(value: unknown): ParsedPriceMode {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const v = String(value)
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if ([
    'lista de precio',
    'listas de precio',
    'lista',
    'listas',
    'si',
    'yes',
    'true',
    '1',
  ].includes(v)) return true;

  if ([
    'precio general',
    'general',
    'precio principal',
    'no',
    'false',
    '0',
  ].includes(v)) return false;

  return 'invalid';
}

function readCell(row: Record<string, any>, header: string, key: string) {
  return row[header] ?? row[key] ?? undefined;
}

export async function importProductsWithPriceMode(
  rows: Record<string, any>[],
  empresaId: string,
): Promise<ImportResult> {
  const result = await importProducts(rows, empresaId);
  const warnings = [...(result.warnings ?? [])];
  const failedRows = new Set(result.errors.map((e) => e.row));

  const generalCodes: string[] = [];
  const listCodes: string[] = [];

  rows.forEach((row, index) => {
    const rowNum = index + 2;
    if (failedRows.has(rowNum)) return;

    const rawMode = readCell(row, PRODUCT_PRICE_MODE_COLUMN.header, PRODUCT_PRICE_MODE_COLUMN.key);
    const mode = normalizePriceMode(rawMode);
    if (mode === undefined) return;

    const codeRaw = readCell(row, 'Código', 'codigo');
    const code = codeRaw == null ? '' : String(codeRaw).trim();

    if (mode === 'invalid') {
      warnings.push(`Fila ${rowNum}: Modo de precio “${String(rawMode)}” no reconocido. Usa “Lista de precio” o “Precio general”. El modo se dejó sin cambios.`);
      return;
    }

    if (!code) {
      warnings.push(`Fila ${rowNum}: no se pudo aplicar “${PRODUCT_PRICE_MODE_COLUMN.header}” porque falta Código.`);
      return;
    }

    (mode ? listCodes : generalCodes).push(code);
  });

  const updateCodes = async (codes: string[], useLists: boolean) => {
    const unique = [...new Set(codes)];
    for (let i = 0; i < unique.length; i += 200) {
      const chunk = unique.slice(i, i + 200);
      const { error } = await (supabase.from('productos') as any)
        .update({ usa_listas_precio: useLists })
        .eq('empresa_id', empresaId)
        .in('codigo', chunk);
      if (error) throw error;
    }
  };

  try {
    await updateCodes(listCodes, true);
    await updateCodes(generalCodes, false);
  } catch (error: any) {
    warnings.push(`Los productos se importaron, pero no se pudo aplicar el modo de precio a algunas filas: ${error?.message ?? 'error desconocido'}`);
  }

  return { ...result, warnings };
}
