import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, History, Loader2, PackageCheck, ShoppingCart, Sparkles } from "lucide-react";
import { Link } from "react-router-dom";
import { fnPost, formatMoney, useTienda } from "@/tienda/TiendaContext";

type SuggestedItem = {
  producto_id: string;
  nombre: string;
  sku: string | null;
  imagen_url: string | null;
  unidad: string | null;
  precio: number;
  stock: number;
  vender_sin_stock: boolean;
  presentacion_id: string | null;
  factor_base: number;
  cantidad_sugerida: number;
  compras_ultimo_anio: number;
  frecuencia_dias: number;
  dias_desde_ultima: number;
  ultima_compra: string;
};

export default function PedidoSugeridoView() {
  const t = useTienda();
  const base = `/tienda/${t.slug}`;
  const [items, setItems] = useState<SuggestedItem[]>([]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true); setError(null);
      try {
        const r = await fnPost("tienda-asistente-pedido", { action: "suggested", slug: t.slug, token: t.token });
        if (cancelled) return;
        const rows: SuggestedItem[] = r?.items ?? [];
        setItems(rows);
        setQty(Object.fromEntries(rows.map((x) => [x.producto_id, x.cantidad_sugerida])));
      } catch (e) { if (!cancelled) setError((e as Error).message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [t.slug, t.token]);

  const moneda = t.empresa?.moneda ?? "MXN";
  const total = useMemo(() => items.reduce((s, p) => s + (qty[p.producto_id] ?? 0) * p.precio, 0), [items, qty]);

  const addAll = () => {
    items.forEach((p) => {
      const cantidad = Math.max(0, Number(qty[p.producto_id] ?? 0));
      if (!cantidad || (p.stock <= 0 && !p.vender_sin_stock)) return;
      t.addToCart({ producto_id: p.producto_id, nombre: p.nombre, imagen_url: p.imagen_url, precio_unitario: p.precio,
        cantidad, unidad: p.unidad, presentacion_id: p.presentacion_id, factor_base: p.factor_base || 1 });
    });
    setAdded(true); window.setTimeout(() => setAdded(false), 1600);
  };

  if (!t.isAuth) return (
    <main className="tienda-container py-10">
      <div className="max-w-xl mx-auto bg-white border rounded-2xl p-8 text-center space-y-4">
        <Sparkles className="mx-auto" size={32} style={{ color: "var(--tienda-primary)" }} />
        <h1 className="text-2xl font-extrabold">Tu pedido sugerido es personalizado</h1>
        <p className="text-gray-600">Inicia sesión para analizar tu historial real de compras y preparar una sugerencia.</p>
        <Link to={`${base}/login`} className="tienda-btn tienda-btn-primary">Iniciar sesión</Link>
      </div>
    </main>
  );

  return (
    <main className="tienda-container py-6 sm:py-8">
      <div className="flex items-center justify-between gap-3 mb-6">
        <div>
          <Link to={base} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-900 mb-2"><ArrowLeft size={15} /> Volver a la tienda</Link>
          <div className="flex items-center gap-2"><Sparkles size={24} style={{ color: "var(--tienda-primary)" }} /><h1 className="text-2xl sm:text-3xl font-extrabold">Mi pedido sugerido</h1></div>
          <p className="text-sm text-gray-500 mt-1">Calculado con tus compras reales, frecuencia y cantidades habituales. Tú decides qué agregar.</p>
        </div>
      </div>

      {loading && <div className="py-16 flex justify-center gap-2 text-gray-500"><Loader2 className="animate-spin" /> Analizando tu historial…</div>}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>}

      {!loading && !error && items.length === 0 && (
        <div className="rounded-2xl border bg-white p-10 text-center max-w-2xl mx-auto">
          <History size={34} className="mx-auto text-gray-400 mb-3" />
          <h2 className="font-bold text-xl">Aún no hay suficiente historial</h2>
          <p className="text-gray-500 mt-2">Después de varias compras podremos reconocer qué productos repites y cada cuánto los necesitas.</p>
          <Link to={`${base}/productos`} className="tienda-btn tienda-btn-primary mt-5">Ver catálogo</Link>
        </div>
      )}

      {!loading && items.length > 0 && (
        <div className="grid lg:grid-cols-[1fr_330px] gap-6 items-start">
          <div className="space-y-3">
            {items.map((p) => {
              const available = p.stock > 0 || p.vender_sin_stock;
              return (
                <div key={p.producto_id} className="bg-white border rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                  <div className="h-16 w-16 rounded-lg bg-gray-50 border overflow-hidden shrink-0 flex items-center justify-center">
                    {p.imagen_url ? <img src={p.imagen_url} alt="" className="w-full h-full object-contain" /> : <PackageCheck className="text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-base truncate">{p.nombre}</div>
                    <div className="text-xs text-gray-500 mt-1">{p.sku ? `${p.sku} · ` : ""}{p.compras_ultimo_anio} compras · cada ~{p.frecuencia_dias} días · última hace {p.dias_desde_ultima} días</div>
                    <div className={`text-xs mt-1 ${available ? "text-green-700" : "text-red-600"}`}>{available ? (p.stock > 0 ? `${p.stock} disponibles` : "Disponible bajo pedido") : "Actualmente agotado"}</div>
                  </div>
                  <div className="sm:text-right min-w-[150px]">
                    <div className="font-extrabold">{formatMoney(p.precio, moneda)}</div>
                    <div className="flex items-center sm:justify-end gap-2 mt-2">
                      <span className="text-xs text-gray-500">Cantidad</span>
                      <input type="number" min={0} step={1} value={qty[p.producto_id] ?? 0}
                        onChange={(e) => setQty((q) => ({ ...q, [p.producto_id]: Math.max(0, Number(e.target.value) || 0) }))}
                        className="w-20 border rounded-lg px-2 py-1.5 text-right font-semibold" />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <aside className="bg-white border rounded-2xl p-5 lg:sticky lg:top-4">
            <div className="text-sm text-gray-500">Total estimado</div>
            <div className="text-3xl font-extrabold mt-1">{formatMoney(total, moneda)}</div>
            <p className="text-xs text-gray-500 mt-2">Usa tu lista de precios actual. Las existencias se validan antes de confirmar el pedido.</p>
            <button onClick={addAll} className="tienda-btn tienda-btn-primary tienda-btn-block mt-5 flex items-center justify-center gap-2">
              {added ? <><PackageCheck size={17} /> Agregado al carrito</> : <><ShoppingCart size={17} /> Agregar todo al carrito</>}
            </button>
          </aside>
        </div>
      )}
    </main>
  );
}
