import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Search, ShoppingCart, X, Send, Filter, Package } from 'lucide-react';


interface Producto {
  id: string;
  nombre: string;
  sku: string | null;
  categoria: string | null;
  marca: string | null;
  imagen_url: string | null;
  unidad_venta: string | null;
  precio: number;
}

interface CartItem {
  producto: Producto;
  cantidad: number;
}

interface CatalogData {
  empresa: { nombre: string; logo_url: string | null; telefono: string; moneda: string } | null;
  lista_nombre: string;
  productos: Producto[];
  categorias: string[];
  marcas: string[];
}

export default function CatalogoPublicoPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<CatalogData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [categoria, setCategoria] = useState('');
  const [marca, setMarca] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);

    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-catalog?token=${token}`;
    fetch(url, { headers: { 'apikey': import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } })
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); }
        else { setData(d); }
      })
      .catch(() => setError('No se pudo conectar con el servidor. Verifica tu conexión a internet.'))
      .finally(() => setLoading(false));
  }, [token]);

  const filtered = useMemo(() => {
    if (!data) return [];
    return data.productos.filter(p => {
      if (search && !p.nombre.toLowerCase().includes(search.toLowerCase()) && !(p.sku ?? '').toLowerCase().includes(search.toLowerCase())) return false;
      if (categoria && p.categoria !== categoria) return false;
      if (marca && p.marca !== marca) return false;
      return true;
    });
  }, [data, search, categoria, marca]);

  const addToCart = (p: Producto) => {
    setCart(prev => {
      const existing = prev.find(c => c.producto.id === p.id);
      if (existing) return prev.map(c => c.producto.id === p.id ? { ...c, cantidad: c.cantidad + 1 } : c);
      return [...prev, { producto: p, cantidad: 1 }];
    });
  };

  const updateQty = (id: string, qty: number) => {
    if (qty <= 0) {
      setCart(prev => prev.filter(c => c.producto.id !== id));
    } else {
      setCart(prev => prev.map(c => c.producto.id === id ? { ...c, cantidad: qty } : c));
    }
  };

  const cartTotal = cart.reduce((s, c) => s + c.producto.precio * c.cantidad, 0);
  const cartCount = cart.reduce((s, c) => s + c.cantidad, 0);
  const moneda = data?.empresa?.moneda || 'MXN';

  const fmt = (n: number) => n.toLocaleString('es-MX', { style: 'currency', currency: moneda, minimumFractionDigits: 2 });

  const sendWhatsApp = () => {
    if (!data?.empresa?.telefono || cart.length === 0) return;
    let msg = `🛒 *Pedido desde catálogo*\n*${data.empresa.nombre}*\n\n`;
    cart.forEach(c => {
      msg += `• ${c.producto.nombre} x${c.cantidad} — ${fmt(c.producto.precio * c.cantidad)}\n`;
    });
    msg += `\n*Total: ${fmt(cartTotal)}*`;
    const phone = data.empresa.telefono.replace(/\D/g, '');
    window.open(`https://wa.me/${phone.length === 10 ? '52' + phone : phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-500 text-sm">Cargando catálogo...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-lg p-8 text-center max-w-sm">
          <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-slate-800 mb-1">Catálogo no disponible</h2>
          <p className="text-slate-500 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50/30">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          {data.empresa?.logo_url && (
            <img src={data.empresa.logo_url} alt="" className="h-9 w-9 rounded-lg object-contain bg-slate-100 p-0.5" />
          )}
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-slate-900 text-sm sm:text-base truncate">{data.empresa?.nombre}</h1>
            <p className="text-[11px] text-slate-400 truncate">{data.lista_nombre}</p>
          </div>
          <button
            onClick={() => setShowCart(true)}
            className="relative bg-indigo-600 hover:bg-indigo-700 text-white rounded-full p-2.5 transition-all shadow-lg shadow-indigo-200 active:scale-95"
          >
            <ShoppingCart className="h-5 w-5" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center shadow">
                {cartCount}
              </span>
            )}
          </button>
        </div>

        {/* Search bar */}
        <div className="max-w-7xl mx-auto px-4 pb-3 flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar producto..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 bg-slate-100 rounded-xl text-sm border-0 focus:ring-2 focus:ring-indigo-500/30 focus:bg-white transition-all placeholder:text-slate-400"
            />
          </div>
          {(data.categorias.length > 0 || data.marcas.length > 0) && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`px-3 rounded-xl text-sm transition-all ${showFilters || categoria || marca ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>

        {/* Filters */}
        {showFilters && (
          <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-wrap gap-2">
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="text-xs bg-slate-100 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="">Todas las categorías</option>
              {data.categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select
              value={marca}
              onChange={e => setMarca(e.target.value)}
              className="text-xs bg-slate-100 rounded-lg px-3 py-2 border-0 focus:ring-2 focus:ring-indigo-500/30"
            >
              <option value="">Todas las marcas</option>
              {data.marcas.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            {(categoria || marca) && (
              <button onClick={() => { setCategoria(''); setMarca(''); }} className="text-xs text-indigo-600 hover:text-indigo-800 px-2">
                Limpiar filtros
              </button>
            )}
          </div>
        )}
      </header>

      {/* Grid */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <p className="text-xs text-slate-400 mb-4">{filtered.length} producto{filtered.length !== 1 ? 's' : ''}</p>
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <Package className="h-12 w-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm">No se encontraron productos</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filtered.map(p => {
              const inCart = cart.find(c => c.producto.id === p.id);
              return (
                <div key={p.id} className="group bg-white rounded-2xl shadow-sm hover:shadow-md border border-slate-100 overflow-hidden transition-all hover:-translate-y-0.5">
                  {/* Image */}
                  <div className="aspect-square bg-gradient-to-br from-slate-50 to-slate-100 relative overflow-hidden">
                    {p.imagen_url ? (
                      <img src={p.imagen_url} alt={p.nombre} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" loading="lazy" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-10 w-10 text-slate-200" />
                      </div>
                    )}
                    {p.categoria && (
                      <span className="absolute top-2 left-2 bg-white/90 backdrop-blur-sm text-[10px] text-slate-600 rounded-full px-2 py-0.5 font-medium">
                        {p.categoria}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h3 className="font-semibold text-slate-800 text-xs sm:text-sm leading-tight line-clamp-2 mb-1">{p.nombre}</h3>
                    {p.sku && (
                      <p className="text-[11px] text-slate-400 line-clamp-1 mb-2">{p.sku}</p>
                    )}
                    <div className="flex items-end justify-between gap-1">
                      <div>
                        <p className="text-indigo-600 font-bold text-sm sm:text-base">{fmt(p.precio)}</p>
                        {p.unidad_venta && <p className="text-[10px] text-slate-400">/{p.unidad_venta}</p>}
                      </div>
                      {inCart ? (
                        <div className="flex items-center gap-1 bg-indigo-50 rounded-lg px-1">
                          <button onClick={() => updateQty(p.id, inCart.cantidad - 1)} className="text-indigo-600 hover:text-indigo-800 p-1 text-sm font-bold">−</button>
                          <span className="text-xs font-semibold text-indigo-700 w-5 text-center">{inCart.cantidad}</span>
                          <button onClick={() => updateQty(p.id, inCart.cantidad + 1)} className="text-indigo-600 hover:text-indigo-800 p-1 text-sm font-bold">+</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => addToCart(p)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg p-1.5 transition-all active:scale-90 shadow-sm"
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="text-center py-6 text-[11px] text-slate-300">
        Catálogo generado por {data.empresa?.nombre} • Precios sujetos a cambios
      </footer>

      {/* Cart drawer */}
      {showCart && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={() => setShowCart(false)} />
          <div className="ml-auto relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
            {/* Cart header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="font-bold text-slate-800 text-lg">Mi pedido</h2>
              <button onClick={() => setShowCart(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {cart.length === 0 ? (
                <div className="text-center py-16">
                  <ShoppingCart className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                  <p className="text-slate-400 text-sm">Tu pedido está vacío</p>
                  <p className="text-slate-300 text-xs mt-1">Agrega productos del catálogo</p>
                </div>
              ) : cart.map(c => (
                <div key={c.producto.id} className="flex gap-3 bg-slate-50 rounded-xl p-3">
                  <div className="w-14 h-14 rounded-lg bg-white overflow-hidden shrink-0 border border-slate-100">
                    {c.producto.imagen_url ? (
                      <img src={c.producto.imagen_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center"><Package className="h-5 w-5 text-slate-200" /></div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{c.producto.nombre}</p>
                    <p className="text-xs text-slate-400">{fmt(c.producto.precio)} c/u</p>
                    <div className="flex items-center justify-between mt-1.5">
                      <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 px-1">
                        <button onClick={() => updateQty(c.producto.id, c.cantidad - 1)} className="text-slate-500 hover:text-slate-800 p-0.5 text-sm font-bold">−</button>
                        <span className="text-xs font-semibold text-slate-700 w-6 text-center">{c.cantidad}</span>
                        <button onClick={() => updateQty(c.producto.id, c.cantidad + 1)} className="text-slate-500 hover:text-slate-800 p-0.5 text-sm font-bold">+</button>
                      </div>
                      <p className="text-sm font-semibold text-indigo-600">{fmt(c.producto.precio * c.cantidad)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Cart footer */}
            {cart.length > 0 && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Total ({cartCount} artículo{cartCount !== 1 ? 's' : ''})</span>
                  <span className="text-xl font-bold text-slate-900">{fmt(cartTotal)}</span>
                </div>
                <button
                  onClick={sendWhatsApp}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold rounded-xl py-3.5 flex items-center justify-center gap-2 transition-all active:scale-[0.98] shadow-lg shadow-emerald-200"
                >
                  <Send className="h-4 w-4" />
                  Enviar pedido por WhatsApp
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating cart (mobile) */}
      {cartCount > 0 && !showCart && (
        <div className="fixed bottom-4 left-4 right-4 z-40 sm:hidden">
          <button
            onClick={() => setShowCart(true)}
            className="w-full bg-indigo-600 text-white rounded-2xl py-3.5 px-5 flex items-center justify-between shadow-xl shadow-indigo-300/40 active:scale-[0.98] transition-all"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5" />
              <span className="font-semibold text-sm">Ver pedido ({cartCount})</span>
            </span>
            <span className="font-bold">{fmt(cartTotal)}</span>
          </button>
        </div>
      )}
    </div>
  );
}
