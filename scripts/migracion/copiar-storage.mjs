#!/usr/bin/env node
// Copia los archivos de Storage del proyecto viejo (Lovable) al Supabase propio.
// Requiere la edge function temporal migracion-export-storage en el proyecto viejo.
// Se puede correr varias veces: solo sube lo nuevo o lo que cambió de tamaño
// (manifiesto local copiar-storage.manifest.json). Node 18+, sin dependencias.
//
// Variables:
//   OLD_URL, OLD_ANON_KEY          proyecto viejo (URL y anon key públicas)
//   MIGRACION_TOKEN                el mismo token pegado en la función temporal
//   NEW_URL, NEW_SERVICE_ROLE_KEY  proyecto nuevo (service_role: Settings > API Keys)
//   OMITIR_BUCKETS                 opcional, ids separados por coma
//                                  (default: database_export_16_10_26,database_export_16_11_26)
import fs from "node:fs";

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`Falta ${k}`); process.exit(1); } return v; };
const OLD_URL = need("OLD_URL"), OLD_ANON = need("OLD_ANON_KEY"), TOKEN = need("MIGRACION_TOKEN");
const NEW_URL = need("NEW_URL"), NEW_KEY = need("NEW_SERVICE_ROLE_KEY");
const OMITIR = (process.env.OMITIR_BUCKETS ?? "database_export_16_10_26,database_export_16_11_26").split(",").map((s) => s.trim()).filter(Boolean);
const MANIFEST = "copiar-storage.manifest.json";
const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : {};
const guardar = () => fs.writeFileSync(MANIFEST, JSON.stringify(manifest));

async function viejo(body) {
  const r = await fetch(`${OLD_URL}/functions/v1/migracion-export-storage`, {
    method: "POST",
    headers: { Authorization: `Bearer ${OLD_ANON}`, apikey: OLD_ANON, "x-migracion-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`export ${r.status}: ${j.error ?? ""}`);
  return j;
}

async function subir(bucket, f) {
  const key = `${bucket}/${f.path}`;
  if (manifest[key] !== undefined && manifest[key] === f.size) return "igual";
  for (let intento = 1; intento <= 3; intento++) {
    try {
      const d = await fetch(f.signedUrl);
      if (!d.ok) throw new Error(`descarga ${d.status}`);
      const buf = Buffer.from(await d.arrayBuffer());
      const u = await fetch(`${NEW_URL}/storage/v1/object/${bucket}/${f.path.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${NEW_KEY}`, apikey: NEW_KEY, "x-upsert": "true", "Content-Type": f.mimetype || d.headers.get("content-type") || "application/octet-stream" },
        body: buf,
      });
      if (!u.ok) throw new Error(`subida ${u.status}: ${(await u.text()).slice(0, 200)}`);
      manifest[key] = f.size;
      return "subido";
    } catch (e) {
      if (intento === 3) throw e;
      await new Promise((r) => setTimeout(r, 1000 * intento));
    }
  }
}

async function enParalelo(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}

const { buckets } = await viejo({ action: "buckets" });
const errores = [];
for (const b of buckets) {
  if (OMITIR.includes(b.id)) { console.log(`- ${b.id}: omitido`); continue; }
  const top = await viejo({ action: "top", bucket: b.id });
  const lotes = [top.files];
  for (const dir of top.dirs) lotes.push((await viejo({ action: "tree", bucket: b.id, prefix: dir })).files);
  const files = lotes.flat();
  const cuenta = { subido: 0, igual: 0, error: 0 };
  await enParalelo(files, 6, async (f) => {
    try { cuenta[await subir(b.id, f)]++; }
    catch (e) { cuenta.error++; errores.push(`${b.id}/${f.path}: ${e.message}`); }
  });
  guardar();
  console.log(`- ${b.id}: ${files.length} archivos · subidos ${cuenta.subido} · sin cambio ${cuenta.igual} · errores ${cuenta.error}`);
}
if (errores.length) {
  fs.writeFileSync("copiar-storage.errores.txt", errores.join("\n"));
  console.log(`Errores: ${errores.length} (ver copiar-storage.errores.txt). Vuelve a correr para reintentar.`);
  process.exit(1);
}
console.log("Storage copiado.");
