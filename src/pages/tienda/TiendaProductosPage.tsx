import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { fnGet, TiendaProducto, useTienda } from "@/tienda/TiendaContext";
import { ProductCard } from "./TiendaHomePage";
import TiendaShell from "./TiendaShell";

function Inner() {
  const t = useTienda();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const cat = sp.get("cat") ?? "";
  const [orden, setOrden] = useState<"alpha" | "precio_asc" | "precio_desc">("alpha");
  const [marcasSel, setMarcasSel] = useState<string[]>([]);

  const { data, isLoading } = useQuery({
    queryKey: ["tienda-catalog", t.slug, t.token],
    queryFn: () => fnGet("tienda-catalog", { slug: t.slug, ...(t.token ? { token: t.token } : {}) }),
    staleTime: 60_000,
  });

  const productos: TiendaProducto[] = data?.productos ?? [];
  // Soporta categorias como string[] (viejo) o { nombre, imagen_url }[] (nuevo).
  const categorias: string[] = (data?.categorias ?? []).map((c: any) => typeof c === 'string' ? c : c.nombre);
  const marcas: string[] = data?.marcas ?? [];

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    let list = productos.filter((p) =>
      (!cat || p.categoria === cat) &&
      (marcasSel.length === 0 || (p.marca && marcasSel.includes(p.marca))) &&
      (!term || p.nombre.toLowerCase().includes(term) || (p.sku ?? "").toLowerCase().includes(term))
    );
    if (orden === "precio_asc") list = [...list].sort((a, b) => a.precio - b.precio);
    else if (orden === "precio_desc") list = [...list].sort((a, b) => b.precio - a.precio);
    return list;
  }, [productos, q, cat, marcasSel, orden]);

  const setCat = (c: string) => {
    const next = new URLSearchParams(sp);
    if (c) next.set("cat", c); else next.delete("cat");
    setSp(next);
  };

  return (
    <main className="tienda-container">
      <div className="tienda-grid">
        <aside className="tienda-sidebar">
          <div className="tienda-filter-group">
            <div className="tienda-filter-title">Categorías</div>
            <div className="tienda-filter-list">
              <label className="tienda-filter-item">
                <input type="radio" name="cat" checked={!cat} onChange={() => setCat("")} />
                Todas
              </label>
              {categorias.map((c) => (
                <label key={c} className="tienda-filter-item">
                  <input type="radio" name="cat" checked={cat === c} onChange={() => setCat(c)} />
                  {c}
                </label>
              ))}
            </div>
          </div>
          {marcas.length > 0 && (
            <div className="tienda-filter-group">
              <div className="tienda-filter-title">Marcas</div>
              <div className="tienda-filter-list">
                {marcas.map((m) => (
                  <label key={m} className="tienda-filter-item">
                    <input
                      type="checkbox"
                      checked={marcasSel.includes(m)}
                      onChange={(e) => setMarcasSel((prev) => e.target.checked ? [...prev, m] : prev.filter((x) => x !== m))}
                    />
                    {m}
                  </label>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, color: "#666" }}>
              {isLoading ? "Cargando…" : `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`}
              {q && <> · búsqueda: <strong>"{q}"</strong></>}
              {cat && <> · categoría: <strong>{cat}</strong></>}
            </div>
            <div>
              <label style={{ fontSize: 13, marginRight: 6, color: "#666" }}>Ordenar:</label>
              <select value={orden} onChange={(e) => setOrden(e.target.value as any)} className="tienda-btn tienda-btn-outline" style={{ padding: "6px 10px" }}>
                <option value="alpha">Nombre A–Z</option>
                <option value="precio_asc">Precio: menor a mayor</option>
                <option value="precio_desc">Precio: mayor a menor</option>
              </select>
            </div>
          </div>

          {isLoading ? (
            <div className="tienda-loading">Cargando productos…</div>
          ) : filtered.length === 0 ? (
            <div className="tienda-empty">No se encontraron productos con esos filtros.</div>
          ) : (
            <div className="tienda-products">
              {filtered.map((p) => <ProductCard key={p.id} p={p} />)}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

export default function TiendaProductosPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
