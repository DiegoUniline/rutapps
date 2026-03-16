import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY no configurada");

    const body = await req.json();
    const { pdf_base64 } = body;

    if (!pdf_base64) throw new Error("Falta pdf_base64");

    // Use Gemini vision to parse the CSF PDF
    const response = await fetch(AI_GATEWAY, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analiza esta Constancia de Situación Fiscal del SAT mexicano y extrae los siguientes datos en formato JSON exacto (sin markdown, solo el JSON):
{
  "rfc": "RFC del contribuyente",
  "razon_social": "Nombre o Razón Social completa",
  "regimen_fiscal": "Clave del régimen fiscal (solo el número, ej: 601, 612, 621)",
  "cp": "Código postal del domicilio fiscal",
  "direccion": "Calle y número exterior",
  "colonia": "Nombre de la colonia",
  "ciudad": "Municipio o alcaldía",
  "estado": "Entidad federativa"
}

Si algún dato no está disponible, usa null. El régimen fiscal debe ser SOLO la clave numérica (ej: "612"), no la descripción completa.`,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdf_base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI Gateway error:", errText);
      throw new Error(`Error del servicio AI: ${response.status}`);
    }

    const aiResult = await response.json();
    const rawContent = aiResult.choices?.[0]?.message?.content || "";
    console.log("AI raw response:", rawContent);

    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = rawContent;
    const jsonMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON
      const braceMatch = rawContent.match(/\{[\s\S]*\}/);
      if (braceMatch) jsonStr = braceMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return new Response(
      JSON.stringify({ success: true, data: parsed }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
