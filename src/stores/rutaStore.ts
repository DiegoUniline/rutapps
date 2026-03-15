import { create } from 'zustand';

interface CartItem {
  producto_id: string;
  codigo: string;
  nombre: string;
  precio_unitario: number;
  cantidad: number;
  unidad: string;
  tiene_iva: boolean;
  iva_pct: number;
  es_cambio?: boolean;
}

interface RutaState {
  // Active vendedor
  vendedorId: string | null;
  vendedorNombre: string | null;
  setVendedor: (id: string | null, nombre: string | null) => void;

  // Current visit cart
  clienteActivo: { id: string; nombre: string } | null;
  cart: CartItem[];
  setClienteActivo: (cliente: { id: string; nombre: string } | null) => void;
  addToCart: (item: CartItem) => void;
  updateCartQty: (productoId: string, cantidad: number) => void;
  removeFromCart: (productoId: string) => void;
  clearCart: () => void;
  cartTotal: () => number;

  // Offline mode
  isOffline: boolean;
  setOffline: (v: boolean) => void;
  pendingSyncCount: number;
  setPendingSyncCount: (n: number) => void;
}

export const useRutaStore = create<RutaState>((set, get) => ({
  vendedorId: null,
  vendedorNombre: null,
  setVendedor: (id, nombre) => set({ vendedorId: id, vendedorNombre: nombre }),

  clienteActivo: null,
  cart: [],
  setClienteActivo: (cliente) => set({ clienteActivo: cliente, cart: [] }),
  addToCart: (item) => {
    const existing = get().cart.find(c => c.producto_id === item.producto_id);
    if (existing) {
      set({
        cart: get().cart.map(c =>
          c.producto_id === item.producto_id
            ? { ...c, cantidad: c.cantidad + item.cantidad }
            : c
        ),
      });
    } else {
      set({ cart: [...get().cart, item] });
    }
  },
  updateCartQty: (productoId, cantidad) => {
    if (cantidad <= 0) {
      set({ cart: get().cart.filter(c => c.producto_id !== productoId) });
    } else {
      set({
        cart: get().cart.map(c =>
          c.producto_id === productoId ? { ...c, cantidad } : c
        ),
      });
    }
  },
  removeFromCart: (productoId) =>
    set({ cart: get().cart.filter(c => c.producto_id !== productoId) }),
  clearCart: () => set({ cart: [], clienteActivo: null }),
  cartTotal: () =>
    get().cart.reduce((sum, item) => {
      if (item.es_cambio) return sum;
      const base = item.precio_unitario * item.cantidad;
      const iva = item.tiene_iva ? base * (item.iva_pct / 100) : 0;
      return sum + base + iva;
    }, 0),

  isOffline: !navigator.onLine,
  setOffline: (v) => set({ isOffline: v }),
  pendingSyncCount: 0,
  setPendingSyncCount: (n) => set({ pendingSyncCount: n }),
}));
