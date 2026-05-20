const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 4500) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

export async function hasRealConnection(): Promise<boolean> {
  if (typeof window === 'undefined') return true;

  const checks: Promise<boolean>[] = [];

  if (SUPABASE_URL) {
    checks.push(
      fetchWithTimeout(`${SUPABASE_URL}/auth/v1/health`, {
        method: 'GET',
        headers: SUPABASE_KEY ? { apikey: SUPABASE_KEY } : undefined,
      }).then(() => true),
    );
  }

  checks.push(
    fetchWithTimeout('https://www.gstatic.com/generate_204', { method: 'GET', mode: 'no-cors' }).then(() => true),
  );

  const results = await Promise.allSettled(checks);
  return results.some(result => result.status === 'fulfilled' && result.value === true);
}
