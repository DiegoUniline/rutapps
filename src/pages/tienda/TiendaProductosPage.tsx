import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { ChevronDown, SlidersHorizontal, X } from "lucide-react";
import { fnGet, TiendaProducto, useTienda, expandProductosConPresentaciones } from "@/tienda/TiendaContext";
import { ProductCard } from "./TiendaHomePage";
import TiendaShell from "./TiendaShell";
import "@/tienda/tienda-catalog-mobile.css";

function Inner() {
  const t = useTienda();
  const [sp, setSp] = useSearchParams();
  const q = sp.get("q") ?? "";
  const cat = sp.get("cat") ?? "";
  const [orden, setOrden] = useState<"alpha" | "precio_asc" | "precio_desc">("alpha");
  const [marcasSel, setMarcasSel] = useState<string[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tienda-catalog", t.slug, t.token],
    queryFn: () => fnGet("tienda-catalog", { slug: t.slug, ...(t.token ? { token: t.token } : {}) }),
    staleTime: 60_000,
  });

  const productos: TiendaProducto[] = useMemo(
    () => expandProductosConPresentaciones(data?.productos ?? []),
    [data?.productos],
  );
  const categorias: string[] = (data?.categorias ?? []).map((c: any) => typeof c === "string" ? c : c.nombre);
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

  const clearFilters = () => {
    setCat("");
    setMarcasSel([]);
  };

  const activeFilterCount = (cat ? 1 : 0) + marcasSel.length;
  const contextLabel = q ? `Búsqueda: “${q}”` : cat ? cat : marcasSel.length ? `${marcasSel.length} marca${marcasSel.length === 1 ? "" : "s"}` : "Todo el catálogo";

  return (
    <main className="tienda-container">
      <div className="tienda-grid tx-catalog-page">
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
          <div className="tx-catalog-mobile-controls">
            <div className="tx-mobile-category-rail" aria-label="Categorías">
              <button
                type="button"
                className={`tx-mobile-category-chip ${!cat ? "active" : ""}`}
                onClick={() => setCat("")}
              >
                Todos
              </button>
              {categorias.map((c) => (
                <button
                  type="button"
                  key={c}
                  className={`tx-mobile-category-chip ${cat === c ? "active" : ""}`}
                  onClick={() => setCat(c)}
                >
                  {c}
                </button>
              ))}
            </div>

            <div className="tx-mobile-catalog-toolbar">
              <div className="tx-mobile-result-count">
                <strong>{isLoading ? "Cargando…" : `${filtered.length} productos`}</strong>
                <span>{contextLabel}</span>
              </div>

              <button type="button" className="tx-mobile-filter-button" onClick={() => setFiltersOpen(true)}>
                <SlidersHorizontal size={15} />
                Filtros
                {activeFilterCount > 0 && <span className="tx-mobile-filter-badge">{activeFilterCount}</span>}
              </button>

              <label className="tx-mobile-sort-wrap" aria-label="Ordenar productos">
                <select value={orden} onChange={(e) => setOrden(e.target.value as any)}>
                  <option value="alpha">A–Z</option>
                  <option value="precio_asc">$ menor</option>
                  <option value="precio_desc">$ mayor</option>
                </select>
                <ChevronDown size={14} />
              </label>
            </div>
          </div>

          <div className="tx-catalog-results-head">
            <div className="tx-catalog-count">
              {isLoading ? "Cargando…" : `${filtered.length} producto${filtered.length === 1 ? "" : "s"}`}
              {q && <> · búsqueda: <strong>"{q}"</strong></>}
              {cat && <> · categoría: <strong>{cat}</strong></>}
            </div>
            <div className="tx-catalog-sort-desktop">
              <label>Ordenar:</label>
              <select value={orden} onChange={(e) => setOrden(e.target.value as any)} className="tienda-btn tienda-btn-outline">
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

      {filtersOpen && (
        <div className="tx-mobile-filter-layer" role="presentation">
          <button className="tx-mobile-filter-backdrop" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros" />
          <section className="tx-mobile-filter-drawer" role="dialog" aria-modal="true" aria-label="Filtros del catálogo">
            <div className="tx-mobile-filter-head">
              <div>
                <h2>Filtrar productos</h2>
                <p>{activeFilterCount ? `${activeFilterCount} filtro${activeFilterCount === 1 ? "" : "s"} activo${activeFilterCount === 1 ? "" : "s"}` : "Encuentra más rápido lo que buscas"}</p>
              </div>
              <button type="button" className="tx-mobile-filter-close" onClick={() => setFiltersOpen(false)} aria-label="Cerrar">
                <X size={18} />
              </button>
            </div>

            <div className="tx-mobile-filter-body">
              <div className="tx-mobile-filter-section">
                <div className="tx-mobile-filter-section-title">Categorías</div>
                <div className="tx-mobile-filter-options">
                  <label className="tx-mobile-filter-option">
                    <input type="radio" name="mobile-cat" checked={!cat} onChange={() => setCat("")} />
                    <span>Todas</span>
                  </label>
                  {categorias.map((c) => (
                    <label className="tx-mobile-filter-option" key={c}>
                      <input type="radio" name="mobile-cat" checked={cat === c} onChange={() => setCat(c)} />
                      <span>{c}</span>
                    </label>
                  ))}
                </div>
              </div>

              {marcas.length > 0 && (
                <div className="tx-mobile-filter-section">
                  <div className="tx-mobile-filter-section-title">Marcas</div>
                  <div className="tx-mobile-filter-options">
                    {marcas.map((m) => (
                      <label className="tx-mobile-filter-option" key={m}>
                        <input
                          type="checkbox"
                          checked={marcasSel.includes(m)}
                          onChange={(e) => setMarcasSel((prev) => e.target.checked ? [...prev, m] : prev.filter((x) => x !== m))}
                        />
                        <span>{m}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="tx-mobile-filter-foot">
              <button type="button" className="tx-mobile-filter-clear" onClick={clearFilters} disabled={activeFilterCount === 0}>
                Limpiar
              </button>
              <button type="button" className="tx-mobile-filter-apply" onClick={() => setFiltersOpen(false)}>
                Ver {filtered.length} producto{filtered.length === 1 ? "" : "s"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

export default function TiendaProductosPage() {
  return <TiendaShell><Inner /></TiendaShell>;
}
