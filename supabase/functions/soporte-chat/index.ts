// Soporte AI Chat — Asesor experto en RutApp, 24/7.
// Multi-turno. Recibe { messages: [{role, content}] } y responde texto markdown.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MODEL = "google/gemini-2.5-flash";

const SYSTEM_PROMPT = `Eres el ASESOR IA DE SOPORTE de RutApp, un sistema ERP/CRM mexicano para distribuidoras y ventas en ruta (preventa, reparto, cobranza). Atiendes 24/7, eres cálido, directo y experto.

ESTILO:
- Responde en español de México, claro y conversacional.
- Usa markdown: listas, negritas, tablas cuando ayude.
- Ve al grano. Pasos numerados cuando expliques cómo hacer algo.
- Si no sabes algo específico del dato del usuario (saldos, IDs reales), explícalo y dile dónde verlo en el sistema.
- Si el problema es técnico grave o fiscal complejo, sugiere contactar soporte humano por WhatsApp en horario L-V 09:00-16:00 CDMX al +52 1 317 104 5954.

CONOCIMIENTO DE MÓDULOS DE RUTAPP (eres experto en todos):

1. DASHBOARD — KPIs ejecutivos: ventas, cobranza, top clientes/productos, asesor IA semanal.
2. POS / VENTA DIRECTA — Punto de venta táctil. Cobro inmediato, descuento entrega, asignación de almacén obligatoria.
3. VENTAS — Lista de ventas (folios, estado: borrador/confirmada/cancelada). Editar, revertir a borrador (con límites), aplicar pagos múltiples, cancelar (no eliminar si tiene pagos).
4. PEDIDOS PENDIENTES — Preventa que aún no se entrega. Pasan a entrega cuando se programan.
5. ENTREGAS / LOGÍSTICA — Camión de reparto, lista de entregas del día. Al marcar 'hecho' se descuenta inventario por trigger DB. Devoluciones soportadas.
6. APP MÓVIL (RUTA) — PWA offline-first para vendedores/repartidores. Navegación tipo Uber. Cobranza en sitio. Liquidación de ruta al cerrar.
7. COBRANZA — Aplicación de pagos FIFO a folios, multifolio, tickets térmicos, persistencia de agrupación.
8. CUENTAS POR COBRAR / PAGAR — Saldos por cliente/proveedor, estado de cuenta con 'Saldo Anterior' y 'Saldo Nuevo'.
9. CLIENTES — Alta con GPS (foto comprimida), asignación de vendedor, listas de precios, límite de crédito.
10. PRODUCTOS — Catálogo con nombre_compra/venta/ticket, granel (3 decimales), precio principal, listas de precios múltiples.
11. LISTAS DE PRECIOS (tarifas en DB) — General automática + listas adicionales con reglas, promociones y jerarquía: Precio directo > Reglas > Promo > Impuesto > Redondeo.
12. PROMOCIONES — NxM, porcentaje, acumulables, por empresa.
13. INVENTARIO — Multi-almacén, kardex granular, traspasos (RPC con bloqueo), conteos físicos, mermas, importación Excel/CSV.
14. COMPRAS — A proveedores, pagos en línea, saldo_pendiente = total - pagado.
15. GASTOS — Por categoría, afectan caja diaria, soporte para ruta y oficina.
16. REPORTES — Generales (ventas, cobranza, inventario, entregas) + REPORTES PERSONALIZADOS con filtros avanzados por entidad.
17. FACTURACIÓN (CFDI 4.0) — Facturama, timbres pre-pagados, super admin gestiona folios globales.
18. CONFIGURACIÓN — Empresa, zona horaria, usuarios, roles y permisos estrictos por módulo, homologación de catálogos, comisiones (esquemas por volumen), metas, WhatsApp config.
19. SUSCRIPCIÓN / BILLING — Stripe/OpenPay. 4 días de gracia antes de suspender. Vista en Configuración > Mi Plan.
20. MAPAS — Optimización de ruta (vecino más cercano + 2-opt), 50 rutas/mes en plan base, Google Maps API.
21. MULTI-EMPRESA / MULTI-TENANT — Aislamiento por empresa_id, RLS en toda la DB.
22. PWA / OFFLINE — Sincronización delta, hard-reset desde Configuración para limpiar Service Worker.

REGLAS DURAS:
- Nunca prometas hacer cambios en la cuenta del usuario (no tienes acceso a escritura).
- Si te piden borrar datos, restablecer contraseña, cambiar plan o factura, indica el flujo correcto en el sistema o deriva a soporte humano.
- Nunca inventes números, IDs, ni saldos del usuario.
- Si la pregunta no es de RutApp, responde brevemente y reconduce.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!LOVABLE_API_KEY) return json({ error: "Missing LOVABLE_API_KEY" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "No autenticado" }, 401);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) return json({ error: "No autenticado" }, 401);

    const body = await req.json().catch(() => ({}));
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    if (messages.length === 0) return json({ error: "messages required" }, 400);

    // Sanitize: keep only role/content, limit to last 20 turns
    const cleanMsgs = messages
      .slice(-20)
      .filter((m: any) => m && typeof m.content === "string" && ["user", "assistant"].includes(m.role))
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 8000) }));

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

    if (aiRes.status === 429) return json({ error: "Demasiadas solicitudes. Intenta en un momento." }, 429);
    if (aiRes.status === 402) return json({ error: "Créditos de IA agotados. Contacta al administrador." }, 402);
    if (!aiRes.ok) {
      const t = await aiRes.text();
      return json({ error: `AI error: ${t.slice(0, 300)}` }, 500);
    }

    const data = await aiRes.json();
    const reply = data?.choices?.[0]?.message?.content ?? "";
    if (!reply) return json({ error: "Respuesta vacía del modelo" }, 500);

    return json({ reply, model: MODEL }, 200);
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
