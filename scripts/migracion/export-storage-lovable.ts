// Edge function TEMPORAL para el proyecto VIEJO (Lovable Cloud).
// Nombre: migracion-export-storage. Se borra al terminar la migración.
// Devuelve la lista de archivos de un bucket con URLs firmadas (1 h) para
// que scripts/migracion/copiar-storage.mjs los baje y los suba al Supabase propio.
// Antes de publicarla, reemplaza PEGAR_TOKEN por el valor de MIGRACION_TOKEN.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const TOKEN = "PEGAR_TOKEN";
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (TOKEN === "PEGAR_TOKEN" || req.headers.get("x-migracion-token") !== TOKEN) return json({ error: "no autorizado" }, 401);
  try {
    const { action, bucket, prefix = "" } = await req.json();
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (action === "buckets") {
      const { data, error } = await sb.storage.listBuckets();
      if (error) throw error;
      return json({ buckets: data.map((b) => ({ id: b.id, public: b.public })) });
    }

    // action "top": solo el primer nivel; "tree": todo lo que hay bajo prefix.
    const recursive = action === "tree";
    const dirs: string[] = [];
    const files: { path: string; size: number | null; mimetype: string | null; signedUrl?: string }[] = [];
    const stack = [prefix];
    while (stack.length) {
      const dir = stack.pop()!;
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await sb.storage.from(bucket).list(dir, { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
        if (error) throw error;
        for (const it of data) {
          const p = dir ? `${dir}/${it.name}` : it.name;
          if (it.id === null) (recursive ? stack.push(p) : dirs.push(p));
          else files.push({ path: p, size: (it.metadata as any)?.size ?? null, mimetype: (it.metadata as any)?.mimetype ?? null });
        }
        if (data.length < 1000) break;
      }
    }
    for (let i = 0; i < files.length; i += 100) {
      const chunk = files.slice(i, i + 100);
      const { data, error } = await sb.storage.from(bucket).createSignedUrls(chunk.map((f) => f.path), 3600);
      if (error) throw error;
      data.forEach((d, j) => (chunk[j].signedUrl = d.signedUrl ?? undefined));
    }
    return json({ bucket, prefix, dirs, files });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
