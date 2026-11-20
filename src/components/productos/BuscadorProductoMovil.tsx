import { useEffect, useMemo, useRef, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Minus, Plus, Search } from 'lucide-react';
import { formatCurrency } from '@/lib/currency';
import { cn } from '@/lib/utils';

/**
 * D-038 · Agregar productos en teléfono (módulo administrativo).
 *
 * Botón «Buscar producto» → buscador a pantalla completa con existencias →
 * al tocar un producto se despliega debajo cantidad (− / +), presentación,
 * precio/costo y subtotal → «Agregar» entrega los valores al formulario y
 * regresa al documento.
 *
 * El componente NO calcula precios, promociones ni inventario: solo captura.
 * Cada formulario resuelve el renglón en `onAgregar` con su lógica de siempre.
 */

export type ModoBuscadorProducto = 'venta' | 'compra' | 'traspaso';

export interface ProductoBuscable {
  id: string;
  codigo: string;
  nombre: string;
  /** Texto adicional para buscar (nombre de compra, fórmula, códigos de barras…). */
  textoBusqueda?: string | null;
  imagenUrl?: string | null;
  /** Unidad en que se captura la cantidad y el precio (pz, kg, CJ…). */
  unidad?: string | null;
  /** Unidad de la existencia, si es distinta de `unidad` (p. ej. compras por caja, existencia en piezas). */
  unidadExistencia?: string | null;
}

export interface PresentacionBuscable {
  id: string;
  nombre: string;
  /** Unidades base que contiene la presentación. */
  factor: number;
}

export interface AgregarProductoDatos<P extends ProductoBuscable = ProductoBuscable> {
  producto: P;
  cantidad: number;
  presentacion: PresentacionBuscable | null;
  /** Precio/costo por unidad base (0 en traspasos). */
  precio: number;
}

interface Props<P extends ProductoBuscable> {
  productos: P[];
  modo: ModoBuscadorProducto;
  /** Devuelve `false` si el formulario no pudo agregar (el buscador sigue abierto). */
  onAgregar: (datos: AgregarProductoDatos<P>) => boolean | void;
  getExistencia?: (producto: P) => number | null | undefined;
  getPresentaciones?: (producto: P) => PresentacionBuscable[];
  /** Precio/costo sugerido por unidad base para la presentación elegida. */
  getPrecio?: (producto: P, presentacion: PresentacionBuscable | null) => number;
  puedeEditarPrecio?: boolean;
  /** Ids de productos que ya están en el documento (se marcan «agregado»). */
  agregados?: ReadonlySet<string>;
  disabled?: boolean;
  /** Mensaje bajo el botón cuando está deshabilitado. */
  avisoDeshabilitado?: string;
  /** Si existe, sin resultados se ofrece crear el producto con el texto buscado. */
  onCrearNuevo?: (texto: string) => void;
  fmt?: (valor: number) => string;
  etiquetaBoton?: string;
  etiquetaPrecio?: string;
}

const MAX_RESULTADOS = 50;

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmtNum = (n: number) => n.toLocaleString('es-MX', { maximumFractionDigits: 3 });
const parseNum = (s: string) => {
  const t = s.trim().replace(',', '.');
  if (!t) return NaN;
  return Number(t);
};
const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;

function iniciales(nombre: string) {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes[1]?.[0] ?? '')).toUpperCase() || '?';
}

interface Borrador {
  cantidad: string;
  presentacionId: string | null;
  precio: string;
}

export function BuscadorProductoMovil<P extends ProductoBuscable>({
  productos, modo, onAgregar, getExistencia, getPresentaciones, getPrecio,
  puedeEditarPrecio = false, agregados, disabled = false, avisoDeshabilitado,
  onCrearNuevo, fmt = (v: number) => formatCurrency(v, 'MXN'),
  etiquetaBoton = 'Buscar producto', etiquetaPrecio,
}: Props<P>) {
  const [abierto, setAbierto] = useState(false);
  const [q, setQ] = useState('');
  const [abiertoId, setAbiertoId] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador>({ cantidad: '1', presentacionId: null, precio: '0' });
  const inputRef = useRef<HTMLInputElement>(null);
  const conPrecio = modo !== 'traspaso';
  const precioLabel = etiquetaPrecio ?? (modo === 'compra' ? 'Costo' : 'Precio');

  const cerrar = () => { setAbierto(false); setQ(''); setAbiertoId(null); };

  useEffect(() => {
    if (!abierto) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') cerrar(); };
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = prev; window.clearTimeout(t); window.removeEventListener('keydown', onKey); };
  }, [abierto]);

  const filtrados = useMemo(() => {
    const term = normalizar(q.trim());
    if (!term) return productos;
    return productos.filter(p => normalizar(`${p.nombre} ${p.codigo} ${p.textoBusqueda ?? ''}`).includes(term));
  }, [productos, q]);
  const visibles = filtrados.slice(0, MAX_RESULTADOS);

  const presentacionesDe = (p: P) => (getPresentaciones?.(p) ?? []).filter(x => Number(x.factor) > 0);
  const precioDe = (p: P, pres: PresentacionBuscable | null) => (conPrecio && getPrecio ? Number(getPrecio(p, pres)) || 0 : 0);

  const abrirProducto = (p: P) => {
    if (abiertoId === p.id) { setAbiertoId(null); return; }
    setAbiertoId(p.id);
    setBorrador({ cantidad: '1', presentacionId: null, precio: String(r4(precioDe(p, null))) });
  };

  const elegirPresentacion = (p: P, pres: PresentacionBuscable | null) => {
    setBorrador(b => ({ ...b, presentacionId: pres?.id ?? null, precio: String(r4(precioDe(p, pres))) }));
  };

  const pasoCantidad = (delta: number) => {
    setBorrador(b => {
      const actual = parseNum(b.cantidad);
      const base = Number.isFinite(actual) ? actual : 1;
      return { ...b, cantidad: String(Math.max(1, Math.round((base + delta) * 1000) / 1000)) };
    });
  };

  const agregar = (p: P) => {
    const cantidad = parseNum(borrador.cantidad);
    const precio = conPrecio ? parseNum(borrador.precio) : 0;
    if (!(cantidad > 0) || !(precio >= 0)) return;
    const presentacion = presentacionesDe(p).find(x => x.id === borrador.presentacionId) ?? null;
    const res = onAgregar({ producto: p, cantidad, presentacion, precio });
    if (res === false) return;
    cerrar();
  };

  const boton = (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => setAbierto(true)}
        disabled={disabled}
        className="w-full flex items-center justify-center gap-2 rounded-lg border-[1.5px] border-dashed border-primary bg-primary/10 px-3 py-3 text-sm font-semibold text-primary active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <Search className="h-4 w-4" /> {etiquetaBoton}
      </button>
      {disabled && avisoDeshabilitado && <p className="text-[11px] text-muted-foreground text-center">{avisoDeshabilitado}</p>}
    </div>
  );

  if (!abierto) return boton;

  const overlay = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Buscar producto"
      className="fixed inset-0 z-50 flex flex-col bg-app"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="flex items-center gap-2 border-b border-border bg-card p-2.5">
        <button type="button" onClick={cerrar} aria-label="Regresar al documento" className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <input
          ref={inputRef}
          type="search"
          autoFocus
          value={q}
          onChange={e => { setQ(e.target.value); setAbiertoId(null); }}
          placeholder="Nombre o código…"
          autoComplete="off"
          aria-label="Buscar por nombre o código"
          className="h-10 min-w-0 flex-1 rounded-full border border-border bg-muted/40 px-4 text-sm text-foreground outline-none focus:border-primary"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2.5">
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {visibles.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground space-y-3">
              <p>{q.trim() ? 'Sin resultados' : 'No hay productos disponibles'}</p>
              {onCrearNuevo && q.trim() && (
                <button type="button" onClick={() => { const texto = q.trim(); cerrar(); onCrearNuevo(texto); }} className="rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground">
                  Crear «{q.trim()}»
                </button>
              )}
            </div>
          ) : visibles.map(p => {
            const existencia = getExistencia?.(p);
            const tieneExistencia = existencia != null && Number.isFinite(Number(existencia));
            const abiertoAqui = abiertoId === p.id;
            const precioLista = precioDe(p, null);
            const ya = agregados?.has(p.id);
            return (
              <div key={p.id} className={cn('border-t border-border first:border-t-0', abiertoAqui && 'bg-primary/5')}>
                <button type="button" onClick={() => abrirProducto(p)} aria-expanded={abiertoAqui} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left">
                  {p.imagenUrl
                    ? <img src={p.imagenUrl} alt="" className="h-10 w-10 shrink-0 rounded-lg border border-border object-cover" loading="lazy" />
                    : <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-muted/50 text-[11px] font-bold text-muted-foreground">{iniciales(p.nombre)}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-primary">{p.nombre}</span>
                    <span className="block truncate text-xs text-muted-foreground tabular-nums">
                      {p.codigo}{conPrecio && getPrecio ? ` · ${fmt(precioLista)}` : ''}
                      {ya && <span className="font-semibold text-success"> · ✓ agregado</span>}
                    </span>
                  </span>
                  {tieneExistencia && (
                    <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums', Number(existencia) > 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive')}>
                      {fmtNum(Number(existencia))} {p.unidadExistencia || p.unidad || 'pz'}
                    </span>
                  )}
                </button>
                {abiertoAqui && (
                  <EditorRenglon
                    producto={p}
                    borrador={borrador}
                    setBorrador={setBorrador}
                    presentaciones={presentacionesDe(p)}
                    conPrecio={conPrecio}
                    puedeEditarPrecio={puedeEditarPrecio}
                    precioLabel={precioLabel}
                    existencia={tieneExistencia ? Number(existencia) : null}
                    fmt={fmt}
                    onPaso={pasoCantidad}
                    onPresentacion={pres => elegirPresentacion(p, pres)}
                    onAgregar={() => agregar(p)}
                  />
                )}
              </div>
            );
          })}
        </div>
        {filtrados.length > visibles.length && (
          <p className="px-2 py-3 text-center text-xs text-muted-foreground">
            Mostrando {visibles.length} de {filtrados.length}. Escribe para afinar la búsqueda.
          </p>
        )}
      </div>
    </div>
  );

  return (
    <>
      {boton}
      {createPortal(overlay, document.body)}
    </>
  );
}

function EditorRenglon<P extends ProductoBuscable>({ producto, borrador, setBorrador, presentaciones, conPrecio, puedeEditarPrecio, precioLabel, existencia, fmt, onPaso, onPresentacion, onAgregar }: {
  producto: P;
  borrador: Borrador;
  setBorrador: Dispatch<SetStateAction<Borrador>>;
  presentaciones: PresentacionBuscable[];
  conPrecio: boolean;
  puedeEditarPrecio: boolean;
  precioLabel: string;
  existencia: number | null;
  fmt: (v: number) => string;
  onPaso: (delta: number) => void;
  onPresentacion: (p: PresentacionBuscable | null) => void;
  onAgregar: () => void;
}) {
  const cantidad = parseNum(borrador.cantidad);
  const precio = parseNum(borrador.precio);
  const pres = presentaciones.find(x => x.id === borrador.presentacionId) ?? null;
  const factor = pres ? Number(pres.factor) : 1;
  const unidad = producto.unidad || 'pz';
  const valido = cantidad > 0 && (!conPrecio || precio >= 0);
  const subtotal = valido && conPrecio ? r2(cantidad * factor * precio) : 0;
  const idCant = `buscador-cant-${producto.id}`;
  const idPrecio = `buscador-precio-${producto.id}`;

  return (
    <div className="flex flex-col gap-2.5 px-3 pb-3 pt-1">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={idCant} className="text-xs font-semibold text-muted-foreground">Cantidad</label>
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Menos" onClick={() => onPaso(-1)} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground">
            <Minus className="h-4 w-4" />
          </button>
          <input
            id={idCant}
            inputMode="decimal"
            value={borrador.cantidad}
            onFocus={e => e.target.select()}
            onChange={e => setBorrador(b => ({ ...b, cantidad: e.target.value }))}
            className="h-10 w-16 rounded-lg border border-border bg-card text-center text-base font-bold tabular-nums text-foreground outline-none focus:border-primary"
          />
          <button type="button" aria-label="Más" onClick={() => onPaso(1)} className="grid h-10 w-10 place-items-center rounded-full border border-border bg-card text-foreground">
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>

      {presentaciones.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs font-semibold text-muted-foreground">Presentación</span>
          <div role="group" aria-label="Presentación" className="flex max-w-[70%] flex-wrap justify-end overflow-hidden rounded-lg border border-border">
            {[null, ...presentaciones].map(x => {
              const activo = (x?.id ?? null) === borrador.presentacionId;
              return (
                <button
                  key={x?.id ?? 'base'}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => onPresentacion(x)}
                  className={cn('px-2.5 py-2 text-xs font-semibold', activo ? 'bg-primary text-primary-foreground' : 'bg-card text-foreground')}
                >
                  {x ? `${x.nombre} (${fmtNum(Number(x.factor))})` : unidad}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {conPrecio && (
        <div className="flex items-center justify-between gap-3">
          <label htmlFor={idPrecio} className="text-xs font-semibold text-muted-foreground">{precioLabel} por {unidad}</label>
          {puedeEditarPrecio ? (
            <input
              id={idPrecio}
              inputMode="decimal"
              value={borrador.precio}
              onFocus={e => e.target.select()}
              onChange={e => setBorrador(b => ({ ...b, precio: e.target.value }))}
              className="h-10 w-28 rounded-lg border border-border bg-card px-2.5 text-right text-sm font-semibold tabular-nums text-foreground outline-none focus:border-primary"
            />
          ) : (
            <span className="text-sm font-semibold tabular-nums text-foreground">{fmt(Number.isFinite(precio) ? precio : 0)}</span>
          )}
        </div>
      )}

      <div className="flex items-center justify-between text-sm font-semibold tabular-nums">
        <span className="text-muted-foreground font-normal">
          {Number.isFinite(cantidad) ? fmtNum(cantidad) : '—'}{pres ? ` × ${pres.nombre} = ${fmtNum((Number.isFinite(cantidad) ? cantidad : 0) * factor)} ${unidad}` : ` ${unidad}`}
          {!conPrecio && existencia != null && ` · disponible ${fmtNum(existencia)}`}
        </span>
        {conPrecio && <span>{fmt(subtotal)}</span>}
      </div>

      <button
        type="button"
        onClick={onAgregar}
        disabled={!valido}
        className="h-11 rounded-lg bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
      >
        Agregar
      </button>
    </div>
  );
}

/**
 * Renglón ya agregado, compacto: nombre, «cant × presentación · precio» e
 * importe. Al tocarlo se despliega `children` (el editor del formulario).
 */
export function RenglonCompactoMovil({ nombre, detalle, importe, abierto, onToggle, children }: {
  nombre: ReactNode;
  detalle: ReactNode;
  importe?: ReactNode;
  abierto: boolean;
  onToggle: () => void;
  children?: ReactNode;
}) {
  return (
    <div className={cn('border-t border-border', abierto && 'bg-primary/5')}>
      <button type="button" onClick={onToggle} aria-expanded={abierto} className="flex w-full items-center gap-3 px-1 py-2.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{nombre}</span>
          <span className="block truncate text-xs text-muted-foreground tabular-nums">{detalle}</span>
        </span>
        {importe != null && <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{importe}</span>}
      </button>
      {abierto && <div className="px-1 pb-3">{children}</div>}
    </div>
  );
}
