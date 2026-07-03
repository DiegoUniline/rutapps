/**
 * Genera un UUID DETERMINÍSTICO (estable) a partir de sus partes: las mismas
 * entradas siempre producen el mismo id. Se usa para hacer idempotentes las
 * inserciones que viajan por la cola offline (upsert por id): si la misma
 * operación se manda dos veces —doble-toque, reintento, resync— la base la
 * trata como la MISMA fila y no la duplica.
 *
 * Usa SHA-256 (128 bits) → probabilidad de colisión entre operaciones
 * distintas es despreciable. El formato es un UUID válido para la columna
 * `uuid` de Postgres.
 */
export async function deterministicUuid(...parts: (string | number | null | undefined)[]): Promise<string> {
  const input = parts.map(p => (p ?? '')).join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  const bytes = new Uint8Array(digest).slice(0, 16);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
