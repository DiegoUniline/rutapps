// Evolution API proxy — connects each empresa via QR to a self-hosted Evolution API server.
// Actions: create-instance | qr | status | disconnect | send-text | send-media
import { createClient } from "npm:@supabase/supabase-js@2";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

function instanceNameForEmpresa(empresa_id: string) {
  return `empresa_${empresa_id.replace(/-/g, "")}`;
}

async function evo(path: string, init: RequestInit = {}) {
  const url = `${EVOLUTION_URL.replace(/\/$/, "")}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: EVOLUTION_KEY,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { ok: res.ok, status: res.status, body: json ?? text };
}

/**
 * Normaliza el número para WhatsApp:
 * - Sólo dígitos.
 * - Si tiene 10 dígitos, antepone la lada de la empresa (default '52').
 * - Deja intacto si ya trae lada.
 */
async function normalizePhone(admin: any, empresa_id: string, phone: string): Promise<string> {
  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return digits;
  if (digits.length === 10) {
    const { data } = await admin.from("empresas").select("lada").eq("id", empresa_id).maybeSingle();
    const lada = String(data?.lada ?? "52").replace(/\D/g, "") || "52";
    return lada + digits;
  }
  return digits;
}

function json(status: number, data: unknown) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!EVOLUTION_URL || !EVOLUTION_KEY) {
      return json(500, { error: "Evolution API no configurado en el servidor" });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // ---- Auth ----
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json(401, { error: "Unauthorized" });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await admin.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) return json(401, { error: "Unauthorized" });
    const userId = claimsData.claims.sub as string;

    const body = await req.json().catch(() => ({}));
    const { action, empresa_id } = body as { action?: string; empresa_id?: string };
    if (!action || !empresa_id) return json(400, { error: "action y empresa_id requeridos" });

    // ---- Tenant check ----
    const { data: profile } = await admin
      .from("profiles").select("empresa_id").eq("user_id", userId).single();
    const { data: isSA } = await admin.rpc("is_super_admin", { p_user_id: userId });
    if (!isSA && profile?.empresa_id !== empresa_id) return json(403, { error: "Forbidden" });

    const instanceName = instanceNameForEmpresa(empresa_id);

    // Ensure config row exists
    const { data: cfg } = await admin
      .from("whatsapp_config").select("*").eq("empresa_id", empresa_id).maybeSingle();

    async function upsertCfg(patch: Record<string, unknown>) {
      if (cfg?.id) {
        await admin.from("whatsapp_config").update(patch).eq("id", cfg.id);
      } else {
        await admin.from("whatsapp_config").insert({ empresa_id, provider: "evolution", ...patch });
      }
    }

    switch (action) {
      case "create-instance": {
        // Try create; if it already exists Evolution returns 403/409 — ignore.
        const create = await evo("/instance/create", {
          method: "POST",
          body: JSON.stringify({
            instanceName,
            integration: "WHATSAPP-BAILEYS",
            qrcode: true,
          }),
        });
        // Persist even if already existed
        await upsertCfg({
          provider: "evolution",
          evolution_instance_name: instanceName,
          evolution_status: "esperando_qr",
          evolution_last_qr_at: new Date().toISOString(),
          activo: true,
        });
        return json(200, { success: true, instanceName, created: create.ok, detail: create.body });
      }

      case "qr": {
        const r = await evo(`/instance/connect/${instanceName}`, { method: "GET" });
        // Evolution returns { base64, code, count } or { instance: { state } } if already connected
        const state = r.body?.instance?.state ?? r.body?.state ?? null;
        if (state === "open") {
          await upsertCfg({
            evolution_status: "conectado",
            evolution_connected_at: new Date().toISOString(),
          });
          return json(200, { success: true, connected: true });
        }
        const base64 = r.body?.base64 ?? r.body?.qrcode?.base64 ?? null;
        if (base64) {
          await upsertCfg({ evolution_status: "esperando_qr", evolution_last_qr_at: new Date().toISOString() });
        }
        return json(200, { success: true, connected: false, qr: base64, raw: r.body });
      }

      case "status": {
        const r = await evo(`/instance/connectionState/${instanceName}`, { method: "GET" });
        const state = r.body?.instance?.state ?? r.body?.state ?? "close";
        // Try to fetch phone info
        let phone: string | null = null;
        if (state === "open") {
          const info = await evo(`/instance/fetchInstances?instanceName=${instanceName}`, { method: "GET" });
          const arr = Array.isArray(info.body) ? info.body : [];
          const first = arr[0];
          phone = first?.ownerJid?.split("@")[0] ?? first?.number ?? null;
          await upsertCfg({
            evolution_status: "conectado",
            evolution_phone_number: phone,
            evolution_connected_at: cfg?.evolution_connected_at ?? new Date().toISOString(),
          });
        } else {
          await upsertCfg({ evolution_status: state === "connecting" ? "esperando_qr" : "desconectado" });
        }
        return json(200, { success: true, state, phone });
      }

      case "disconnect": {
        await evo(`/instance/logout/${instanceName}`, { method: "DELETE" });
        await evo(`/instance/delete/${instanceName}`, { method: "DELETE" });
        await upsertCfg({
          evolution_status: "desconectado",
          evolution_phone_number: null,
          evolution_connected_at: null,
        });
        return json(200, { success: true });
      }

      case "send-text": {
        const { phone, message, tipo, referencia_id } = body as any;
        if (!phone || !message) return json(400, { error: "phone y message requeridos" });
        const normalized = String(phone).replace(/[\s\-\(\)+]/g, "");
        const r = await evo(`/message/sendText/${instanceName}`, {
          method: "POST",
          body: JSON.stringify({ number: normalized, text: message }),
        });
        await admin.from("whatsapp_log").insert({
          empresa_id, telefono: normalized, tipo: tipo || "send-text",
          mensaje: message, status: r.ok ? "sent" : "error",
          error_detalle: r.ok ? null : `HTTP ${r.status}: ${JSON.stringify(r.body)}`,
          referencia_id: referencia_id ?? null,
        });
        return json(r.ok ? 200 : 502, { success: r.ok, detail: r.body });
      }

      case "send-media": {
        const { phone, url, fileName, caption, mediaType, tipo, referencia_id } = body as any;
        if (!phone || !url) return json(400, { error: "phone y url requeridos" });
        const normalized = String(phone).replace(/[\s\-\(\)+]/g, "");
        const mediaKind = mediaType || (String(fileName || url).match(/\.(jpg|jpeg|png|webp)$/i) ? "image" : "document");
        const r = await evo(`/message/sendMedia/${instanceName}`, {
          method: "POST",
          body: JSON.stringify({
            number: normalized,
            mediatype: mediaKind,
            media: url,
            fileName: fileName || "archivo.pdf",
            caption: caption || "",
          }),
        });
        await admin.from("whatsapp_log").insert({
          empresa_id, telefono: normalized, tipo: tipo || "send-media",
          mensaje: caption ?? null, imagen_url: url,
          status: r.ok ? "sent" : "error",
          error_detalle: r.ok ? null : `HTTP ${r.status}: ${JSON.stringify(r.body)}`,
          referencia_id: referencia_id ?? null,
        });
        return json(r.ok ? 200 : 502, { success: r.ok, detail: r.body });
      }

      default:
        return json(400, { error: `Acción no soportada: ${action}` });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error interno";
    console.error("whatsapp-evolution error:", msg);
    return json(500, { error: msg });
  }
});
