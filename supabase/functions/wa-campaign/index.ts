import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const WHATSAPI_URL = "https://itxrxxoykvxpwflndvea.supabase.co/functions/v1/api-proxy";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: any) =>
  console.log(`[WA-CAMPAIGN] ${step}${details ? ` — ${JSON.stringify(details)}` : ""}`);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Verify super admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization");
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) throw new Error("No autenticado");

    const { data: sa } = await supabase.from("super_admins").select("id").eq("user_id", user.id).maybeSingle();
    if (!sa) throw new Error("No autorizado");

    const { action, filter, message, image_url, caption } = await req.json();

    // Action: get_recipients — returns filtered list
    if (action === "get_recipients") {
      const recipients = await getRecipients(supabase, filter);
      return new Response(JSON.stringify({ recipients, count: recipients.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: send_campaign — send to all filtered recipients
    if (action === "send_campaign") {
      const apiToken = Deno.env.get("WHATSAPP_OTP_TOKEN");
      if (!apiToken) throw new Error("WHATSAPP_OTP_TOKEN not configured");

      const recipients = await getRecipients(supabase, filter);
      log("Campaign started", { filter, recipientCount: recipients.length });

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];

      for (const r of recipients) {
        if (!r.telefono) { failed++; continue; }

        const normalizedPhone = r.telefono.replace(/[\s\-\(\)]/g, "");
        const personalizedMsg = (message || "")
          .replace(/\{nombre\}/g, r.nombre || "")
          .replace(/\{empresa\}/g, r.empresa_nombre || "")
          .replace(/\{telefono\}/g, normalizedPhone);

        try {
          // Send image first if provided
          if (image_url) {
            const imgBody = {
              action: "send-image",
              phone: normalizedPhone,
              url: image_url,
              caption: personalizedMsg || caption || "",
            };
            const imgRes = await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": apiToken },
              body: JSON.stringify(imgBody),
            });
            if (!imgRes.ok) {
              const errText = await imgRes.text();
              throw new Error(`Image send failed: ${errText}`);
            }
            // If image has caption with the message, don't send text separately
            if (personalizedMsg && !caption) {
              sent++;
              continue;
            }
          }

          // Send text message
          if (personalizedMsg && (!image_url || caption)) {
            const textBody = {
              action: "send-text",
              phone: normalizedPhone,
              message: personalizedMsg,
            };
            const textRes = await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": apiToken },
              body: JSON.stringify(textBody),
            });
            if (!textRes.ok) {
              const errText = await textRes.text();
              throw new Error(`Text send failed: ${errText}`);
            }
          }

          sent++;
          // Small delay to avoid rate limiting
          if (sent % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } catch (e) {
          failed++;
          errors.push(`${r.nombre} (${normalizedPhone}): ${(e as Error).message}`);
          log("Send failed", { phone: normalizedPhone, error: (e as Error).message });
        }
      }

      log("Campaign completed", { sent, failed, total: recipients.length });

      return new Response(JSON.stringify({ success: true, sent, failed, total: recipients.length, errors: errors.slice(0, 10) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Acción no soportada: ${action}`);
  } catch (error) {
    log("ERROR", (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

interface Recipient {
  nombre: string;
  telefono: string | null;
  empresa_nombre: string;
  empresa_id: string;
  status: string;
}

async function getRecipients(supabase: any, filter: string): Promise<Recipient[]> {
  // Get all subscriptions with empresa info
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("empresa_id, status, trial_ends_at, stripe_subscription_id, empresas:empresa_id(nombre)");

  if (!subs) return [];

  // Build empresa status map
  const empresaStatus: Record<string, { status: string; hasStripe: boolean; nombre: string }> = {};
  for (const s of subs) {
    empresaStatus[s.empresa_id] = {
      status: s.status,
      hasStripe: !!s.stripe_subscription_id,
      nombre: (s.empresas as any)?.nombre || "Sin nombre",
    };
  }

  // Filter empresas by criteria
  let filteredEmpresaIds: string[];
  switch (filter) {
    case "trial":
      filteredEmpresaIds = Object.entries(empresaStatus)
        .filter(([, v]) => v.status === "trial")
        .map(([k]) => k);
      break;
    case "active_paying":
      filteredEmpresaIds = Object.entries(empresaStatus)
        .filter(([, v]) => v.status === "active" && v.hasStripe)
        .map(([k]) => k);
      break;
    case "suspended":
      filteredEmpresaIds = Object.entries(empresaStatus)
        .filter(([, v]) => v.status === "suspended")
        .map(([k]) => k);
      break;
    case "past_due":
      filteredEmpresaIds = Object.entries(empresaStatus)
        .filter(([, v]) => ["past_due", "gracia"].includes(v.status))
        .map(([k]) => k);
      break;
    case "never_paid":
      filteredEmpresaIds = Object.entries(empresaStatus)
        .filter(([, v]) => !v.hasStripe && ["suspended", "past_due", "gracia"].includes(v.status))
        .map(([k]) => k);
      break;
    case "all":
    default:
      filteredEmpresaIds = Object.keys(empresaStatus);
      break;
  }

  if (filteredEmpresaIds.length === 0) return [];

  // Get profiles with phone for those empresas
  const { data: profiles } = await supabase
    .from("profiles")
    .select("nombre, telefono, empresa_id")
    .in("empresa_id", filteredEmpresaIds)
    .not("telefono", "is", null);

  if (!profiles) return [];

  return profiles.map((p: any) => ({
    nombre: p.nombre || "",
    telefono: p.telefono,
    empresa_nombre: empresaStatus[p.empresa_id]?.nombre || "",
    empresa_id: p.empresa_id,
    status: empresaStatus[p.empresa_id]?.status || "unknown",
  }));
}
