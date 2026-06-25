import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Store, ExternalLink, Copy, Check, Upload, ImageIcon } from "lucide-react";
import { compressImage } from "@/lib/imageCompressor";
import TiendaClientesAdmin from "./TiendaClientesAdmin";

interface TiendaConfig {
  id?: string;
  empresa_id: string;
  slug: string;
  activa: boolean;
  nombre_tienda: string;
  banner_url: string | null;
  logo_url: string | null;
  color_primario: string;
  color_secundario: string;
  whatsapp_pedidos: string | null;
  lista_precios_default_id: string | null;
  permitir_invitados: boolean;
  usar_lista_cliente: boolean;
  mensaje_bienvenida: string | null;
  beneficios: Beneficio[];
}

interface Beneficio { icon: string; title: string; subtitle: string; enabled: boolean; }

const ICON_OPTIONS = [
  { v: "truck", label: "🚚 Envío" },
  { v: "tag", label: "🏷️ Precio" },
  { v: "shield", label: "🛡️ Seguridad" },
  { v: "headphones", label: "🎧 Soporte" },
  { v: "award", label: "🏆 Calidad" },
  { v: "clock", label: "⏰ Rapidez" },
  { v: "card", label: "💳 Pagos" },
  { v: "gift", label: "🎁 Promos" },
  { v: "package", label: "📦 Empaque" },
  { v: "phone", label: "📞 Teléfono" },
];

const DEFAULT_BENEFICIOS: Beneficio[] = [
  { icon: "truck", title: "Envío rápido", subtitle: "A toda la zona", enabled: true },
  { icon: "tag", title: "Mejores precios", subtitle: "Mayoreo y menudeo", enabled: true },
  { icon: "shield", title: "Compra segura", subtitle: "Pedidos garantizados", enabled: true },
  { icon: "headphones", title: "Soporte directo", subtitle: "WhatsApp y teléfono", enabled: true },
];

interface ListaPrecio { id: string; nombre: string; }

const slugify = (s: string) => s
  .toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/(^-|-$)+/g, "")
  .slice(0, 40);

export default function TiendaConfigPage() {
  const { profile } = useAuth();
  const empresaId = profile?.empresa_id;
  const [cfg, setCfg] = useState<TiendaConfig | null>(null);
  const [empresa, setEmpresa] = useState<{ nombre: string; logo_url: string | null } | null>(null);
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [uploadingBanner, setUploadingBanner] = useState(false);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"general" | "marca" | "precios" | "beneficios" | "clientes">("general");


  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      const [{ data: existing }, { data: lp }, { data: emp }] = await Promise.all([
        supabase.from("tienda_config").select("*").eq("empresa_id", empresaId).maybeSingle(),
        supabase.from("lista_precios").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
        supabase.from("empresas").select("nombre, logo_url").eq("id", empresaId).maybeSingle(),
      ]);
      setListas(lp ?? []);
      setEmpresa(emp ?? null);
      const autoSlug = slugify(emp?.nombre ?? "mi-tienda");
      if (existing) {
        setCfg({ ...(existing as any), slug: (existing as any).slug || autoSlug, beneficios: (existing as any).beneficios ?? DEFAULT_BENEFICIOS } as TiendaConfig);
      } else {
        setCfg({
          empresa_id: empresaId,
          slug: autoSlug,
          activa: false,
          nombre_tienda: emp?.nombre ?? "Mi Tienda",
          banner_url: null,
          logo_url: null,
          color_primario: "#0061e8",
          color_secundario: "#ff7a00",
          whatsapp_pedidos: null,
          lista_precios_default_id: null,
          permitir_invitados: true,
          usar_lista_cliente: true,
          mensaje_bienvenida: null,
          beneficios: DEFAULT_BENEFICIOS,
        });
      }
      setLoading(false);
    })();
  }, [empresaId]);

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !empresaId || !cfg) return;
    setUploadingBanner(true);
    try {
      const compressed = await compressImage(file, { maxWidth: 1920, maxHeight: 600, quality: 0.82, outputType: "image/webp" });
      const path = `${empresaId}/tienda/banner.webp`;
      const { error: upErr } = await supabase.storage.from("empresa-assets").upload(path, compressed, { upsert: true, contentType: "image/webp" });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      setCfg({ ...cfg, banner_url: urlData.publicUrl + "?t=" + Date.now() });
      toast.success("Banner cargado");
    } catch (err: any) {
      toast.error("Error al subir banner: " + err.message);
    } finally {
      setUploadingBanner(false);
      if (bannerInputRef.current) bannerInputRef.current.value = "";
    }
  };

  const save = async () => {
    if (!cfg) return;
    if (!cfg.slug || !cfg.nombre_tienda) {
      toast.error("Slug y nombre son obligatorios");
      return;
    }
    setSaving(true);
    const payload: any = { ...cfg, slug: slugify(cfg.slug) };
    const { data, error } = cfg.id
      ? await supabase.from("tienda_config").update(payload).eq("id", cfg.id).select().single()
      : await supabase.from("tienda_config").insert(payload).select().single();
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ese slug ya está en uso" : error.message);
      return;
    }
    setCfg({ ...(data as any), beneficios: (data as any).beneficios ?? DEFAULT_BENEFICIOS } as TiendaConfig);
    toast.success("Configuración guardada");
  };

  if (loading || !cfg) return (
    <div className="flex items-center justify-center p-12 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando…
    </div>
  );

  const tiendaUrl = `${window.location.origin}/tienda/${slugify(cfg.slug)}`;

  const copy = async () => {
    await navigator.clipboard.writeText(tiendaUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Store className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Tienda en línea</h1>
          <p className="text-sm text-muted-foreground">Activa tu tienda pública para que tus clientes hagan pedidos online.</p>
        </div>
      </div>

      {cfg.id && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-blue-700 font-semibold tracking-wide">URL de tu tienda</div>
            <div className="font-mono text-sm break-all">{tiendaUrl}</div>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={copy} className="px-3 py-2 bg-white border rounded hover:bg-gray-50 text-sm flex items-center gap-1">
              {copied ? <><Check className="h-4 w-4 text-green-600" /> Copiado</> : <><Copy className="h-4 w-4" /> Copiar</>}
            </button>
            <a href={tiendaUrl} target="_blank" rel="noopener noreferrer" className="px-3 py-2 bg-primary text-white rounded text-sm flex items-center gap-1">
              <ExternalLink className="h-4 w-4" /> Abrir
            </a>
          </div>
        </div>
      )}

      <div className="flex gap-1 border-b overflow-x-auto">
        {[
          { id: "general", label: "General" },
          { id: "marca", label: "Marca e imágenes" },
          { id: "precios", label: "Precios y acceso" },
          { id: "beneficios", label: "Beneficios" },
          { id: "clientes", label: "Clientes con acceso" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as any)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 whitespace-nowrap -mb-px ${tab === t.id ? "border-primary text-primary" : "border-transparent text-gray-600 hover:text-gray-900"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "general" && (
        <Section title="Datos generales">
          <Field label="Estado">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={cfg.activa} onChange={(e) => setCfg({ ...cfg, activa: e.target.checked })} className="h-5 w-5" />
              <span className={cfg.activa ? "text-green-700 font-semibold" : "text-gray-600"}>
                {cfg.activa ? "Tienda activa (pública)" : "Inactiva (no accesible)"}
              </span>
            </label>
          </Field>
          <Field label="URL de la tienda (no editable)">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">rutapp.mx/tienda/</span>
              <input className="input flex-1 bg-gray-100 cursor-not-allowed" value={cfg.slug} readOnly />
            </div>
            <div className="text-xs text-gray-500 mt-1">Se genera automáticamente con el nombre de tu empresa. Para cambiarlo, modifica el nombre en Configuración → Empresa.</div>
          </Field>
          <Field label="Nombre visible de la tienda *">
            <input className="input" value={cfg.nombre_tienda} onChange={(e) => setCfg({ ...cfg, nombre_tienda: e.target.value })} />
          </Field>
          <Field label="Mensaje de bienvenida">
            <textarea className="input" rows={2} value={cfg.mensaje_bienvenida ?? ""} onChange={(e) => setCfg({ ...cfg, mensaje_bienvenida: e.target.value })} placeholder="¡Bienvenido a nuestra tienda!" />
          </Field>
        </Section>
      )}

      {tab === "marca" && (
        <Section title="Marca e imágenes">
          <Field label="Logo">
            <div className="flex items-center gap-3">
              {empresa?.logo_url ? (
                <img src={empresa.logo_url} alt="Logo" className="h-16 w-16 rounded border object-contain bg-white" />
              ) : (
                <div className="h-16 w-16 rounded border bg-gray-50 flex items-center justify-center text-gray-400">
                  <ImageIcon className="h-6 w-6" />
                </div>
              )}
              <div className="text-sm text-gray-600">
                Se usa el logo de tu empresa. Para cambiarlo ve a <strong>Configuración → Empresa</strong>.
              </div>
            </div>
          </Field>
          <Field label="Banner / portada (1920×600 recomendado)">
            <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerUpload} className="hidden" />
            {cfg.banner_url && (
              <div className="mb-2 rounded-lg overflow-hidden border bg-gray-50" style={{ aspectRatio: "1920 / 600" }}>
                <img src={cfg.banner_url} alt="Banner" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => bannerInputRef.current?.click()} disabled={uploadingBanner} className="px-3 py-2 bg-white border rounded hover:bg-gray-50 text-sm flex items-center gap-2 disabled:opacity-50">
                {uploadingBanner ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {cfg.banner_url ? "Cambiar banner" : "Subir banner"}
              </button>
              {cfg.banner_url && (
                <button type="button" onClick={() => setCfg({ ...cfg, banner_url: null })} className="px-3 py-2 bg-white border rounded text-sm text-red-600 hover:bg-red-50">Quitar</button>
              )}
            </div>
            <div className="text-xs text-gray-500 mt-1">Se convierte automáticamente a WebP optimizado. Tamaño ideal: 1920×600 px.</div>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Color primario">
              <div className="flex gap-2 items-center">
                <input type="color" value={cfg.color_primario} onChange={(e) => setCfg({ ...cfg, color_primario: e.target.value })} className="h-10 w-14 rounded border" />
                <input className="input flex-1" value={cfg.color_primario} onChange={(e) => setCfg({ ...cfg, color_primario: e.target.value })} />
              </div>
            </Field>
            <Field label="Color secundario">
              <div className="flex gap-2 items-center">
                <input type="color" value={cfg.color_secundario} onChange={(e) => setCfg({ ...cfg, color_secundario: e.target.value })} className="h-10 w-14 rounded border" />
                <input className="input flex-1" value={cfg.color_secundario} onChange={(e) => setCfg({ ...cfg, color_secundario: e.target.value })} />
              </div>
            </Field>
          </div>
        </Section>
      )}

      {tab === "precios" && (
        <Section title="Precios y contacto">
          <Field label="Lista de precios por defecto (clientes nuevos / invitados)">
            <select className="input" value={cfg.lista_precios_default_id ?? ""} onChange={(e) => setCfg({ ...cfg, lista_precios_default_id: e.target.value || null })}>
              <option value="">— Precio principal —</option>
              {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
            </select>
            <div className="text-xs text-gray-500 mt-1">
              Esta lista se usa para invitados y clientes sin lista asignada en su ficha.
            </div>
          </Field>
          <Field label="¿Qué precios ve cada cliente cuando inicia sesión?">
            <label className="inline-flex items-start gap-2">
              <input type="checkbox" className="mt-1" checked={cfg.usar_lista_cliente} onChange={(e) => setCfg({ ...cfg, usar_lista_cliente: e.target.checked })} />
              <span>
                <strong>Mostrar la lista asignada al cliente</strong> (recomendado)
                <div className="text-xs text-gray-500">Si lo apagas, todos los clientes verán siempre la lista por defecto de arriba, aunque tengan otra asignada.</div>
              </span>
            </label>
          </Field>
          <Field label="WhatsApp para pedidos (opcional)">
            <input className="input" value={cfg.whatsapp_pedidos ?? ""} onChange={(e) => setCfg({ ...cfg, whatsapp_pedidos: e.target.value || null })} placeholder="+52 81 1234 5678" />
          </Field>
          <Field label="Acceso a la tienda">
            <div className="space-y-2">
              <label className="inline-flex items-start gap-2">
                <input type="checkbox" className="mt-1" checked={cfg.permitir_invitados} onChange={(e) => setCfg({ ...cfg, permitir_invitados: e.target.checked })} />
                <span>Permitir explorar productos sin iniciar sesión<div className="text-xs text-gray-500">Para hacer un pedido siempre será necesario iniciar sesión.</div></span>
              </label>
            </div>
          </Field>
        </Section>
      )}

      {tab === "beneficios" && (
        <Section title="Beneficios que se muestran en la tienda">
          <p className="text-sm text-gray-600 -mt-2">Activa solo los que realmente ofreces. Edita el texto para que coincida con tu negocio.</p>
          <div className="space-y-3">
            {cfg.beneficios.map((b, i) => (
              <div key={i} className="border rounded-lg p-3 space-y-2 bg-gray-50">
                <div className="flex items-center justify-between gap-3">
                  <label className="inline-flex items-center gap-2 font-semibold">
                    <input type="checkbox" checked={b.enabled} onChange={(e) => {
                      const next = [...cfg.beneficios]; next[i] = { ...b, enabled: e.target.checked }; setCfg({ ...cfg, beneficios: next });
                    }} className="h-4 w-4" />
                    <span className={b.enabled ? "text-green-700" : "text-gray-500"}>{b.enabled ? "Activo" : "Oculto"}</span>
                  </label>
                  <select className="input" style={{ width: 180 }} value={b.icon} onChange={(e) => {
                    const next = [...cfg.beneficios]; next[i] = { ...b, icon: e.target.value }; setCfg({ ...cfg, beneficios: next });
                  }}>
                    {ICON_OPTIONS.map((o) => <option key={o.v} value={o.v}>{o.label}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <input className="input" placeholder="Título" value={b.title} onChange={(e) => {
                    const next = [...cfg.beneficios]; next[i] = { ...b, title: e.target.value }; setCfg({ ...cfg, beneficios: next });
                  }} />
                  <input className="input" placeholder="Detalle" value={b.subtitle} onChange={(e) => {
                    const next = [...cfg.beneficios]; next[i] = { ...b, subtitle: e.target.value }; setCfg({ ...cfg, beneficios: next });
                  }} />
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2 pt-2">
            <button onClick={() => setCfg({ ...cfg, beneficios: [...cfg.beneficios, { icon: "award", title: "Nuevo beneficio", subtitle: "Descripción", enabled: true }] })} className="px-3 py-1.5 text-sm bg-white border rounded">+ Agregar beneficio</button>
            {cfg.beneficios.length > 0 && (
              <button onClick={() => setCfg({ ...cfg, beneficios: cfg.beneficios.slice(0, -1) })} className="px-3 py-1.5 text-sm bg-white border rounded text-red-600">– Quitar último</button>
            )}
          </div>
        </Section>
      )}

      {tab === "clientes" && <TiendaClientesAdmin />}

      {tab !== "clientes" && (
        <div className="flex justify-end gap-3">
          <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-primary text-white rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      )}


      <style>{`
        .input { width: 100%; padding: 8px 12px; border: 1px solid #d4d7dc; border-radius: 6px; font-size: 14px; background: #fff; outline: none; }
        .input:focus { border-color: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded-lg p-5 space-y-4">
      <h2 className="font-bold text-lg">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-semibold mb-1.5">{label}</label>
      {children}
    </div>
  );
}
