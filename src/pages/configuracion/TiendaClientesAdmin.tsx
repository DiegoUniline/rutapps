import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock3, KeyRound, Loader2, Search, ShieldCheck, ShieldOff, UserPlus, X, XCircle } from "lucide-react";

interface Acceso { id: string; email: string; telefono: string | null; verificado: boolean; ultimo_login: string | null; created_at: string; registrado: boolean; }
interface Row { cliente_id: string; cliente_nombre: string; cliente_email: string | null; cliente_telefono: string | null; acceso: Acceso | null; bloqueado: boolean; }
interface Option { id: string; nombre: string; }
interface Solicitud {
  id: string; status: "pendiente" | "aprobada" | "rechazada"; nombre: string; contacto: string | null; telefono: string | null;
  email: string; direccion: string | null; ciudad: string | null; rfc: string | null; lista_precio_id: string | null;
  vendedor_id: string | null; zona_id: string | null; credito: boolean; limite_credito: number; dias_credito: number;
  notas_revision: string | null; posible_cliente_id: string | null; posible_cliente_nombre: string | null; posible_motivo: string | null;
  cliente_id: string | null; created_at: string; revisado_at: string | null;
}

async function callAdmin(action: string, payload: Record<string, unknown> = {}, empresaIdFallback?: string | null) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Sesión expirada");
  const r = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/tienda-admin-clientes`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...(empresaIdFallback ? { empresa_id: empresaIdFallback } : {}), ...payload }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data?.error ?? "Error");
  return data;
}

export default function TiendaClientesAdmin() {
  const { empresa } = useAuth();
  const empresaId = empresa?.id ?? null;
  const [section, setSection] = useState<"solicitudes" | "clientes">("solicitudes");
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [requestStatus, setRequestStatus] = useState<"pendiente" | "aprobada" | "rechazada" | "todos">("pendiente");
  const [review, setReview] = useState<Solicitud | null>(null);
  const [requestLoading, setRequestLoading] = useState(false);
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"todos" | "activos" | "bloqueados" | "registrados">("todos");
  const [resetFor, setResetFor] = useState<Row | null>(null);

  const loadRequests = useCallback(async () => {
    setRequestLoading(true);
    try { const r = await callAdmin("requests", { status: requestStatus }, empresaId); setSolicitudes(r.items ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setRequestLoading(false); }
  }, [empresaId, requestStatus]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try { const r = await callAdmin("list", { search }, empresaId); setItems(r.items ?? []); }
    catch (e) { toast.error((e as Error).message); }
    finally { setLoading(false); }
  }, [search, empresaId]);

  useEffect(() => { if (section === "solicitudes") loadRequests(); else loadClients(); }, [section, loadRequests, loadClients]);

  const pendingCount = solicitudes.filter((s) => s.status === "pendiente").length;
  const filtered = items.filter((r) => {
    if (filter === "todos") return true;
    if (filter === "bloqueados") return r.bloqueado;
    if (filter === "activos") return !r.bloqueado;
    if (filter === "registrados") return !!r.acceso?.registrado && !r.bloqueado;
    return true;
  });
  const stats = { total: items.length, activos: items.filter((i) => !i.bloqueado).length, bloqueados: items.filter((i) => i.bloqueado).length, registrados: items.filter((i) => i.acceso?.registrado && !i.bloqueado).length };

  const toggleBlock = async (r: Row) => {
    try { await callAdmin(r.bloqueado ? "unblock" : "block", { cliente_id: r.cliente_id }, empresaId); toast.success(r.bloqueado ? "Acceso restaurado" : "Cliente bloqueado"); loadClients(); }
    catch (e) { toast.error((e as Error).message); }
  };

  return (
    <div className="bg-white border rounded-lg p-5 space-y-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-lg">Clientes de la tienda</h2>
          <p className="text-sm text-gray-600">Los registros nuevos entran primero como solicitud. Revisa sus datos y condiciones comerciales antes de convertirlos en cliente.</p>
        </div>
        <div className="inline-flex rounded-lg border bg-gray-50 p-1 self-start">
          <button onClick={() => setSection("solicitudes")} className={`px-3 py-2 text-sm font-semibold rounded-md flex items-center gap-2 ${section === "solicitudes" ? "bg-white shadow text-primary" : "text-gray-600"}`}>
            <UserPlus size={15} /> Solicitudes {pendingCount > 0 && <span className="bg-orange-100 text-orange-700 px-1.5 rounded-full text-xs">{pendingCount}</span>}
          </button>
          <button onClick={() => setSection("clientes")} className={`px-3 py-2 text-sm font-semibold rounded-md ${section === "clientes" ? "bg-white shadow text-primary" : "text-gray-600"}`}>Clientes con acceso</button>
        </div>
      </div>

      {section === "solicitudes" ? (
        <>
          <div className="flex gap-1 border rounded-lg p-1 bg-gray-50 w-fit">
            {([['pendiente','Pendientes'],['aprobada','Aprobadas'],['rechazada','Rechazadas'],['todos','Todas']] as const).map(([v,l]) => (
              <button key={v} onClick={() => setRequestStatus(v)} className={`px-3 py-1.5 rounded text-xs font-semibold ${requestStatus === v ? "bg-white shadow text-primary" : "text-gray-600"}`}>{l}</button>
            ))}
          </div>
          <div className="overflow-x-auto border rounded-lg">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 text-left"><th className="p-3">Solicitante</th><th className="p-3">Contacto</th><th className="p-3">Fecha</th><th className="p-3">Estado</th><th className="p-3">Posible duplicado</th><th className="p-3"></th></tr></thead>
              <tbody>
                {requestLoading && <tr><td colSpan={6} className="p-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></td></tr>}
                {!requestLoading && solicitudes.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-gray-500">No hay solicitudes en este estado.</td></tr>}
                {!requestLoading && solicitudes.map((s) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50/60">
                    <td className="p-3"><div className="font-semibold">{s.nombre}</div>{s.contacto && <div className="text-xs text-gray-500">Contacto: {s.contacto}</div>}</td>
                    <td className="p-3"><div>{s.email}</div><div className="text-xs text-gray-500">{s.telefono || "Sin teléfono"}{s.ciudad ? ` · ${s.ciudad}` : ""}</div></td>
                    <td className="p-3 text-gray-600">{new Date(s.created_at).toLocaleString("es-MX")}</td>
                    <td className="p-3"><StatusBadge status={s.status} /></td>
                    <td className="p-3">{s.posible_cliente_id ? <div className="text-xs text-amber-700 flex items-start gap-1"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>{s.posible_cliente_nombre}<br/><span className="text-gray-500">Coincide por {s.posible_motivo}</span></span></div> : <span className="text-xs text-gray-400">Sin coincidencias</span>}</td>
                    <td className="p-3 text-right"><button onClick={() => setReview(s)} className="px-3 py-1.5 border rounded-md text-xs font-semibold hover:bg-white">{s.status === "pendiente" ? "Revisar" : "Ver"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="text-sm text-gray-600 bg-gray-50 border rounded-lg p-3"><strong>Clientes existentes:</strong> pueden entrar con su correo. Si nunca han ingresado, la contraseña inicial continúa siendo <code className="px-1.5 py-0.5 bg-white border rounded font-mono text-xs">123456</code>.</div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative flex-1 min-w-[200px]"><Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" /><input className="input pl-9" placeholder="Buscar por nombre o correo…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <div className="flex gap-1 border rounded p-0.5 bg-gray-50 flex-wrap">
              {([['todos',`Todos (${stats.total})`],['activos',`Con acceso (${stats.activos})`],['registrados',`Ya registrados (${stats.registrados})`],['bloqueados',`Bloqueados (${stats.bloqueados})`]] as const).map(([v,l]) => <button key={v} onClick={() => setFilter(v)} className={`px-3 py-1.5 text-xs font-semibold rounded ${filter === v ? "bg-white shadow text-primary" : "text-gray-600"}`}>{l}</button>)}
            </div>
          </div>
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="bg-gray-50 text-left"><th className="p-2">Cliente</th><th className="p-2">Correo de acceso</th><th className="p-2">Último ingreso</th><th className="p-2">Estado</th><th className="p-2"></th></tr></thead><tbody>
            {loading && <tr><td colSpan={5} className="p-4 text-center"><Loader2 className="h-4 w-4 animate-spin inline" /></td></tr>}
            {!loading && filtered.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-gray-500">Sin resultados.</td></tr>}
            {filtered.map((r) => { const a = r.acceso; return <tr key={r.cliente_id} className="border-t"><td className="p-2 font-medium">{r.cliente_nombre}{r.cliente_email && <div className="text-xs text-gray-500">{r.cliente_email}</div>}</td><td className="p-2">{a?.registrado ? a.email : (r.cliente_email || <span className="text-gray-400">Sin correo</span>)}</td><td className="p-2">{a?.ultimo_login ? new Date(a.ultimo_login).toLocaleString("es-MX") : <span className="text-gray-400">Nunca</span>}</td><td className="p-2">{r.bloqueado ? <span className="text-red-600 font-semibold">Bloqueado</span> : a?.registrado ? <span className="text-green-700 font-semibold">Registrado</span> : r.cliente_email ? <span className="text-blue-700 font-semibold">Acceso inicial</span> : <span className="text-gray-500">Falta correo</span>}</td><td className="p-2 text-right"><div className="flex gap-1 justify-end">{!r.bloqueado && r.cliente_email && <button onClick={() => setResetFor(r)} title="Cambiar contraseña" className="p-1.5 hover:bg-gray-100 rounded text-blue-700"><KeyRound className="h-4 w-4" /></button>}<button onClick={() => toggleBlock(r)} className={`px-2 py-1 text-xs rounded inline-flex items-center gap-1 ${r.bloqueado ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}>{r.bloqueado ? <><ShieldCheck className="h-3.5 w-3.5" /> Restaurar</> : <><ShieldOff className="h-3.5 w-3.5" /> Bloquear</>}</button></div></td></tr>; })}
          </tbody></table></div>
        </>
      )}

      {review && <ReviewRequestModal request={review} empresaId={empresaId} onClose={() => setReview(null)} onChanged={() => { setReview(null); loadRequests(); }} />}
      {resetFor && <ResetPasswordModal row={resetFor} empresaId={empresaId} onClose={() => { setResetFor(null); loadClients(); }} />}
    </div>
  );
}

function StatusBadge({ status }: { status: Solicitud['status'] }) {
  if (status === "aprobada") return <span className="inline-flex items-center gap-1 text-green-700 font-semibold text-xs"><CheckCircle2 size={14}/> Aprobada</span>;
  if (status === "rechazada") return <span className="inline-flex items-center gap-1 text-red-700 font-semibold text-xs"><XCircle size={14}/> Rechazada</span>;
  return <span className="inline-flex items-center gap-1 text-amber-700 font-semibold text-xs"><Clock3 size={14}/> Pendiente</span>;
}

function ReviewRequestModal({ request, empresaId, onClose, onChanged }: { request: Solicitud; empresaId: string | null; onClose: () => void; onChanged: () => void }) {
  const [form, setForm] = useState({
    nombre: request.nombre, contacto: request.contacto ?? "", telefono: request.telefono ?? "", email: request.email,
    direccion: request.direccion ?? "", lista_precio_id: request.lista_precio_id ?? "", vendedor_id: request.vendedor_id ?? "", zona_id: request.zona_id ?? "",
    credito: !!request.credito, limite_credito: Number(request.limite_credito ?? 0), dias_credito: Number(request.dias_credito ?? 0), notas_revision: request.notas_revision ?? "",
    usar_cliente_existente: false,
  });
  const [options, setOptions] = useState<{ listas: Option[]; vendedores: Option[]; zonas: Option[] }>({ listas: [], vendedores: [], zonas: [] });
  const [saving, setSaving] = useState(false);
  const editable = request.status === "pendiente";
  useEffect(() => { callAdmin("request_options", {}, empresaId).then(setOptions).catch((e) => toast.error((e as Error).message)); }, [empresaId]);
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));

  const approve = async () => {
    if (!form.nombre.trim() || !form.email.trim()) { toast.error("Nombre y correo son obligatorios"); return; }
    setSaving(true);
    try { await callAdmin("approve_request", { id: request.id, ...form }, empresaId); toast.success("Solicitud aprobada. El cliente ya puede iniciar sesión."); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };
  const reject = async () => {
    setSaving(true);
    try { await callAdmin("reject_request", { id: request.id, notas_revision: form.notas_revision }, empresaId); toast.success("Solicitud rechazada"); onChanged(); }
    catch (e) { toast.error((e as Error).message); }
    finally { setSaving(false); }
  };

  return <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="bg-white rounded-xl w-full max-w-3xl max-h-[92dvh] overflow-y-auto shadow-xl">
    <div className="sticky top-0 bg-white border-b p-4 flex justify-between items-start z-10"><div><h3 className="font-bold text-lg">{editable ? "Revisar solicitud de cliente" : "Detalle de solicitud"}</h3><p className="text-xs text-gray-500">Solicitada {new Date(request.created_at).toLocaleString("es-MX")}</p></div><button onClick={onClose} className="p-1"><X className="h-5 w-5" /></button></div>
    <div className="p-5 space-y-5">
      {request.posible_cliente_id && <label className="block border border-amber-200 bg-amber-50 rounded-lg p-3"><div className="flex gap-2"><AlertTriangle size={18} className="text-amber-600 shrink-0"/><div><div className="font-semibold text-amber-900">Posible cliente duplicado</div><div className="text-sm text-amber-800">Coincide por {request.posible_motivo}: <strong>{request.posible_cliente_nombre}</strong></div></div></div>{editable && <div className="mt-3 flex items-center gap-2"><input type="checkbox" checked={form.usar_cliente_existente} onChange={(e) => set("usar_cliente_existente", e.target.checked)} /><span className="text-sm font-semibold">Usar este cliente existente en lugar de crear uno nuevo</span></div>}</label>}
      <div className="grid md:grid-cols-2 gap-4"><Field label="Negocio / razón social"><input className="input" disabled={!editable} value={form.nombre} onChange={(e) => set("nombre", e.target.value)} /></Field><Field label="Contacto"><input className="input" disabled={!editable} value={form.contacto} onChange={(e) => set("contacto", e.target.value)} /></Field><Field label="Correo"><input className="input" disabled={!editable} value={form.email} onChange={(e) => set("email", e.target.value)} /></Field><Field label="Teléfono"><input className="input" disabled={!editable} value={form.telefono} onChange={(e) => set("telefono", e.target.value)} /></Field><Field label="Dirección"><input className="input" disabled={!editable} value={form.direccion} onChange={(e) => set("direccion", e.target.value)} /></Field><Field label="Ciudad"><input className="input" disabled value={request.ciudad ?? ""} /></Field></div>
      <div className="border-t pt-4"><h4 className="font-bold mb-3">Condiciones comerciales</h4><div className="grid md:grid-cols-3 gap-4"><SelectField label="Lista de precios" value={form.lista_precio_id} disabled={!editable} options={options.listas} onChange={(v) => set("lista_precio_id", v)} /><SelectField label="Vendedor" value={form.vendedor_id} disabled={!editable} options={options.vendedores} onChange={(v) => set("vendedor_id", v)} /><SelectField label="Zona" value={form.zona_id} disabled={!editable} options={options.zonas} onChange={(v) => set("zona_id", v)} /></div></div>
      <div className="grid md:grid-cols-3 gap-4 items-end"><label className="flex items-center gap-2 border rounded-lg p-3 h-[42px]"><input type="checkbox" disabled={!editable} checked={form.credito} onChange={(e) => set("credito", e.target.checked)} /><span className="text-sm font-semibold">Permitir crédito</span></label><Field label="Límite de crédito"><input className="input" type="number" min={0} disabled={!editable || !form.credito} value={form.limite_credito} onChange={(e) => set("limite_credito", Number(e.target.value))} /></Field><Field label="Días de crédito"><input className="input" type="number" min={0} disabled={!editable || !form.credito} value={form.dias_credito} onChange={(e) => set("dias_credito", Number(e.target.value))} /></Field></div>
      <Field label="Notas internas"><textarea className="input" rows={2} disabled={!editable} value={form.notas_revision} onChange={(e) => set("notas_revision", e.target.value)} /></Field>
    </div>
    <div className="sticky bottom-0 bg-white border-t p-4 flex justify-between gap-2"><div>{editable && <button onClick={reject} disabled={saving} className="px-4 py-2 border border-red-200 text-red-700 rounded-lg font-semibold">Rechazar</button>}</div><div className="flex gap-2"><button onClick={onClose} className="px-4 py-2 border rounded-lg">Cerrar</button>{editable && <button onClick={approve} disabled={saving} className="px-4 py-2 bg-primary text-white rounded-lg font-semibold flex items-center gap-2">{saving && <Loader2 size={15} className="animate-spin"/>} Aprobar y crear cliente</button>}</div></div>
  </div></div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="text-xs font-semibold text-gray-600 block mb-1">{label}</span>{children}</label>; }
function SelectField({ label, value, options, onChange, disabled }: { label: string; value: string; options: Option[]; onChange: (v: string) => void; disabled?: boolean }) { return <Field label={label}><select className="input" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}><option value="">Sin asignar</option>{options.map((o) => <option key={o.id} value={o.id}>{o.nombre}</option>)}</select></Field>; }

function genPwd() { return Math.random().toString(36).slice(-8); }
function ResetPasswordModal({ row, empresaId, onClose }: { row: Row; empresaId: string | null; onClose: () => void }) {
  const [pwd, setPwd] = useState(genPwd()); const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => { e.preventDefault(); if (pwd.length < 6) { toast.error("Mínimo 6 caracteres"); return; } setSaving(true); try { if (row.acceso?.id) await callAdmin("reset_password", { tienda_cliente_id: row.acceso.id, password_nuevo: pwd }, empresaId); else await callAdmin("set_password", { cliente_id: row.cliente_id, password_nuevo: pwd }, empresaId); toast.success("Contraseña actualizada. Compártela con el cliente."); onClose(); } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); } };
  return <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4"><div className="bg-white rounded-lg w-full max-w-sm p-5 space-y-4"><div className="flex justify-between items-center"><h3 className="font-bold text-lg">Cambiar contraseña</h3><button onClick={onClose}><X className="h-5 w-5" /></button></div><div className="text-sm bg-gray-50 p-2 rounded"><div><strong>{row.cliente_nombre}</strong></div><div className="text-gray-600">{row.acceso?.email || row.cliente_email}</div></div><form onSubmit={submit} className="space-y-3"><Field label="Nueva contraseña (mín. 6)"><div className="flex gap-2"><input className="input flex-1" type="text" required minLength={6} value={pwd} onChange={(e) => setPwd(e.target.value)} autoFocus /><button type="button" onClick={() => setPwd(genPwd())} className="px-3 py-2 border rounded text-sm">Generar</button></div></Field><div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="px-3 py-2 border rounded">Cancelar</button><button disabled={saving} className="px-4 py-2 bg-primary text-white rounded font-semibold disabled:opacity-50">{saving ? "Guardando…" : "Resetear"}</button></div></form></div></div>;
}
