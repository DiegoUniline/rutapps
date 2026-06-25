import { useQuery } from "@tanstack/react-query";
import { Link, Navigate } from "react-router-dom";
import { fnGet, formatMoney, useTienda } from "@/tienda/TiendaContext";
import TiendaShell from "./TiendaShell";

function Inner() {
  const t = useTienda();
  const base = `/tienda/${t.slug}`;
  if (!t.isAuth) return <Navigate to={`${base}/login`} replace />;

  const { data, isLoading } = useQuery({
    queryKey: ["tienda-pedidos", t.token],
    queryFn: () => fnGet("tienda-pedidos", { token: t.token! }),
    staleTime: 30_000,
  });

  const pedidos: any[] = data?.pedidos ?? [];
  const moneda = t.empresa?.moneda ?? "MXN";

  const statusLabel: Record<string, string> = {
    borrador: "Recibido",
    confirmado: "Confirmado",
    entregado: "Entregado",
    facturado: "Facturado",
    cancelado: "Cancelado",
  };

  return (
    <main className="tienda-container">
      <h2 className="tienda-section-title" style={{ marginTop: 0 }}>Mis pedidos</h2>
      {isLoading ? (
        <div className="tienda-loading">Cargando…</div>
      ) : pedidos.length === 0 ? (
        <div className="tienda-empty">
          <p>Aún no tienes pedidos.</p>
          <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary">Ver catálogo</Link>
        </div>
      ) : (
        <div className="tienda-pedidos-list">
          {pedidos.map((p) => (
            <div key={p.id} className="tienda-pedido-row">
              <div>
                <div style={{ fontWeight: 700 }}>{p.folio}</div>
                <div style={{ fontSize: 12, color: "#888" }}>{new Date(p.fecha).toLocaleDateString("es-MX", { dateStyle: "long" })}</div>
              </div>
              <span className={`tienda-status-chip tienda-status-${p.status}`}>{statusLabel[p.status] ?? p.status}</span>
              <div style={{ fontSize: 13, color: "#666" }}>
                {p.saldo_pendiente > 0 ? `Pendiente: ${formatMoney(Number(p.saldo_pendiente), moneda)}` : "Pagado"}
              </div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{formatMoney(Number(p.total), moneda)}</div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

export default function TiendaMisPedidosPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
