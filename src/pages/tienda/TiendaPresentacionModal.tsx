import { useMemo, useState } from "react";
import { X, Minus, Plus } from "lucide-react";
import { TiendaProducto, TiendaPresentacion, useTienda, formatMoney } from "@/tienda/TiendaContext";

/**
 * Selector de presentaciones para la tienda en línea.
 * Igual que el escritorio y el móvil: si el producto tiene presentaciones
 * (caja/paquete) el cliente elige unidad o presentación antes de agregar.
 * El precio por presentación es `precio_especial` o, si no hay, precio × factor.
 */
export default function TiendaPresentacionModal({
  producto,
  moneda,
  onClose,
}: {
  producto: TiendaProducto;
  moneda: string;
  onClose: () => void;
}) {
  const t = useTienda();
  const unidadBase = producto.unidad_venta ?? "pz";
  const presentaciones = useMemo(
    () => (producto.presentaciones ?? []).filter((p) => Number(p.factor_base) > 0),
    [producto.presentaciones],
  );

  // opción seleccionada: null = unidad base, o el id de la presentación
  const [presId, setPresId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);

  const presSel: TiendaPresentacion | null =
    presId ? presentaciones.find((p) => p.id === presId) ?? null : null;

  const precioUnitario = presSel
    ? presSel.precio_especial ?? producto.precio * Number(presSel.factor_base)
    : producto.precio;
  const unidad = presSel ? presSel.nombre : unidadBase;
  const subtotal = precioUnitario * cantidad;

  const agregar = () => {
    if (cantidad <= 0) return;
    t.addToCart({
      producto_id: producto.id,
      nombre: producto.nombre,
      imagen_url: producto.imagen_url,
      precio_unitario: precioUnitario,
      cantidad,
      unidad,
      presentacion_id: presSel ? presSel.id : null,
      factor_base: presSel ? Number(presSel.factor_base) : 1,
    });
    onClose();
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 80, display: "flex",
        alignItems: "flex-end", justifyContent: "center", background: "rgba(0,0,0,.5)",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff", width: "100%", maxWidth: 520, borderRadius: "18px 18px 0 0",
          maxHeight: "92dvh", overflowY: "auto", boxShadow: "0 -6px 30px rgba(0,0,0,.25)",
        }}
        className="tx-pres-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            position: "sticky", top: 0, background: "#fff", borderBottom: "1px solid #eee",
            padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{producto.nombre}</div>
            <div style={{ fontSize: 12, color: "#888" }}>Elige presentación</div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", padding: 6, cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {/* Unidad base */}
            <button
              onClick={() => setPresId(null)}
              style={optStyle(presId === null)}
            >
              <div style={{ fontWeight: 600 }}>1 {unidadBase}</div>
              <div style={{ fontSize: 11, color: "#888" }}>Unidad</div>
              <div style={{ fontWeight: 700, color: "var(--tienda-primary)", marginTop: 4 }}>
                {formatMoney(producto.precio, moneda)}
              </div>
            </button>

            {presentaciones.map((p) => {
              const pu = p.precio_especial ?? producto.precio * Number(p.factor_base);
              return (
                <button key={p.id} onClick={() => setPresId(p.id)} style={optStyle(presId === p.id)}>
                  <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                  <div style={{ fontSize: 11, color: "#888" }}>{Number(p.factor_base)} {unidadBase}</div>
                  <div style={{ fontWeight: 700, color: "var(--tienda-primary)", marginTop: 4 }}>
                    {formatMoney(pu, moneda)}
                  </div>
                </button>
              );
            })}
          </div>

          <div style={{ marginTop: 18 }}>
            <div style={{ fontSize: 12, color: "#888", textTransform: "uppercase", marginBottom: 8 }}>
              Cantidad {presSel ? `(${presSel.nombre})` : `(${unidadBase})`}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setCantidad((q) => Math.max(1, q - 1))} style={stepStyle} aria-label="Disminuir">
                <Minus size={16} />
              </button>
              <input
                type="number" min={1} value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, Number(e.target.value) || 1))}
                style={{
                  flex: 1, height: 48, textAlign: "center", fontSize: 20, fontWeight: 700,
                  border: "1px solid #ddd", borderRadius: 10,
                }}
              />
              <button onClick={() => setCantidad((q) => q + 1)} style={{ ...stepStyle, background: "var(--tienda-primary)", color: "#fff", borderColor: "var(--tienda-primary)" }} aria-label="Aumentar">
                <Plus size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 18, paddingTop: 14, borderTop: "1px solid #eee" }}>
            <span style={{ color: "#666" }}>Subtotal</span>
            <strong style={{ fontSize: 20, color: "var(--tienda-primary)" }}>{formatMoney(subtotal, moneda)}</strong>
          </div>

          <button
            className="tienda-btn tienda-btn-primary tienda-btn-block"
            style={{ marginTop: 14 }}
            onClick={agregar}
          >
            Agregar al carrito
          </button>
        </div>
      </div>
    </div>
  );
}

function optStyle(active: boolean): React.CSSProperties {
  return {
    textAlign: "left", borderRadius: 12, padding: "12px 14px", cursor: "pointer",
    border: `2px solid ${active ? "var(--tienda-primary)" : "#e6e6e6"}`,
    background: active ? "rgba(0,97,232,.06)" : "#fff",
  };
}

const stepStyle: React.CSSProperties = {
  width: 48, height: 48, borderRadius: 10, border: "1px solid #ddd", background: "#f4f4f5",
  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
};
