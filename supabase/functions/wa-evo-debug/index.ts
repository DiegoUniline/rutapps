// TEMPORARY diagnostic endpoint for Evolution API instances. Returns only
// non-sensitive connection state. Delete after debugging.
const EVOLUTION_URL = Deno.env.get("EVOLUTION_API_URL") ?? "";
const EVOLUTION_KEY = Deno.env.get("EVOLUTION_API_KEY") ?? "";

Deno.serve(async (req) => {
  const payload: any = await req.json().catch(() => ({}));
  const instance = payload.instance;
  if (!instance) return new Response(JSON.stringify({ error: "instance requerido" }), { status: 400 });

  const call = async (path: string) => {
    const r = await fetch(`${EVOLUTION_URL.replace(/\/$/, "")}${path}`, {
      headers: { apikey: EVOLUTION_KEY },
    });
    const t = await r.text();
    let j: unknown = t;
    try { j = JSON.parse(t); } catch { /* ignore */ }
    return { status: r.status, body: j };
  };

  const { send, number, exists } = payload;
  if (exists) {
    const r = await fetch(`${EVOLUTION_URL.replace(/\/$/, "")}/chat/whatsappNumbers/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ numbers: exists }),
    });
    return new Response(JSON.stringify({ status: r.status, body: await r.text() }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (send && number) {
    const r = await fetch(`${EVOLUTION_URL.replace(/\/$/, "")}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: EVOLUTION_KEY },
      body: JSON.stringify({ number, text: String(send) }),
    });
    const t = await r.text();
    return new Response(JSON.stringify({ sendStatus: r.status, sendBody: t }, null, 2), {
      headers: { "Content-Type": "application/json" },
    });
  }

  const state = await call(`/instance/connectionState/${instance}`);
  const fetched = await call(`/instance/fetchInstances?instanceName=${instance}`);
  const all = await call(`/instance/fetchInstances`);

  const summarize = (b: any) => {
    const arr = Array.isArray(b) ? b : (Array.isArray(b?.instances) ? b.instances : []);
    return arr.map((x: any) => ({
      name: x?.name ?? x?.instance?.instanceName ?? null,
      status: x?.connectionStatus ?? x?.instance?.status ?? null,
      owner: x?.ownerJid ?? x?.instance?.owner ?? null,
    }));
  };

  return new Response(JSON.stringify({
    hasUrl: !!EVOLUTION_URL,
    state,
    fetchedSummary: summarize(fetched.body),
    fetchedStatus: fetched.status,
    allSummary: summarize(all.body),
    allStatus: all.status,
  }, null, 2), { headers: { "Content-Type": "application/json" } });
});
