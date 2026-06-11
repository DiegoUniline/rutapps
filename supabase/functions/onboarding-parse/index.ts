// Parsea texto en lenguaje natural y extrae datos estructurados
// para crear producto o cliente en el onboarding.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash-lite";

const SYS_PRODUCTO = `Eres un asistente que extrae datos de productos para un PYME mexicano.
Devuelve SOLO JSON con esta forma exacta:
{"nombre": string, "codigo": string, "precio": number, "unidad": "Pieza"|"Caja"|"Kilo"|"Litro"|"Paquete"|"Servicio", "categoria_sugerida": string}
- nombre: descriptivo y limpio (sin precio dentro).
- codigo: SKU corto sugerido (mayúsculas, sin espacios, máx 12 chars). Si no hay pista, deriva del nombre.
- precio: número en pesos MXN. Si no se menciona, 0.
- unidad: una de las opciones. Si no es claro, "Pieza".
- categoria_sugerida: una palabra (Bebidas, Abarrotes, Limpieza, Papelería, Otros, etc).`;

const SYS_CLIENTE = `Eres un asistente que extrae datos de clientes para un PYME mexicano.
Devuelve SOLO JSON con esta forma exacta:
{"nombre": string, "telefono": string, "direccion": string, "colonia": string, "contacto": string}
- nombre: nombre del negocio o persona.
- telefono: solo dígitos, sin formato. Vacío si no hay.
- direccion: calle y número. Vacío si no hay.
- colonia: colonia/zona. Vacío si no hay.
- contacto: nombre del encargado. Vacío si no hay.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autenticado" }, 401);

    const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await sb.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);

    const { tipo, texto } = await req.json().catch(() => ({}));
    if (!tipo || !texto || typeof texto !== "string") {
      return json({ error: "tipo y texto requeridos" }, 400);
    }
    if (tipo !== "producto" && tipo !== "cliente") {
      return json({ error: "tipo inválido" }, 400);
    }

    const system = tipo === "producto" ? SYS_PRODUCTO : SYS_CLIENTE;

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
          { role: "user", content: texto },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (aiRes.status === 429) return json({ error: "Demasiadas solicitudes, intenta en un momento" }, 429);
    if (aiRes.status === 402) return json({ error: "Créditos AI agotados" }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI error: ${t}` }, 500);
    }

    const aiData = await aiRes.json();
    const content = aiData?.choices?.[0]?.message?.content ?? "{}";
    let parsed: Record<string, unknown> = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      return json({ error: "Respuesta AI inválida" }, 500);
    }

    return json({ data: parsed });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
