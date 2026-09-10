import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { fnPost, useTienda } from "@/tienda/TiendaContext";
import TiendaShell from "./TiendaShell";

function Inner() {
  const t = useTienda();
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const next = sp.get("next");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [contacto, setContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [direccion, setDireccion] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(false);
  const base = `/tienda/${t.slug}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const res = mode === "login"
        ? await fnPost("tienda-login", { slug: t.slug, email, password })
        : await fnPost("tienda-register", { slug: t.slug, email, password, nombre, contacto, telefono, direccion, ciudad });
      if (res?.pending) {
        setPending(true);
        return;
      }
      if (!res?.token) throw new Error("No se recibió una sesión válida");
      t.login(res.token, res.email);
      nav(next === "carrito" ? `${base}/carrito` : base);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (pending) return (
    <main className="tienda-container">
      <div className="tienda-auth-card" style={{ textAlign: "center" }}>
        <CheckCircle2 size={44} style={{ margin: "0 auto 12px", color: "#16a34a" }} />
        <h2>Solicitud enviada</h2>
        <p className="sub">Recibimos tus datos. La empresa revisará tu solicitud, asignará tus condiciones comerciales y habilitará tu acceso.</p>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 12, margin: "16px 0", fontSize: 13, color: "#475569" }}>
          Te avisarán cuando tu cuenta esté lista. No necesitas registrarte otra vez.
        </div>
        <Link to={base} className="tienda-btn tienda-btn-primary tienda-btn-block">Volver a la tienda</Link>
      </div>
    </main>
  );

  return (
    <main className="tienda-container">
      <div className="tienda-auth-card">
        <h2>{mode === "login" ? "Iniciar sesión" : "Solicitar cuenta"}</h2>
        <p className="sub">{mode === "login" ? "Accede para ver tus precios personalizados." : "Envíanos tus datos. La empresa revisará tu solicitud antes de activar la cuenta."}</p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <div className="tienda-field">
                <label>Nombre del negocio / razón social *</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </div>
              <div className="tienda-field">
                <label>Nombre de contacto</label>
                <input value={contacto} onChange={(e) => setContacto(e.target.value)} />
              </div>
              <div className="tienda-field">
                <label>Teléfono</label>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" />
              </div>
              <div className="tienda-field">
                <label>Ciudad</label>
                <input value={ciudad} onChange={(e) => setCiudad(e.target.value)} />
              </div>
              <div className="tienda-field">
                <label>Dirección</label>
                <input value={direccion} onChange={(e) => setDireccion(e.target.value)} />
              </div>
            </>
          )}
          <div className="tienda-field">
            <label>Correo *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="tienda-field">
            <label>{mode === "login" ? "Contraseña" : "Contraseña para cuando tu cuenta sea aprobada"} *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          {err && <div className="tienda-error">{err}</div>}

          <button className="tienda-btn tienda-btn-primary tienda-btn-block" disabled={loading}>
            {loading ? "Procesando…" : mode === "login" ? "Entrar" : "Enviar solicitud"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>
          {mode === "login" ? (
            <>¿No eres cliente todavía? <button type="button" onClick={() => { setMode("signup"); setErr(null); }} style={{ background: "none", border: 0, color: "var(--tienda-primary)", cursor: "pointer", fontWeight: 700 }}>Solicita una cuenta</button></>
          ) : (
            <>¿Ya tienes cuenta? <button type="button" onClick={() => { setMode("login"); setErr(null); }} style={{ background: "none", border: 0, color: "var(--tienda-primary)", cursor: "pointer", fontWeight: 700 }}>Inicia sesión</button></>
          )}
        </div>
        <div style={{ textAlign: "center", marginTop: 8 }}>
          <Link to={base} style={{ color: "#666", fontSize: 13 }}>← Volver a la tienda</Link>
        </div>
      </div>
    </main>
  );
}

export default function TiendaLoginPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
