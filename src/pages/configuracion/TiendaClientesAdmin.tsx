import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, KeyRound, UserPlus, Search, ShieldOff, ShieldCheck, X } from "lucide-react";

interface Acceso {
  id: string;
  cliente_id: string;
  email: string;
  telefono: string | null;
  verificado: boolean;
  ultimo_login: string | null;
  created_at: string;
}

interface Row {
  cliente_id: string;
  cliente_nombre: string;
  cliente_email: string | null;
  cliente_telefono: string | null;
  acceso: Acceso | null;
}

async function callAdmin(action: string, payload: Record<string, unknown> = {}, empresaIdFallback?: string | null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sesión expirada");
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tienda-admin-clientes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action, ...(empresaIdFallback ? { empresa_id: empresaIdFallback } : {}), ...payload }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "Error");
  return data;
}

export default function TiendaClientesAdmin() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id ?? null;
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "con" | "sin">("todos");
  const [assignFor, setAssignFor] = useState<Row | null>(null);
  const [resetFor, setResetFor] = useState<Row | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await callAdmin("list", { search }, empresaId);
      setItems(r.items ?? []);
    } catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [search, empresaId]);

  useEffect(() => { load(); }, [load]);

  const filtered = items.filter((r) =>
    filter === "todos" ? true : filter === "con" ? !!r.acceso : !r.acceso
  );

  const stats = {
    total: items.length,
    con: items.filter((i) => i.acceso).length,
    sin: items.filter((i) => !i.acceso).length,
  };

  return (
    <div className="bg-white border rounded-lg p-5 space-y-4">
      <div>
        <h2 className="font-bold text-lg">Clientes con acceso a la tienda</h2>
        <p className="text-sm text-gray-600">
          Aquí están <strong>todos</strong> tus clientes. Asigna acceso, resetea contraseñas o bloquea cuentas.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 border rounded p-0.5 bg-gray-50">
          {([
            ["todos", `Todos (${stats.total})`],
            ["con", `Con acceso (${stats.con})`],
            ["sin", `Sin acceso (${stats.sin})`],
          ] as const).map(([v, l]) => (
            <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 text-xs font-semibold rounded ${filter === v ? "bg-white shadow text-primary" : "text-gray-600"}`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left">
              <th className="p-2">Cliente</th>
              <th className="p-2">Correo de acceso</th>
              <th className="p-2">Último ingreso</th>
              <th className="p-2">Estado</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={5} className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500">Sin resultados.</td></tr>}
            {filtered.map((r) => {
              const a = r.acceso;
              return (
                <tr key={r.cliente_id} className="border-t">
                  <td className="p-2 font-medium">
                    {r.cliente_nombre}
                    {r.cliente_email && <div className="text-xs text-gray-500">{r.cliente_email}</div>}
                  </td>
                  <td className="p-2">{a ? a.email : <span className="text-gray-400">—</span>}</td>
                  <td className="p-2">{a?.ultimo_login ? new Date(a.ultimo_login).toLocaleString("es-MX") : <span className="text-gray-400">Nunca</span>}</td>
                  <td className="p-2">
                    {!a && <span className="text-gray-500">Sin acceso</span>}
                    {a && a.verificado && <span className="text-green-700 font-semibold">Activo</span>}
                    {a && !a.verificado && <span className="text-red-600 font-semibold">Bloqueado</span>}
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex gap-1 justify-end">
                      {!a && (
                        <button onClick={() => setAssignFor(r)} className="px-2 py-1 text-xs bg-primary text-white rounded inline-flex items-center gap-1">
                          <UserPlus className="h-3.5 w-3.5" /> Dar acceso
                        </button>
                      )}
                      {a && (
                        <>
                          <button onClick={() => setResetFor(r)} title="Resetear contraseña" className="p-1.5 hover:bg-gray-100 rounded text-blue-700">
                            <KeyRound className="h-4 w-4" />
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                await callAdmin(a.verificado ? "deactivate" : "activate", { tienda_cliente_id: a.id }, empresaId);
                                toast.success(a.verificado ? "Acceso bloqueado" : "Acceso reactivado");
                                load();
                              } catch (e) { toast.error((e as Error).message); }
                            }}
                            title={a.verificado ? "Bloquear" : "Reactivar"}
                            className="p-1.5 hover:bg-gray-100 rounded"
                          >
                            {a.verificado ? <ShieldOff className="h-4 w-4 text-red-600" /> : <ShieldCheck className="h-4 w-4 text-green-700" />}
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {assignFor && <AssignAccessModal row={assignFor} empresaId={empresaId} onClose={() => setAssignFor(null)} onSaved={() => { setAssignFor(null); load(); }} />}
      {resetFor && resetFor.acceso && <ResetPasswordModal row={resetFor} acceso={resetFor.acceso} empresaId={empresaId} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function AssignAccessModal({ row, empresaId, onClose, onSaved }: { row: Row; empresaId: string | null; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState(row.cliente_email ?? "");
  const [password, setPassword] = useState(genPwd());
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) { toast.error("Correo obligatorio"); return; }
    if (password.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    setSaving(true);
    try {
      await callAdmin("create_login", { cliente_id: row.cliente_id, email, password }, empresaId);
      toast.success("Acceso creado. Comparte la contraseña con el cliente.");
      onSaved();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">Dar acceso a la tienda</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="text-sm bg-gray-50 p-2 rounded">
          <div><strong>{row.cliente_nombre}</strong></div>
          {row.cliente_telefono && <div className="text-gray-600">{row.cliente_telefono}</div>}
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-semibold block mb-1">Correo de acceso *</label>
            <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-semibold block mb-1">Contraseña inicial * (mín. 6)</label>
            <div className="flex gap-2">
              <input className="input flex-1" type="text" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setPassword(genPwd())} className="px-3 py-2 border rounded text-sm">Generar</button>
            </div>
            <div className="text-xs text-gray-500 mt-1">El cliente podrá cambiarla desde su cuenta.</div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="px-3 py-2 border rounded">Cancelar</button>
            <button disabled={saving} className="px-4 py-2 bg-primary text-white rounded font-semibold disabled:opacity-50">
              {saving ? "Guardando…" : "Crear acceso"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function genPwd() {
  return Math.random().toString(36).slice(-8);
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
