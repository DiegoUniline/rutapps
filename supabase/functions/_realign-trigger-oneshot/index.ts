// Trigger de un solo uso para ejecutar billing-realign-to-month-start
// desde el sandbox sin exponer CRON_SECRET. BORRAR después de usar.
import { createClient } from "npm:@supabase/supabase-js@2.57.2";

Deno.serve(async (req) => {
  const body = await req.json().catch(() => ({}));
  const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/billing-realign-to-month-start`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-cron-secret": Deno.env.get("CRON_SECRET") || "",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return new Response(text, { status: res.status, headers: { "Content-Type": "application/json" } });
});
