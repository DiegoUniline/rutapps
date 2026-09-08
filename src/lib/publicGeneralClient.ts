import { offlineDb } from './offlineDb';
import { supabase } from './supabase';

export type PublicGeneralCandidate = {
  id: string;
  empresa_id: string;
  nombre: string;
  status?: string | null;
  es_publico_general?: boolean | null;
  created_at?: string | null;
  [key: string]: unknown;
};

const PUBLIC_GENERAL_NAMES = [
  'Público general',
  'Publico general',
  'Público General',
  'Publico General',
];

export function normalizePublicGeneralName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function isPublicGeneralClient(candidate: Pick<PublicGeneralCandidate, 'nombre' | 'es_publico_general'>): boolean {
  return candidate.es_publico_general === true
    || normalizePublicGeneralName(candidate.nombre) === 'publico general';
}

export function selectPublicGeneralClient(
  candidates: PublicGeneralCandidate[],
  empresaId: string,
): PublicGeneralCandidate | null {
  return candidates
    .filter(candidate => candidate.empresa_id === empresaId)
    .filter(candidate => candidate.status == null || candidate.status === 'activo')
    .filter(isPublicGeneralClient)
    .sort((a, b) => {
      if (Boolean(a.es_publico_general) !== Boolean(b.es_publico_general)) {
        return a.es_publico_general ? -1 : 1;
      }
      const byCreatedAt = String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''));
      return byCreatedAt || a.id.localeCompare(b.id);
    })[0] ?? null;
}

async function cachePublicGeneralClient(id: string): Promise<void> {
  try {
    const { data, error } = await supabase.from('clientes').select('*').eq('id', id).maybeSingle();
    if (!error && data) await offlineDb.clientes.put(data);
  } catch {
    // El ID ya es utilizable; la siguiente sincronización refrescará la fila.
  }
}

/**
 * Resuelve el cliente contable de Público general sin inventar IDs locales.
 * La caché se consulta primero para que la venta funcione sin señal. Si nunca
 * se descargó ese cliente, se bloquea de forma segura en lugar de crear una
 * venta/cobro huérfano.
 */
export async function resolvePublicGeneralClientId(empresaId: string): Promise<string | null> {
  try {
    const localRows = await offlineDb.clientes.where('empresa_id').equals(empresaId).toArray() as PublicGeneralCandidate[];
    const local = selectPublicGeneralClient(localRows, empresaId);
    if (local) return local.id;
  } catch {
    // IndexedDB no disponible: todavía puede resolverse contra el servidor.
  }

  if (typeof navigator !== 'undefined' && !navigator.onLine) return null;

  // La RPC serializa la creación por empresa y garantiza una sola identidad.
  try {
    const { data, error } = await supabase.rpc('ensure_cliente_publico_general', {
      p_empresa_id: empresaId,
    });
    if (!error && typeof data === 'string' && data) {
      await cachePublicGeneralClient(data);
      return data;
    }
  } catch {
    // Compatibilidad durante el despliegue: intentar el flujo anterior.
  }

  // Compatibilidad de lectura durante un despliegue escalonado. Deliberadamente
  // NO se crea aquí: dos dispositivos podrían consultar a la vez y fabricar
  // duplicados. La creación pertenece únicamente a la RPC transaccional.
  try {
    const { data: existing, error: lookupError } = await supabase
      .from('clientes')
      .select('*')
      .eq('empresa_id', empresaId)
      .eq('status', 'activo')
      .in('nombre', PUBLIC_GENERAL_NAMES)
      .order('created_at')
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing?.id) {
      await offlineDb.clientes.put(existing).catch(() => undefined);
      return existing.id;
    }
    return null;
  } catch {
    return null;
  }
}
