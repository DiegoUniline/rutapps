// Lovable AI advisor for executive dashboard.
// Receives a JSON snapshot of KPIs and returns markdown advice.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { snapshot, empresaNombre } = await req.json();
    if (!snapshot) {
      return new Response(JSON.stringify({ error: "snapshot required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (aiRes.status === 429) {
      return new Response(JSON.stringify({ error: "Límite de uso alcanzado. Intenta de nuevo en unos minutos." }), {
        status: 429,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (aiRes.status === 402) {
      return new Response(JSON.stringify({ error: "Créditos de IA agotados. Contacta al administrador para recargar." }), {
        status: 402,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return new Response(JSON.stringify({ error: `AI error: ${t.slice(0, 300)}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiRes.json();
    const advice = data?.choices?.[0]?.message?.content ?? "";

    return new Response(JSON.stringify({ advice }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message ?? "unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
