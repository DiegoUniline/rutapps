// Lovable AI advisor for executive dashboard.
// - Authenticates the user via JWT
// - Enforces max 4 generations per user per month (~1 per week)
// - Uses a low-cost model
// - Persists each recommendation in dashboard_ai_recomendaciones
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MONTHLY_LIMIT = 4;
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
    const realEmpresaId = profile.empresa_id;

    const body = await req.json().catch(() => ({}));
    const { snapshot, empresaNombre, empresaId: requestedEmpresaId } = body ?? {};
    if (!snapshot) return json({ error: "snapshot required" }, 400);

    // Resolve effective empresa: client may pass an override (super admin viewing another tenant).
    // Validate the override before trusting it.
    let empresaId = realEmpresaId;
    if (requestedEmpresaId && requestedEmpresaId !== realEmpresaId) {
      const { data: isSuper } = await supabaseAuth.rpc("is_super_admin", { p_user_id: userId });
      if (isSuper) {
        empresaId = requestedEmpresaId;
      } else {
        return json({ error: "No autorizado para esta empresa" }, 403);
      }
    }

    // Count this month's runs scoped to the EFFECTIVE empresa (UTC month)
    const since = new Date();
    since.setUTCDate(1);
    since.setUTCHours(0, 0, 0, 0);
    const { count, error: cntErr } = await supabaseAuth
      .from("dashboard_ai_recomendaciones")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("empresa_id", empresaId)
      .gte("created_at", since.toISOString());
    if (cntErr) return json({ error: cntErr.message }, 500);
    const usedThisMonth = count ?? 0;

    if (usedThisMonth >= MONTHLY_LIMIT) {
      return json({
        error: `Alcanzaste el límite de ${MONTHLY_LIMIT} análisis por mes. Inténtalo el próximo mes.`,
        usedThisMonth,
        monthlyLimit: MONTHLY_LIMIT,
      }, 429);
    }

    // Date context (Mexico City) — para que el modelo no malinterprete meses incompletos
    const nowMx = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Mexico_City" }));
    const year = nowMx.getFullYear();
    const monthIdx = nowMx.getMonth();
    const diaActual = nowMx.getDate();
    const diasEnMes = new Date(year, monthIdx + 1, 0).getDate();
    const pctMesTranscurrido = Math.round((diaActual / diasEnMes) * 100);
    const fechaHoyStr = nowMx.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const dateContext = {
      fechaHoy: fechaHoyStr,
      diaDelMes: diaActual,
      diasEnMes,
      pctMesTranscurrido,
      mesAnteriorCompleto: true,
    };

    const system = `Eres un ANALISTA DE DATOS SENIOR y ASESOR ESTRATÉGICO para PYMES de distribución y ventas en ruta en México. Tu rol es interpretar KPIs como lo haría un consultor de alto desempeño (estilo McKinsey/Bain ejecutivo): datos primero, hipótesis claras, conclusiones accionables.

CONTEXTO TEMPORAL CRÍTICO:
- Hoy es ${fechaHoyStr}. Llevamos solo ${diaActual} de ${diasEnMes} días del mes (${pctMesTranscurrido}% transcurrido).
- NUNCA compares el mes en curso vs el mes anterior sin PRORRATEAR. Si junio lleva 9 días y mayo tuvo 31, debes proyectar: (ventas_actuales / dias_transcurridos) * dias_totales_mes para estimar el cierre del mes, y comparar la PROYECCIÓN vs el mes anterior — no el dato bruto parcial.
- Si una caída aparente se explica por el mes incompleto, dilo explícitamente y muestra la proyección. NO alarmes sin fundamento.

ESTRUCTURA OBLIGATORIA (markdown, EXACTAMENTE estas 5 secciones con ## y en este orden):

## 📊 Resumen ejecutivo
2-3 párrafos cortos. Estado general del negocio HOY, con la corrección de prorrateo si aplica. Menciona 3-4 números clave reales del snapshot. Sé directo, sin relleno.

## 💰 Análisis de Ventas
- Tendencia real (con prorrateo del mes en curso).
- Concentración Pareto: qué % concentran los top 2-3 productos y top 2-3 clientes. Riesgo de dependencia.
- Desempeño por vendedor (quién crece, quién cae, por qué hipotético).
- 2-3 acciones tácticas específicas con resultado esperado cuantificado.

## 🧾 Cobranza y Cartera
- Eficiencia de cobranza vs ventas (%).
- Composición de morosidad (concentrada vs atomizada, promedio por cliente).
- Riesgo de cartera y acciones de cobranza concretas (segmentación por antigüedad, suspensión de crédito, etc.).

## 📦 Stock y Operatividad
- Stock crítico y productos bajo mínimo.
- Operación del día (visitas, entregas, vendedores activos).
- Señales de calidad de datos (inventario en $0, gastos anormalmente bajos, etc.) — marca como hipótesis a auditar.

## 🎯 Plan de acción 7 días
Tabla o lista priorizada con 4-6 acciones. Cada acción debe incluir:
- **Prioridad** (Alta/Media/Baja)
- **Acción específica** (no genérica)
- **Responsable sugerido** (Dueño / Vendedor líder / Cobranza / Almacén)
- **KPI a mover** y meta numérica
- **Plazo** (1-3 / 4-7 días)

REGLAS DURAS:
- Cita SIEMPRE números reales del snapshot. Moneda en MXN ($12,450 MXN).
- Nunca uses lenguaje alarmista sobre el mes en curso sin prorratear.
- No incluyas disclaimers legales ni "consulta a un profesional".
- Máximo 700 palabras totales repartidas entre las 5 secciones.
- Si un dato falta o es $0 sospechoso, marca "⚠️ Auditar dato" en vez de inventar.`;

    const userPrompt = `Empresa: ${empresaNombre ?? "(sin nombre)"}\n\nContexto temporal:\n\`\`\`json\n${JSON.stringify(dateContext, null, 2)}\n\`\`\`\n\nSnapshot de KPIs:\n\n\`\`\`json\n${JSON.stringify(snapshot, null, 2)}\n\`\`\`\n\nEntrega tu análisis estratégico siguiendo EXACTAMENTE la estructura de 5 secciones.`;

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
