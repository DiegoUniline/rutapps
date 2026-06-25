import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Store, ExternalLink, Copy, Check } from "lucide-react";

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
  mensaje_bienvenida: string | null;
}

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
  const [listas, setListas] = useState<ListaPrecio[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!empresaId) return;
    (async () => {
      setLoading(true);
      const [{ data: existing }, { data: lp }, { data: emp }] = await Promise.all([
        supabase.from("tienda_config").select("*").eq("empresa_id", empresaId).maybeSingle(),
        supabase.from("lista_precios").select("id, nombre").eq("empresa_id", empresaId).order("nombre"),
        supabase.from("empresas").select("nombre").eq("id", empresaId).maybeSingle(),
      ]);
      setListas(lp ?? []);
      if (existing) {
        setCfg(existing as TiendaConfig);
      } else {
        setCfg({
          empresa_id: empresaId,
          slug: slugify(emp?.nombre ?? "mi-tienda"),
          activa: false,
          nombre_tienda: emp?.nombre ?? "Mi Tienda",
          banner_url: null,
          logo_url: null,
          color_primario: "#0061e8",
          color_secundario: "#ff7a00",
          whatsapp_pedidos: null,
          lista_precios_default_id: null,
          permitir_invitados: true,
          mensaje_bienvenida: null,
        });
      }
      setLoading(false);
    })();
  }, [empresaId]);

  const save = async () => {
    if (!cfg) return;
    if (!cfg.slug || !cfg.nombre_tienda) {
      toast.error("Slug y nombre son obligatorios");
      return;
    }
    setSaving(true);
    const payload = { ...cfg, slug: slugify(cfg.slug) };
    const { data, error } = cfg.id
      ? await supabase.from("tienda_config").update(payload).eq("id", cfg.id).select().single()
      : await supabase.from("tienda_config").insert(payload).select().single();
    setSaving(false);
    if (error) {
      toast.error(error.message.includes("duplicate") ? "Ese slug ya está en uso" : error.message);
      return;
    }
    setCfg(data as TiendaConfig);
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

      <Section title="Datos generales">
        <Field label="Estado">
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={cfg.activa} onChange={(e) => setCfg({ ...cfg, activa: e.target.checked })} className="h-5 w-5" />
            <span className={cfg.activa ? "text-green-700 font-semibold" : "text-gray-600"}>
              {cfg.activa ? "Tienda activa (pública)" : "Inactiva (no accesible)"}
            </span>
          </label>
        </Field>
        <Field label="Slug de la URL *">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">rutapp.mx/tienda/</span>
            <input className="input flex-1" value={cfg.slug} onChange={(e) => setCfg({ ...cfg, slug: e.target.value })} onBlur={(e) => setCfg({ ...cfg, slug: slugify(e.target.value) })} />
          </div>
        </Field>
        <Field label="Nombre de la tienda *">
          <input className="input" value={cfg.nombre_tienda} onChange={(e) => setCfg({ ...cfg, nombre_tienda: e.target.value })} />
        </Field>
        <Field label="Mensaje de bienvenida">
          <textarea className="input" rows={2} value={cfg.mensaje_bienvenida ?? ""} onChange={(e) => setCfg({ ...cfg, mensaje_bienvenida: e.target.value })} placeholder="¡Bienvenido a nuestra tienda!" />
        </Field>
      </Section>

      <Section title="Marca">
        <Field label="Logo (URL)">
          <input className="input" value={cfg.logo_url ?? ""} onChange={(e) => setCfg({ ...cfg, logo_url: e.target.value || null })} placeholder="https://…" />
        </Field>
        <Field label="Banner / portada (URL)">
          <input className="input" value={cfg.banner_url ?? ""} onChange={(e) => setCfg({ ...cfg, banner_url: e.target.value || null })} placeholder="https://…" />
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

      <Section title="Precios y contacto">
        <Field label="Lista de precios por defecto (clientes nuevos / invitados)">
          <select className="input" value={cfg.lista_precios_default_id ?? ""} onChange={(e) => setCfg({ ...cfg, lista_precios_default_id: e.target.value || null })}>
            <option value="">— Precio principal —</option>
            {listas.map((l) => <option key={l.id} value={l.id}>{l.nombre}</option>)}
          </select>
          <div className="text-xs text-gray-500 mt-1">
            A los clientes ya registrados se les aplica automáticamente la lista que tengan asignada en su ficha.
          </div>
        </Field>
        <Field label="WhatsApp para pedidos (opcional)">
          <input className="input" value={cfg.whatsapp_pedidos ?? ""} onChange={(e) => setCfg({ ...cfg, whatsapp_pedidos: e.target.value || null })} placeholder="+52 81 1234 5678" />
        </Field>
        <Field label="Acceso">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" checked={cfg.permitir_invitados} onChange={(e) => setCfg({ ...cfg, permitir_invitados: e.target.checked })} />
            Permitir explorar productos sin iniciar sesión
          </label>
        </Field>
      </Section>

      <div className="flex justify-end gap-3">
        <button onClick={save} disabled={saving} className="px-6 py-2.5 bg-primary text-white rounded-lg font-semibold disabled:opacity-50 flex items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
          Guardar cambios
        </button>
      </div>

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
