import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, KeyRound, UserPlus, Search, ShieldOff, ShieldCheck, X } from "lucide-react";

interface TC {
  id: string;
  cliente_id: string;
  email: string;
  telefono: string | null;
  verificado: boolean;
  ultimo_login: string | null;
  created_at: string;
  clientes?: { nombre: string } | null;
}

interface ClienteOpt { id: string; nombre: string; email: string | null; telefono: string | null; }

async function callAdmin(action: string, payload: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sesión expirada");
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tienda-admin-clientes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "Error");
  return data;
}

export default function TiendaClientesAdmin() {
  const [items, setItems] = useState<TC[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [resetFor, setResetFor] = useState<TC | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await callAdmin("list", { search });
      setItems(r.items ?? []);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white border rounded-lg p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-lg">Clientes con acceso a la tienda</h2>
          <p className="text-sm text-gray-600">Solo los clientes con cuenta pueden hacer pedidos. Puedes crear el acceso o resetear su contraseña.</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-3 py-2 bg-primary text-white rounded text-sm flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Crear acceso
        </button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2">Cliente</th>
              <th className="p-2">Correo</th>
              <th className="p-2">Último acceso</th>
              <th className="p-2">Estado</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500">Aún no hay clientes con acceso.</td></tr>}
            {items.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2 font-medium">{t.clientes?.nombre ?? "—"}</td>
                <td className="p-2">{t.email}</td>
                <td className="p-2">{t.ultimo_login ? new Date(t.ultimo_login).toLocaleString("es-MX") : "Nunca"}</td>
                <td className="p-2">
                  {t.verificado ? <span className="text-green-700">Activo</span> : <span className="text-red-600">Bloqueado</span>}
                </td>
                <td className="p-2 text-right">
                  <div className="flex gap-1 justify-end">
                    <button onClick={() => setResetFor(t)} title="Resetear contraseña" className="p-1.5 hover:bg-gray-100 rounded text-blue-700">
                      <KeyRound className="h-4 w-4" />
                    </button>
                    <button
                      onClick={async () => {
                        try {
                          await callAdmin(t.verificado ? "deactivate" : "activate", { tienda_cliente_id: t.id });
                          toast.success(t.verificado ? "Acceso bloqueado" : "Acceso reactivado");
                          load();
                        } catch (e) { toast.error((e as Error).message); }
                      }}
                      title={t.verificado ? "Bloquear" : "Reactivar"}
                      className="p-1.5 hover:bg-gray-100 rounded"
                    >
                      {t.verificado ? <ShieldOff className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4 text-green-700" />}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateAccessModal onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
      {resetFor && <ResetPasswordModal tc={resetFor} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function CreateAccessModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [q, setQ] = useState("");
  const [opts, setOpts] = useState<ClienteOpt[]>([]);
  const [sel, setSel] = useState<ClienteOpt | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (q.length < 2) { setOpts([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await callAdmin("buscar_clientes", { search: q });
        setOpts(r.items ?? []);
      } catch { /* ignore */ }
      finally { setSearching(false); }
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const pick = (c: ClienteOpt) => {
    setSel(c); setQ(c.nombre); setOpts([]);
    if (c.email) setEmail(c.email);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel) { toast.error("Selecciona un cliente"); return; }
    if (password.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    setSaving(true);
    try {
      await callAdmin("create_login", { cliente_id: sel.id, email, password });
      toast.success("Acceso creado. Comparte la contraseña con el cliente.");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">Crear acceso a tienda</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-semibold block mb-1">Cliente *</label>
            <input className="input" placeholder="Buscar por nombre o correo…" value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} />
            {searching && <div className="text-xs text-gray-400 mt-1">Buscando…</div>}
            {opts.length > 0 && (
              <div className="border rounded mt-1 max-h-48 overflow-y-auto bg-white">
                {opts.map((c) => (
                  <button type="button" key={c.id} onClick={() => pick(c)} className="block w-full text-left px-3 py-2 hover:bg-gray-50 border-b last:border-0">
                    <div className="font-medium">{c.nombre}</div>
                    {c.email && <div className="text-xs text-gray-500">{c.email}</div>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1">Correo *</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1">Contraseña inicial * (mín. 6)</label>
            <input className="input" type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            <div className="text-xs text-gray-500 mt-1">El cliente podrá cambiarla desde su cuenta.</div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 border rounded">Cancelar</button>
            <button disabled={saving || !sel} className="px-4 py-2 bg-primary text-white rounded font-semibold disabled:opacity-50">
              {saving ? "Guardando…" : "Crear acceso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ResetPasswordModal({ tc, onClose }: { tc: TC; onClose: () => void }) {
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    setSaving(true);
    try {
      await callAdmin("reset_password", { tienda_cliente_id: tc.id, password_nuevo: pwd });
      toast.success("Contraseña actualizada. Compártela con el cliente.");
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">Resetear contraseña</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="text-sm bg-gray-50 p-2 rounded">
          <div><strong>{tc.clientes?.nombre}</strong></div>
          <div className="text-gray-600">{tc.email}</div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-semibold block mb-1">Nueva contraseña (mín. 6)</label>
            <input className="input" type="text" required minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-3 py-2 border rounded">Cancelar</button>
            <button disabled={saving} className="px-4 py-2 bg-primary text-white rounded font-semibold disabled:opacity-50">
              {saving ? "Guardando…" : "Resetear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
