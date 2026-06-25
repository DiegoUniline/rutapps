import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Loader2, KeyRound, Search, ShieldOff, ShieldCheck, X } from "lucide-react";

interface Acceso {
  id: string;
  email: string;
  telefono: string | null;
  verificado: boolean;
  ultimo_login: string | null;
  created_at: string;
  registrado: boolean;
}

interface Row {
  cliente_id: string;
  cliente_nombre: string;
  cliente_email: string | null;
  cliente_telefono: string | null;
  acceso: Acceso | null;
  bloqueado: boolean;
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
  const [filter, setFilter] = useState<"todos" | "activos" | "bloqueados" | "registrados">("todos");
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

  const filtered = items.filter((r) => {
    if (filter === "todos") return true;
    if (filter === "bloqueados") return r.bloqueado;
    if (filter === "activos") return !r.bloqueado;
    if (filter === "registrados") return !!r.acceso?.registrado && !r.bloqueado;
    return true;
  });

  const stats = {
    total: items.length,
    activos: items.filter((i) => !i.bloqueado).length,
    bloqueados: items.filter((i) => i.bloqueado).length,
    registrados: items.filter((i) => i.acceso?.registrado && !i.bloqueado).length,
  };

  const toggleBlock = async (r: Row) => {
    try {
      await callAdmin(r.bloqueado ? "unblock" : "block", { cliente_id: r.cliente_id }, empresaId);
      toast.success(r.bloqueado ? "Acceso restaurado" : "Cliente bloqueado");
      load();
    } catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="bg-white border rounded-lg p-5 space-y-4">
      <div>
        <h2 className="font-bold text-lg">Clientes con acceso a la tienda</h2>
        <p className="text-sm text-gray-600">
          <strong>Todos</strong> tus clientes tienen acceso automáticamente. Contraseña inicial por defecto: <code className="px-1.5 py-0.5 bg-gray-100 rounded font-mono text-xs">123456</code>. Cada cliente puede cambiarla desde la tienda. Bloquea los que no quieras que entren.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-1 border rounded p-0.5 bg-gray-50 flex-wrap">
          {([
            ["todos", `Todos (${stats.total})`],
            ["activos", `Con acceso (${stats.activos})`],
            ["registrados", `Ya registrados (${stats.registrados})`],
            ["bloqueados", `Bloqueados (${stats.bloqueados})`],
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
                  <td className="p-2">{a?.registrado ? a.email : (r.cliente_email || <span className="text-gray-400">Sin correo</span>)}</td>
                  <td className="p-2">{a?.ultimo_login ? new Date(a.ultimo_login).toLocaleString("es-MX") : <span className="text-gray-400">Nunca</span>}</td>
                  <td className="p-2">
                    {r.bloqueado && <span className="text-red-600 font-semibold">Bloqueado</span>}
                    {!r.bloqueado && a?.registrado && <span className="text-green-700 font-semibold">Registrado</span>}
                    {!r.bloqueado && !a?.registrado && r.cliente_email && <span className="text-blue-700 font-semibold">Acceso (contraseña 123456)</span>}
                    {!r.bloqueado && !a?.registrado && !r.cliente_email && <span className="text-gray-500 font-semibold">Falta correo</span>}
                  </td>
                  <td className="p-2 text-right">
                    <div className="flex gap-1 justify-end">
                      {!r.bloqueado && r.cliente_email && (
                        <button onClick={() => setResetFor(r)} title="Cambiar contraseña" className="p-1.5 hover:bg-gray-100 rounded text-blue-700">
                          <KeyRound className="h-4 w-4" />
                        </button>
                      )}
                      <button
                        onClick={() => toggleBlock(r)}
                        title={r.bloqueado ? "Restaurar acceso" : "Bloquear acceso"}
                        className={`px-2 py-1 text-xs rounded inline-flex items-center gap-1 ${r.bloqueado ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
                      >
                        {r.bloqueado ? <><ShieldCheck className="h-3.5 w-3.5" /> Restaurar</> : <><ShieldOff className="h-3.5 w-3.5" /> Bloquear</>}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {resetFor && <ResetPasswordModal row={resetFor} empresaId={empresaId} onClose={() => setResetFor(null)} />}
    </div>
  );
}

function genPwd() {
  return Math.random().toString(36).slice(-8);
}

function ResetPasswordModal({ row, empresaId, onClose }: { row: Row; empresaId: string | null; onClose: () => void }) {
  const [pwd, setPwd] = useState(genPwd());
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pwd.length < 6) { toast.error("Mínimo 6 caracteres"); return; }
    setSaving(true);
    try {
      if (row.acceso?.id) {
        await callAdmin("reset_password", { tienda_cliente_id: row.acceso.id, password_nuevo: pwd }, empresaId);
      } else {
        await callAdmin("set_password", { cliente_id: row.cliente_id, password_nuevo: pwd }, empresaId);
      }
      toast.success("Contraseña actualizada. Compártela con el cliente.");
      onClose();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-bold text-lg">Cambiar contraseña</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="text-sm bg-gray-50 p-2 rounded">
          <div><strong>{row.cliente_nombre}</strong></div>
          <div className="text-gray-600">{row.acceso?.email || row.cliente_email}</div>
        </div>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-sm font-semibold block mb-1">Nueva contraseña (mín. 6)</label>
            <div className="flex gap-2">
              <input className="input flex-1" type="text" required minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus />
              <button type="button" onClick={() => setPwd(genPwd())} className="px-3 py-2 border rounded text-sm">Generar</button>
            </div>
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
