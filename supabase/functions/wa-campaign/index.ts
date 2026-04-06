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

    const body = await req.json();
    const { action } = body;

    // Support both old single 'filter' and new multi 'filters' array
    const filters: string[] = body.filters || (body.filter ? [body.filter] : ['all']);

    // Action: get_recipients
    if (action === "get_recipients") {
      const recipients = await getRecipients(supabase, filters);
      return new Response(JSON.stringify({ recipients, count: recipients.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get_campaigns (history)
    if (action === "get_campaigns") {
      const { data: campaigns } = await supabase
        .from("wa_campaigns")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      return new Response(JSON.stringify({ campaigns: campaigns || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get_campaign_sends (detail for one campaign)
    if (action === "get_campaign_sends") {
      const { campaign_id } = body;
      if (!campaign_id) throw new Error("campaign_id requerido");
      const { data: sends } = await supabase
        .from("wa_campaign_sends")
        .select("*")
        .eq("campaign_id", campaign_id)
        .order("nombre");
      return new Response(JSON.stringify({ sends: sends || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: get_campaign_pending (recipients NOT yet sent in a campaign)
    if (action === "get_campaign_pending") {
      const { campaign_id } = body;
      if (!campaign_id) throw new Error("campaign_id requerido");

      // Get campaign details
      const { data: campaign } = await supabase
        .from("wa_campaigns")
        .select("*")
        .eq("id", campaign_id)
        .single();
      if (!campaign) throw new Error("Campaña no encontrada");

      // Get already sent phones
      const { data: sentRows } = await supabase
        .from("wa_campaign_sends")
        .select("telefono")
        .eq("campaign_id", campaign_id)
        .eq("status", "sent");
      const sentPhones = new Set((sentRows || []).map((r: any) => r.telefono));

      // Get all recipients for same filters
      const allRecipients = await getRecipients(supabase, campaign.filters || []);
      const pending = allRecipients.filter(r => r.telefono && !sentPhones.has(r.telefono.replace(/[\s\-\(\)]/g, "")));

      return new Response(JSON.stringify({
        campaign,
        pending,
        count: pending.length,
        already_sent: sentPhones.size,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: send_campaign
    if (action === "send_campaign") {
      const apiToken = Deno.env.get("WHATSAPP_OTP_TOKEN");
      if (!apiToken) throw new Error("WHATSAPP_OTP_TOKEN not configured");

      const { message, image_url, delay_seconds = 2, recipient_phones, manual_recipients } = body;

      // Build final recipient list
      let finalRecipients: { telefono: string; nombre: string; empresa_nombre: string }[];

      if (recipient_phones && Array.isArray(recipient_phones)) {
        const allFromDb = await getRecipients(supabase, filters);
        const phoneSet = new Set(recipient_phones);
        finalRecipients = allFromDb.filter(r => r.telefono && phoneSet.has(r.telefono));
      } else {
        finalRecipients = await getRecipients(supabase, filters);
      }

      // Add manual recipients
      if (manual_recipients && Array.isArray(manual_recipients)) {
        for (const m of manual_recipients) {
          if (m.telefono) {
            finalRecipients.push({
              telefono: m.telefono,
              nombre: m.nombre || m.telefono,
              empresa_nombre: "",
            });
          }
        }
      }

      log("Campaign started", { filters, recipientCount: finalRecipients.length, delay: delay_seconds, hasImage: !!image_url });

      // Create campaign record
      const { data: campaignRow } = await supabase
        .from("wa_campaigns")
        .insert({
          message: message || null,
          image_url: image_url || null,
          filters,
          total_recipients: finalRecipients.length,
          status: "sending",
        })
        .select("id")
        .single();

      const campaignId = campaignRow?.id;

      let sent = 0;
      let failed = 0;
      const errors: string[] = [];
      const delayMs = (delay_seconds || 2) * 1000;
      const sendRecords: any[] = [];

      for (let i = 0; i < finalRecipients.length; i++) {
        const r = finalRecipients[i];
        if (!r.telefono) { failed++; continue; }

        const normalizedPhone = r.telefono.replace(/[\s\-\(\)]/g, "");
        const personalizedMsg = (message || "")
          .replace(/\{nombre\}/g, r.nombre || "")
          .replace(/\{empresa\}/g, r.empresa_nombre || "")
          .replace(/\{telefono\}/g, normalizedPhone);

        let sendStatus = "sent";
        let errorDetalle: string | null = null;

        try {
          if (image_url) {
            log("Sending image", { phone: normalizedPhone, url: image_url });
            const imgRes = await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": apiToken },
              body: JSON.stringify({
                action: "send-image",
                phone: normalizedPhone,
                url: image_url,
                caption: personalizedMsg || "",
              }),
            });
            const imgBody = await imgRes.text();
            log("Image response", { status: imgRes.status, body: imgBody });
            if (!imgRes.ok) {
              throw new Error(`Image send failed: ${imgBody}`);
            }
          } else if (personalizedMsg) {
            const textRes = await fetch(WHATSAPI_URL, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-api-token": apiToken },
              body: JSON.stringify({
                action: "send-text",
                phone: normalizedPhone,
                message: personalizedMsg,
              }),
            });
            if (!textRes.ok) {
              throw new Error(`Text send failed: ${await textRes.text()}`);
            }
          }

          sent++;
        } catch (e) {
          failed++;
          sendStatus = "failed";
          errorDetalle = (e as Error).message;
          errors.push(`${r.nombre} (${normalizedPhone}): ${errorDetalle}`);
          log("Send failed", { phone: normalizedPhone, error: errorDetalle });
        }

        // Record individual send
        sendRecords.push({
          campaign_id: campaignId,
          telefono: normalizedPhone,
          nombre: r.nombre || null,
          empresa_nombre: r.empresa_nombre || null,
          status: sendStatus,
          error_detalle: errorDetalle,
        });

        // Configurable delay between messages
        if (i < finalRecipients.length - 1) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      // Batch insert send records
      if (sendRecords.length > 0 && campaignId) {
        await supabase.from("wa_campaign_sends").insert(sendRecords);
      }

      // Update campaign totals
      if (campaignId) {
        await supabase.from("wa_campaigns").update({
          total_sent: sent,
          total_failed: failed,
          status: "completed",
        }).eq("id", campaignId);
      }

      log("Campaign completed", { campaignId, sent, failed, total: finalRecipients.length });

      return new Response(JSON.stringify({ success: true, sent, failed, total: finalRecipients.length, campaign_id: campaignId, errors: errors.slice(0, 10) }), {
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

async function getRecipients(supabase: any, filters: string[]): Promise<Recipient[]> {
  const { data: subs } = await supabase
    .from("subscriptions")
    .select("empresa_id, status, trial_ends_at, stripe_subscription_id, empresas:empresa_id(nombre)");

  if (!subs) return [];

  const empresaStatus: Record<string, { status: string; hasStripe: boolean; nombre: string }> = {};
  for (const s of subs) {
    empresaStatus[s.empresa_id] = {
      status: s.status,
      hasStripe: !!s.stripe_subscription_id,
      nombre: (s.empresas as any)?.nombre || "Sin nombre",
    };
  }

  // If 'all' is in filters, return everything
  if (filters.includes('all')) {
    const allIds = Object.keys(empresaStatus);
    return await getProfilesForEmpresas(supabase, allIds, empresaStatus);
  }

  // Merge results from all selected filters (union)
  const matchedIds = new Set<string>();

  for (const filter of filters) {
    const entries = Object.entries(empresaStatus);
    let ids: string[] = [];

    switch (filter) {
      case "trial":
        ids = entries.filter(([, v]) => v.status === "trial").map(([k]) => k);
        break;
      case "active_paying":
        ids = entries.filter(([, v]) => v.status === "active" && v.hasStripe).map(([k]) => k);
        break;
      case "suspended":
        ids = entries.filter(([, v]) => v.status === "suspended").map(([k]) => k);
        break;
      case "past_due":
        ids = entries.filter(([, v]) => ["past_due", "gracia"].includes(v.status)).map(([k]) => k);
        break;
      case "never_paid":
        ids = entries.filter(([, v]) => !v.hasStripe && ["suspended", "past_due", "gracia"].includes(v.status)).map(([k]) => k);
        break;
    }

    ids.forEach(id => matchedIds.add(id));
  }

  if (matchedIds.size === 0) return [];
  return await getProfilesForEmpresas(supabase, Array.from(matchedIds), empresaStatus);
}

async function getProfilesForEmpresas(
  supabase: any,
  empresaIds: string[],
  empresaStatus: Record<string, { status: string; hasStripe: boolean; nombre: string }>
): Promise<Recipient[]> {
  if (empresaIds.length === 0) return [];

  const { data: profiles } = await supabase
    .from("profiles")
    .select("nombre, telefono, empresa_id")
    .in("empresa_id", empresaIds)
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
