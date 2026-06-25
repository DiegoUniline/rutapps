import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
  const [telefono, setTelefono] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const base = `/tienda/${t.slug}`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setLoading(true);
    try {
      const res = mode === "login"
        ? await fnPost("tienda-login", { slug: t.slug, email, password })
        : await fnPost("tienda-register", { slug: t.slug, email, password, nombre, telefono });
      t.login(res.token, res.email);
      nav(next === "carrito" ? `${base}/carrito` : base);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="tienda-container">
      <div className="tienda-auth-card">
        <h2>{mode === "login" ? "Iniciar sesión" : "Crear cuenta"}</h2>
        <p className="sub">{mode === "login" ? "Accede para ver tus precios personalizados." : "Regístrate para empezar a pedir."}</p>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <>
              <div className="tienda-field">
                <label>Nombre completo o razón social *</label>
                <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
              </div>
              <div className="tienda-field">
                <label>Teléfono</label>
                <input value={telefono} onChange={(e) => setTelefono(e.target.value)} />
              </div>
            </>
          )}
          <div className="tienda-field">
            <label>Correo *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="tienda-field">
            <label>Contraseña *</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </div>

          {err && <div className="tienda-error">{err}</div>}

          <button className="tienda-btn tienda-btn-primary tienda-btn-block" disabled={loading}>
            {loading ? "Procesando…" : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
        </form>

        <div style={{ textAlign: "center", marginTop: 16, fontSize: 14 }}>
          {mode === "login" ? (
            <>¿No tienes cuenta? <button type="button" onClick={() => setMode("signup")} style={{ background: "none", border: 0, color: "var(--tienda-primary)", cursor: "pointer", fontWeight: 700 }}>Regístrate</button></>
          ) : (
            <>¿Ya tienes cuenta? <button type="button" onClick={() => setMode("login")} style={{ background: "none", border: 0, color: "var(--tienda-primary)", cursor: "pointer", fontWeight: 700 }}>Inicia sesión</button></>
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
