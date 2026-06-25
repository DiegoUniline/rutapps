import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fnPost, useTienda } from "@/tienda/TiendaContext";
import TiendaShell from "./TiendaShell";
import { KeyRound } from "lucide-react";

function Inner() {
  const t = useTienda();
  const nav = useNavigate();
  const base = `/tienda/${t.slug}`;
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [confirmar, setConfirmar] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  if (!t.isAuth) {
    return (
      <main className="tienda-container">
        <div className="tienda-auth-card">
          <h2>Inicia sesión</h2>
          <p className="sub">Necesitas iniciar sesión para cambiar tu contraseña.</p>
          <Link to={`${base}/login`} className="tienda-btn tienda-btn-primary tienda-btn-block">Iniciar sesión</Link>
        </div>
      </main>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setOk(false);
    if (nueva.length < 6) { setErr("La nueva contraseña debe tener al menos 6 caracteres"); return; }
    if (nueva !== confirmar) { setErr("Las contraseñas no coinciden"); return; }
    setLoading(true);
    try {
      await fnPost("tienda-change-password", { token: t.token, password_actual: actual, password_nuevo: nueva });
      setOk(true);
      setActual(""); setNueva(""); setConfirmar("");
      setTimeout(() => nav(base), 1500);
    } catch (e) {
      setErr((e as Error).message);
    } finally { setLoading(false); }
  };

  return (
    <main className="tienda-container">
      <div className="tienda-auth-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          <KeyRound size={22} />
          <h2 style={{ margin: 0 }}>Cambiar mi contraseña</h2>
        </div>
        <p className="sub">Cuenta: <strong>{t.email}</strong></p>

        <form onSubmit={submit}>
          <div className="tienda-field">
            <label>Contraseña actual *</label>
            <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} required />
          </div>
          <div className="tienda-field">
            <label>Nueva contraseña * (mín. 6)</label>
            <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} required minLength={6} />
          </div>
          <div className="tienda-field">
            <label>Confirmar nueva contraseña *</label>
            <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} required minLength={6} />
          </div>

          {err && <div className="tienda-error">{err}</div>}
          {ok && <div style={{ background: "#dcfce7", color: "#166534", padding: 10, borderRadius: 6, fontSize: 14 }}>Contraseña actualizada ✓</div>}

          <button className="tienda-btn tienda-btn-primary tienda-btn-block" disabled={loading}>
            {loading ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>
        <div style={{ textAlign: "center", marginTop: 12 }}>
          <Link to={base} style={{ color: "#666", fontSize: 13 }}>← Volver a la tienda</Link>
        </div>
      </div>
    </main>
  );
}

export default function TiendaCambiarPasswordPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
