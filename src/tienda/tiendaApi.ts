import { isRetryableHttpStatus } from "./tiendaReliability";

const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
const ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DEFAULT_TIMEOUT_MS = 30_000;

interface ApiErrorBody {
  error?: string;
  code?: string;
}

export class TiendaApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  readonly retryable: boolean;

  constructor(message: string, status = 0, code: string | null = null, retryable = false) {
    super(message);
    this.name = "TiendaApiError";
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function isSessionExpiredError(error: unknown): error is TiendaApiError {
  return error instanceof TiendaApiError && error.status === 401 && error.code === "session_expired";
}

async function parseResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new TiendaApiError(
      response.ok ? "La tienda recibió una respuesta inválida. Intenta de nuevo." : "El servicio no respondió correctamente.",
      response.status,
      "invalid_response",
      response.ok || isRetryableHttpStatus(response.status),
    );
  }
}

async function request(
  path: string,
  init: RequestInit,
  options: { retries?: number; timeoutMs?: number } = {},
): Promise<Record<string, unknown>> {
  const retries = Math.max(0, options.retries ?? 0);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(`${FN_URL}/${path}`, { ...init, signal: controller.signal });
      const data = await parseResponse(response);
      if (!response.ok) {
        const body = data as ApiErrorBody;
        const apiError = new TiendaApiError(
          body.error ?? "No se pudo completar la solicitud.",
          response.status,
          body.code ?? null,
          isRetryableHttpStatus(response.status),
        );
        if (isSessionExpiredError(apiError)) window.dispatchEvent(new Event("tienda-session-expired"));
        throw apiError;
      }
      return data;
    } catch (error) {
      const apiError = error instanceof TiendaApiError
        ? error
        : new TiendaApiError(
            error instanceof DOMException && error.name === "AbortError"
              ? "La tienda tardó demasiado en responder. Tu carrito sigue guardado; intenta de nuevo."
              : "No pudimos conectar con la tienda. Revisa tu internet e intenta de nuevo.",
            0,
            error instanceof DOMException && error.name === "AbortError" ? "timeout" : "network_error",
            true,
          );
      lastError = apiError;
      if (!apiError.retryable || attempt === retries) throw apiError;
      await new Promise((resolve) => window.setTimeout(resolve, 450 * (attempt + 1)));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw lastError;
}

const publicHeaders = () => ({ apikey: ANON, Authorization: `Bearer ${ANON}` });

export async function fnGet(path: string, params: Record<string, string> = {}) {
  const qs = new URLSearchParams(params).toString();
  return request(`${path}?${qs}`, { headers: publicHeaders() }, { retries: 1 });
}

export async function fnPost(
  path: string,
  body: unknown,
  options: { retries?: number; timeoutMs?: number } = {},
) {
  return request(path, {
    method: "POST",
    headers: { ...publicHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }, options);
}
