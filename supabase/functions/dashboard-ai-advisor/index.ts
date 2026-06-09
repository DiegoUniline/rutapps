// Lovable AI advisor for executive dashboard.
// - Authenticates the user via JWT
// - Enforces max 3 generations per user per day
// - Uses a low-cost model
// - Persists each recommendation in dashboard_ai_recomendaciones
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const DAILY_LIMIT = 3;
const MODEL = "google/gemini-2.5-flash-lite"; // cheapest tier

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) {
      return json({ error: "Missing LOVABLE_API_KEY" }, 500);
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autenticado" }, 401);

    const supabaseAuth = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);
    const userId = userData.user.id;

    const { data: profile, error: profErr } = await supabaseAuth
      .from("profiles")
      .select("empresa_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profErr || !profile?.empresa_id) return json({ error: "Perfil sin empresa" }, 403);
    const empresaId = profile.empresa_id;

    // Count today's runs (UTC day window; close enough for a per-day quota)
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const { count, error: cntErr } = await supabaseAuth
      .from("dashboard_ai_recomendaciones")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", since.toISOString());
    if (cntErr) return json({ error: cntErr.message }, 500);
    const usedToday = count ?? 0;

    const body = await req.json().catch(() => ({}));
    const { snapshot, empresaNombre } = body ?? {};
    if (!snapshot) return json({ error: "snapshot required" }, 400);

    if (usedToday >= DAILY_LIMIT) {
      return json({
        error: `Alcanzaste el límite de ${DAILY_LIMIT} análisis por día. Inténtalo mañana.`,
        usedToday,
        dailyLimit: DAILY_LIMIT,
      }, 429);
    }

    const system = `Eres un asesor administrativo y financiero experto para PYMES de distribución y ventas en ruta en México. Tu trabajo es interpretar los KPIs del negocio y dar consejos claros, accionables y específicos en español neutral.

REGLAS:
- Responde en MARKDOWN bien estructurado con secciones cortas.
- Usa estas 4 secciones EXACTAS y en este orden:
  ## 📊 Diagnóstico general
  ## 🚀 Oportunidades clave
  ## ⚠️ Riesgos detectados
  ## ✅ Acciones recomendadas (próximos 7 días)
- En "Acciones recomendadas" da entre 3 y 5 bullets concretos con prioridad (Alta/Media/Baja) y resultado esperado.
- Cita números reales del snapshot. Usa formato de moneda en MXN (ej. $12,450 MXN).
- Sé directo y ejecutivo. Nada de relleno, advertencias genéricas ni disclaimers legales.
- Si detectas concentración Pareto (pocos clientes/productos = mayor parte de ventas), señálalo como riesgo de dependencia.
- Si el crecimiento mes vs mes es negativo, explica posibles causas operativas.
- Si hay cartera vencida alta, sugiere estrategias de cobranza.
- Máximo 500 palabras totales.`;

    const userPrompt = `Empresa: ${empresaNombre ?? "(sin nombre)"}\n\nSnapshot de KPIs en JSON:\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n\nAnaliza y entrega tu asesoría administrativa siguiendo la estructura exigida.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) return json({ error: "Límite de IA alcanzado. Intenta en unos minutos." }, 429);
    if (aiRes.status === 402) return json({ error: "Créditos de IA agotados. Contacta al administrador." }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI error: ${t.slice(0, 300)}` }, 500);
    }

    const data = await aiRes.json();
    const advice = data?.choices?.[0]?.message?.content ?? "";
    if (!advice) return json({ error: "Respuesta vacía del modelo" }, 500);

    // Persist
    const { data: inserted, error: insErr } = await supabaseAuth
      .from("dashboard_ai_recomendaciones")
      .insert({
        empresa_id: empresaId,
        user_id: userId,
        content: advice,
        snapshot,
        model: MODEL,
      })
      .select("id, created_at")
      .single();
    if (insErr) {
      // Still return advice but flag persistence error
      return json({ advice, usedToday: usedToday + 1, dailyLimit: DAILY_LIMIT, persisted: false, warn: insErr.message }, 200);
    }

    return json({
      advice,
      id: inserted.id,
      createdAt: inserted.created_at,
      usedToday: usedToday + 1,
      dailyLimit: DAILY_LIMIT,
      persisted: true,
    }, 200);
  } catch (e: any) {
    return json({ error: e?.message ?? "unknown error" }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
