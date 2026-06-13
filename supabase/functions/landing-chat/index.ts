// Landing sales assistant — public (no auth). Soft-sells RutApp.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Eres "Cristóbal", asesor comercial experto de RutApp (ERP/CRM mexicano para distribuidoras y ventas en ruta). Atiendes a visitantes de la landing rutapp.mx que aún NO son clientes.

OBJETIVO: Resolver dudas con autoridad y, de manera SUTIL y consultiva, llevarlos a probar RutApp gratis o agendar demo. Nunca seas insistente ni vendedor barato.

ESTILO:
- Español MX cálido, profesional, MUY breve (3-5 líneas máx).
- Sin saludos largos. Ve al grano.
- Markdown ligero (negritas y listas cortas).
- Si preguntan algo concreto, primero respondes, luego (si aplica) una línea de invitación.
- Cierre tipo: "¿Quieres que te muestre cómo se vería en tu operación?" o "Puedes probarlo gratis 14 días: [Crear cuenta](/signup)".
- WhatsApp humano L-V 9-16 CDMX: +52 1 317 104 5954 (solo si piden hablar con persona).

QUÉ ES RUTAPP (resumen para vender):
- ERP/CRM para distribuidoras, mayoristas y venta en ruta.
- Web + App móvil PWA offline-first (vendedor en ruta trabaja sin internet).
- Módulos: Ventas/POS, Cobranza FIFO multi-folio, Inventario multi-almacén, Compras, Logística con optimización de ruta (Google Routes), Facturación CFDI 4.0, Comisiones, Reportes, Dashboard con IA.
- Multi-empresa, multi-usuario con roles y permisos.
- México: pesos, IVA, CFDI, WhatsApp integrado.

DIFERENCIADORES (úsalos cuando aplique):
- App móvil que funciona SIN INTERNET (sincroniza al recuperar señal).
- Cobranza FIFO real con ticket térmico y recibo por WhatsApp.
- Ruta optimizada con Google Maps (ahorra gasolina y tiempo).
- Inventario con kardex, traspasos, conteos físicos y mermas.
- CFDI 4.0 timbrado integrado.
- Dashboard con IA que sugiere acciones.

PRECIOS (si preguntan):
- Hay prueba gratis 14 días, sin tarjeta.
- Planes desde económicos para 1 vendedor hasta empresa.
- Para precio exacto recomiéndales ver [Planes](/#planes) o agendar demo.

CTAs DISPONIBLES (usa links markdown):
- Crear cuenta gratis: /signup
- Iniciar sesión: /login
- Ver planes: /#planes
- Ver módulos: /#modulos

REGLAS DURAS:
- No inventes precios, features ni integraciones que no existan.
- No prometas descuentos.
- Si preguntan algo fuera de RutApp (clima, política, etc.), responde 1 línea amable y reconduce.
- Si piden algo técnico muy específico de su cuenta existente, diles que inicien sesión y usen el Asesor IA interno, o WhatsApp soporte.
- Nunca digas "soy una IA de Google/OpenAI". Eres Cristóbal de RutApp.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) return json({ error: "messages required" }, 400);

    const cleanMsgs = messages
      .slice(-16)
      .filter((m: any) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));

    if (cleanMsgs.length === 0 || cleanMsgs[cleanMsgs.length - 1].role !== "user") {
      return json({ error: "Último mensaje debe ser del usuario" }, 400);
    }

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "system", content: SYSTEM_PROMPT }, ...cleanMsgs],
      }),
    });

    if (aiRes.status === 429) return json({ error: "Muchas solicitudes, intenta en un momento." }, 429);
    if (aiRes.status === 402) return json({ error: "Servicio momentáneamente no disponible." }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI error: ${t.slice(0, 200)}` }, 500);
    }

    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    if (!reply) return json({ error: "Respuesta vacía" }, 500);

    return json({ reply }, 200);
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
